import { useEffect, useRef, useState } from 'react';
import { createStore, useStore } from '../lib/store';
import { useRuntime, type CommandState } from '../state/runtime';
import { useStudio } from '../state/studio';
import type { ConnectionState, Device, TelemetrySample, Variable, Widget } from '../types/models';

/** Global clock so relative times ("12s ago") re-render without per-component timers. */
const clock = createStore({ now: Date.now() });
setInterval(() => clock.set({ now: Date.now() }), 5000);
export const useNow = () => useStore(clock, (s) => s.now);

export type ValueStatus = 'unbound' | 'missing' | 'waiting' | 'live' | 'offline' | 'real-hw';

export interface BoundValue {
  variable: Variable | null;
  device: Device | null;
  topic: string | null;
  value: unknown;
  at: number | null;
  status: ValueStatus;
  deviceState: ConnectionState | null;
  command: CommandState | null;
}

export function useBoundValue(widget: Widget): BoundValue {
  const variable = useStudio((s) => (widget.binding ? s.variables.find((v) => v.id === widget.binding!.variableId) ?? null : null));
  const device = useStudio((s) => (variable?.deviceId ? s.devices.find((d) => d.id === variable.deviceId) ?? null : null));
  const topic = variable ? variable.stateTopic ?? variable.commandTopic ?? null : null;
  const entry = useRuntime((s) => (topic ? s.values[topic] : undefined));
  const deviceState = useRuntime((s) => (device ? s.devices[device.id]?.state ?? null : null));
  const command = useRuntime((s) => (variable?.commandTopic ? s.commands[variable.commandTopic] ?? null : null));
  // Real boards only go unheard while the server runs without a broker (demo mode)
  const brokerMode = useRuntime((s) => s.status?.mode === 'broker');

  let status: ValueStatus;
  if (!widget.binding) status = 'unbound';
  else if (!variable) status = 'missing';
  else if (device && !device.simulated && !brokerMode) status = 'real-hw';
  else if (deviceState && ['disconnected', 'error', 'auth_required'].includes(deviceState)) status = 'offline';
  else if (!entry) status = 'waiting';
  else status = 'live';

  let value = entry?.value;
  const b = widget.binding;
  if (b && typeof value === 'number' && (b.scale !== undefined || b.offset !== undefined)) {
    value = value * (b.scale ?? 1) + (b.offset ?? 0);
  }
  return { variable, device, topic, value, at: entry?.at ?? null, status, deviceState, command };
}

export function useHistory(topic: string | null, windowSec?: number, max?: number): TelemetrySample[] {
  const h = useRuntime((s) => (topic ? s.history[topic] : undefined));
  const now = Date.now();
  if (!h) return [];
  let out = windowSec ? h.filter((p) => p.t >= now - windowSec * 1000) : h;
  if (max && out.length > max) out = out.slice(out.length - max);
  return out;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Animate a number toward `target` (ease-out cubic, `ms` long, retargets
 * smoothly mid-flight). `instant` snaps — used while the user is dragging so
 * the control tracks the pointer exactly. One value drives every part of a
 * dial (arc, handle, number) so they can never drift apart.
 */
export function useTween(target: number, opts: { instant?: boolean; ms?: number } = {}): number {
  const { instant = false, ms = 420 } = opts;
  const [value, setValue] = useState(target);
  const current = useRef(target);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (instant || reducedMotion() || !Number.isFinite(target) || Math.abs(target - current.current) < 1e-6) {
      current.current = target;
      setValue(target);
      return;
    }
    const from = current.current;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      current.current = from + (target - from) * eased;
      setValue(current.current);
      frame.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [target, instant, ms]);
  return value;
}

/** Track an element's content size. */
export function useSize<T extends HTMLElement>(): [{ current: T | null }, { w: number; h: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setSize((s) => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
