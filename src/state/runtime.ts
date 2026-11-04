import { createStore, useStore } from '../lib/store';
import { apiUrl, errorMessage, refreshSession } from '../services/api/client';
import { adminApi, deviceApi, mqttApi } from '../services/api/endpoints';
import type { ActivityEvent, CommandState, ConnectionState, DeviceRuntime, ID, MqttMessage, MqttStatus, SimMode, TelemetrySample, Variable } from '../types/models';
import { decodePayload, toNumber } from '../utils';
import { hasPermission } from './auth';
import { applyLmsSync, receiveActivity, reloadWorkspace } from './studio';
import { toast } from './ui';

export type { CommandState, DeviceRuntime } from '../types/models';

/**
 * Live device data from Kokoon Backend:
 *   1. GET /mqtt/snapshot  → device states, latest values, recent history + messages
 *   2. GET /mqtt/stream    → Server-Sent Events (cookie-authenticated), scoped by the
 *                            server to devices this user owns
 * Commands go out with POST /mqtt/commands; a command is shown as pending until
 * the server reports the device's acknowledgement (or a timeout) over the stream.
 * Values are keyed by MQTT topic, so every widget bound to the same variable
 * stays in sync. Nothing here is persisted in the browser.
 */

export interface RuntimeState {
  values: Record<string, { value: unknown; at: number }>;
  history: Record<string, TelemetrySample[]>;
  messages: MqttMessage[];
  devices: Record<ID, DeviceRuntime>;
  commands: Record<string, CommandState>;
  /** State of the browser's live connection to the backend stream. */
  broker: ConnectionState;
  status: MqttStatus | null;
  simPaused: boolean;
  bootAt: number;
}

const HISTORY_LIMIT = 600;
const MESSAGE_LIMIT = 800;

const initial = (): RuntimeState => ({ values: {}, history: {}, messages: [], devices: {}, commands: {}, broker: 'disconnected', status: null, simPaused: false, bootAt: Date.now() });

export const runtime = createStore<RuntimeState>(initial());
export const useRuntime = <T,>(selector: (s: RuntimeState) => T): T => useStore(runtime, selector);

/* ============================================================== ingestion */

const seen = new Set<string>();
let buffer: MqttMessage[] = [];
let flushScheduled = false;

function enqueue(msg: MqttMessage) {
  if (seen.has(msg.id)) return;
  seen.add(msg.id);
  if (seen.size > 5000) seen.delete(seen.values().next().value as string);
  buffer.push(msg);
  if (!flushScheduled) {
    flushScheduled = true;
    setTimeout(flush, 0);
  }
}

function flush() {
  flushScheduled = false;
  const batch = buffer;
  buffer = [];
  if (!batch.length) return;
  const s = runtime.get();
  const values = { ...s.values };
  const history = { ...s.history };
  for (const m of batch) {
    if (m.direction !== 'in' || m.kind !== 'telemetry') continue;
    const value = decodePayload(m.payload);
    const prev = values[m.topic];
    if (!prev || prev.at <= m.at) values[m.topic] = { value, at: m.at };
    const n = typeof value === 'boolean' ? (value ? 1 : 0) : toNumber(value);
    if (n !== null) {
      const h = history[m.topic] ?? [];
      const nh = h.length >= HISTORY_LIMIT ? h.slice(h.length - HISTORY_LIMIT + 1) : h.slice();
      nh.push({ t: m.at, v: n });
      history[m.topic] = nh;
    }
  }
  let messages = s.messages.concat(batch);
  if (messages.length > MESSAGE_LIMIT) messages = messages.slice(messages.length - MESSAGE_LIMIT);
  runtime.set({ values, history, messages });
}

function applyCommand(topic: string, command: CommandState) {
  runtime.set((s) => ({
    commands: { ...s.commands, [topic]: command },
    messages: command.status === 'pending' ? s.messages : s.messages.map((m) => (m.id === command.messageId ? { ...m, status: command.status } : m)),
  }));
}

/* ================================================================== stream */

let es: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;
let running = false;

function setBroker(b: ConnectionState) {
  if (runtime.get().broker !== b) runtime.set({ broker: b });
}

function on<T>(source: EventSource, type: string, fn: (data: T) => void) {
  source.addEventListener(type, (ev) => {
    try {
      fn(JSON.parse((ev as MessageEvent<string>).data) as T);
    } catch (err) {
      console.error('[kokoon] bad stream event', type, err);
    }
  });
}

function openStream() {
  if (!running) return;
  es?.close();
  setBroker('connecting');
  const source = new EventSource(apiUrl(mqttApi.streamPath), { withCredentials: true });
  es = source;
  let opened = false;
  source.onopen = () => {
    attempts = 0;
    setBroker('connected');
    // The browser reopened the stream on its own (e.g. the server restarted): catch up on what we missed.
    if (opened) void loadSnapshot().catch(() => undefined);
    opened = true;
  };
  on<MqttMessage>(source, 'message', enqueue);
  on<{ deviceId: ID; runtime: DeviceRuntime }>(source, 'device', (d) => runtime.set((s) => ({ devices: { ...s.devices, [d.deviceId]: d.runtime } })));
  on<{ topic: string; command: CommandState }>(source, 'command', (c) => applyCommand(c.topic, c.command));
  on<ActivityEvent>(source, 'activity', receiveActivity);
  on<MqttStatus>(source, 'status', (st) => runtime.set({ status: st, simPaused: st.simulation.paused }));
  on<{ reason: string }>(source, 'workspace', () => void reloadWorkspace().catch(() => undefined));
  // The LMS re-synced a board's declared variables (Run / Upload there): refresh them here right away
  on<{ deviceId: ID; projectId: ID | null; removedVariableIds: ID[] }>(source, 'lms_sync', (e) => void applyLmsSync(e).catch(() => undefined));
  on<{ reason: string }>(source, 'reauth', () => {
    // The server closes the stream when the access token is about to expire; refresh, then reconnect.
    source.close();
    void reconnect(true);
  });
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) void reconnect(false);
    else setBroker('connecting'); // the browser retries on its own
  };
}

/** The stream closed: refresh the session (cookies), then reopen with backoff. */
async function reconnect(immediate: boolean) {
  if (!running) return;
  es?.close();
  es = null;
  setBroker('connecting');
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = immediate ? 0 : Math.min(1000 * 2 ** attempts, 15_000);
  attempts++;
  reconnectTimer = setTimeout(async () => {
    const ok = await refreshSession();
    if (!running) return;
    if (!ok) {
      setBroker('error');
      // api client emits "unauthenticated" on the next failing request; trigger one
      void mqttApi.snapshot(1).catch(() => undefined);
      return;
    }
    openStream();
    if (!immediate) void loadSnapshot().catch(() => undefined); // catch up on what we missed
  }, delay);
}

async function loadSnapshot() {
  const snap = await mqttApi.snapshot();
  snap.messages.forEach((m) => seen.add(m.id));
  runtime.set({
    values: snap.values,
    history: snap.history,
    messages: snap.messages.slice(-MESSAGE_LIMIT),
    devices: snap.devices,
    commands: snap.commands,
    status: snap.status,
    simPaused: snap.status.simulation.paused,
  });
}

export async function startRuntime(): Promise<void> {
  if (running) return;
  running = true;
  runtime.set({ ...initial(), bootAt: Date.now() });
  try {
    await loadSnapshot();
  } catch (err) {
    toast(`Live data unavailable: ${errorMessage(err)}`, 'error');
  }
  openStream();
}

export function stopRuntime() {
  running = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  es?.close();
  es = null;
  seen.clear();
  buffer = [];
  runtime.set(initial());
}

/* ================================================================ commands */

/**
 * Publish a command for a variable. The server picks the topic from the
 * variable, checks ownership and publishes; the widget shows "pending" until
 * the device acknowledges (SSE) — a publish alone is never shown as success.
 */
export async function sendCommand(variable: Variable, rawValue: unknown, _ctx: { projectId?: ID; source: string }): Promise<void> {
  const topic = variable.commandTopic;
  if (!topic) return;
  // optimistic "sending" state so the control reacts instantly
  applyCommand(topic, { status: 'pending', at: Date.now(), value: rawValue, messageId: `local-${Date.now()}` });
  try {
    const r = await mqttApi.command(variable.id, rawValue);
    enqueue(r.message);
    const cur = runtime.get().commands[topic];
    // don't overwrite an ack that already arrived over the stream
    if (!cur || cur.messageId.startsWith('local-') || (cur.messageId === r.command.messageId && cur.status === 'pending')) applyCommand(topic, r.command);
  } catch (err) {
    applyCommand(topic, { status: 'failed', at: Date.now(), value: rawValue, messageId: `local-${Date.now()}`, reason: errorMessage(err) });
  }
}

/** Free-form publish from the MQTT console (server enforces topic ownership and role). */
export async function publishRaw(topic: string, payload: string): Promise<boolean> {
  try {
    const r = await mqttApi.publish(topic, payload);
    enqueue(r.message);
    applyCommand(topic, r.command);
    return true;
  } catch (err) {
    toast(errorMessage(err), 'error');
    return false;
  }
}

/* ================================================================ controls */

/** The simulator is shared by all users: pausing it is an admin action. */
export async function setSimulationPaused(paused: boolean) {
  if (!hasPermission('mqtt:manage')) return toast('Only administrators can pause the shared simulation.', 'error');
  try {
    const st = await adminApi.setSimulation({ paused });
    runtime.set({ status: st, simPaused: st.simulation.paused });
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

export async function setSimulationInterval(intervalMs: number) {
  if (!hasPermission('mqtt:manage')) return toast('Only administrators can change the simulation interval.', 'error');
  try {
    const st = await adminApi.setSimulation({ intervalMs });
    runtime.set({ status: st });
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

export async function setDeviceSimMode(deviceId: ID, mode: SimMode): Promise<boolean> {
  try {
    await deviceApi.setSimulationMode(deviceId, mode);
    runtime.set((s) => (s.devices[deviceId] ? { devices: { ...s.devices, [deviceId]: { ...s.devices[deviceId], simMode: mode } } } : {}));
    return true;
  } catch (err) {
    toast(errorMessage(err), 'error');
    return false;
  }
}

/** Clears the console view only (history stays on the server). */
export function clearMessages() {
  runtime.set({ messages: [] });
}
