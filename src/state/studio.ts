import { createStore, useStore } from '../lib/store';
import { chargedWidgets, computeUsage, DEFAULT_COSTS, formatTokens, graphCost } from '../lib/tokens';
import { ApiError, errorMessage } from '../services/api/client';
import { dashboardApi, deviceApi, projectApi, userApi, variableApi, type ProjectGraph, type VariablePayload } from '../services/api/endpoints';
import { sandboxPrefix, suggestTopics, validateTopic } from '../services/mqtt/topics';
import type { ActivityEvent, Dashboard, DataType, Device, Direction, ID, LmsProgramRef, Project, ProjectSettings, StudioData, TokenState, Variable, Widget } from '../types/models';
import { auth, tokensEnabled } from './auth';
import { showTokenPrompt, toast } from './ui';

/**
 * Workspace state, backed by Kokoon Backend.
 *
 *   - load:      GET /users/me/workspace (replaces the old localStorage load)
 *   - create / delete / rename: awaited API calls; the UI shows the SERVER's
 *     record and only reports success after the server confirmed it
 *   - dashboard editing (drag, resize, config, undo/redo) stays instant: the
 *     editor updates locally and a debounced PUT saves the whole widget list
 *     with the dashboard revision; the save indicator shows Saving / Saved /
 *     Save failed (with Retry) — it never claims a save the server rejected
 *   - activity arrives from the server over the live stream (runtime.ts)
 * Nothing is persisted in browser storage.
 */

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

interface History {
  past: Widget[][];
  future: Widget[][];
}

export interface StudioState extends StudioData {
  ready: boolean;
  loadError: string | null;
  save: { status: SaveStatus; at: number | null; error?: string; conflict?: boolean };
  history: Record<ID, History>;
}

const emptyData = (): StudioData => ({
  schemaVersion: 1,
  projects: [],
  dashboards: [],
  variables: [],
  devices: [],
  activity: [],
  preferences: { simIntervalMs: 2000, onboardingDismissed: false },
});

export const studio = createStore<StudioState>({ ...emptyData(), ready: false, loadError: null, save: { status: 'saved', at: null }, history: {} });
export const useStudio = <T,>(selector: (s: StudioState) => T): T => useStore(studio, selector);

export const ACCENTS: Record<string, { label: string; var: string }> = {
  indigo: { label: 'Indigo', var: 'var(--accent-indigo)' },
  lime: { label: 'Lime', var: 'var(--accent-lime)' },
  ink: { label: 'Ink', var: 'var(--accent-ink)' },
  blue: { label: 'Blue', var: 'var(--accent-blue)' },
  rose: { label: 'Rose', var: 'var(--accent-rose)' },
  amber: { label: 'Amber', var: 'var(--accent-amber)' },
};

export const CATEGORIES = ['Smart Home', 'Environment', 'Agriculture', 'Robotics', 'Lighting', 'Energy', 'Custom'];

/* ================================================================ loading */

function applyWorkspace(data: StudioData) {
  studio.set({ ...data, ready: true, loadError: null, history: {}, save: { status: 'saved', at: Date.now() } });
}

export async function initStudio(): Promise<void> {
  studio.set({ ready: false, loadError: null });
  try {
    applyWorkspace(await userApi.workspace());
  } catch (err) {
    studio.set({ ready: false, loadError: errorMessage(err) });
    throw err;
  }
}

/** Reload the workspace from the server (after a conflict or an admin change). */
export async function reloadWorkspace(): Promise<void> {
  pendingSaves.forEach((p) => p.timer && clearTimeout(p.timer));
  pendingSaves.clear();
  applyWorkspace(await userApi.workspace());
  studio.set({ history: {}, save: { status: 'saved', at: Date.now() } });
}

export function resetStudio() {
  pendingSaves.forEach((p) => p.timer && clearTimeout(p.timer));
  pendingSaves.clear();
  studio.set({ ...emptyData(), tokens: undefined, ready: false, loadError: null, history: {}, save: { status: 'saved', at: null } });
}

export async function resetDemoData(): Promise<void> {
  const data = await userApi.resetDemo();
  pendingSaves.clear();
  applyWorkspace(data);
}

/* ================================================================ tokens */

/** Live budget: allowance from the server, usage recomputed from the local workspace (instant in the editor). */
export function tokenBudget(s: Pick<StudioState, 'projects' | 'dashboards' | 'tokens'> = studio.get()) {
  const costs = s.tokens?.costs ?? DEFAULT_COSTS;
  const { used, breakdown } = computeUsage(s.projects, s.dashboards, costs);
  const allowance = s.tokens?.allowance ?? Infinity;
  const plans = s.tokens?.plans ?? { FREE: 1000, PLUS: 10_000, PREMIUM: 50_000 };
  return { plan: s.tokens?.plan ?? 'FREE', allowance, used, available: Math.max(0, allowance - used), breakdown, costs, plans, bonusTokens: s.tokens?.bonusTokens ?? 0, known: Boolean(s.tokens) };
}

export function useTokenBudget() {
  const projects = useStudio((s) => s.projects);
  const dashboards = useStudio((s) => s.dashboards);
  const tokens = useStudio((s) => s.tokens);
  return tokenBudget({ projects, dashboards, tokens });
}

/** True when `cost` more tokens fit; otherwise opens the "not enough tokens" prompt and returns false. */
export function ensureTokens(cost: number, action: string): boolean {
  if (cost <= 0 || !tokensEnabled()) return true;
  const b = tokenBudget();
  if (b.used + cost <= b.allowance) return true;
  showTokenPrompt({ action, needed: cost, available: b.available });
  return false;
}

const tokenError = (cost: number, action: string) =>
  new ApiError(402, 'INSUFFICIENT_TOKENS', `Not enough tokens to ${action}: it needs ${formatTokens(cost)} and you have ${formatTokens(tokenBudget().available)} left.`);

/** Token cost of replacing a dashboard's widgets (only growth is charged). */
export function widgetChangeCost(d: Pick<Dashboard, 'widgets' | 'freeWidgets'>, next: Widget[]) {
  const n = chargedWidgets(next.length, d.freeWidgets) - chargedWidgets(d.widgets.length, d.freeWidgets);
  return Math.max(0, n) * tokenBudget().costs.widget;
}

export function setTokenState(tokens: TokenState) {
  studio.set({ tokens });
}

export async function refreshTokens(): Promise<TokenState | null> {
  try {
    const t = await userApi.tokens();
    setTokenState(t);
    return t;
  } catch {
    return null;
  }
}

/* ============================================================== activity */

/** Activity comes from the server (SSE). This merges one event into the store. */
export function receiveActivity(e: ActivityEvent) {
  studio.set((s) => {
    if (s.activity.some((a) => a.id === e.id)) return {};
    return {
      activity: [e, ...s.activity].slice(0, 400),
      projects: e.projectId ? s.projects.map((p) => (p.id === e.projectId ? { ...p, lastActivityAt: Math.max(p.lastActivityAt, e.at) } : p)) : s.projects,
    };
  });
}

/* ================================================================ helpers */

const isTokenError = (err: unknown) => err instanceof ApiError && err.code === 'INSUFFICIENT_TOKENS';

let inflight = 0;
/** Wrap a server mutation: drives the save indicator and turns failures into a toast + rethrow. */
async function mutate<T>(fn: () => Promise<T>, opts: { quiet?: boolean } = {}): Promise<T> {
  inflight++;
  studio.set((s) => ({ save: { ...s.save, status: 'saving' } }));
  try {
    const r = await fn();
    inflight--;
    if (!inflight && !pendingSaves.size) studio.set({ save: { status: 'saved', at: Date.now() } });
    return r;
  } catch (err) {
    inflight--;
    studio.set((s) => ({ save: { status: pendingSaves.size ? s.save.status : 'saved', at: s.save.at } }));
    if (isTokenError(err)) {
      // Our local estimate was out of date (e.g. a change in another tab): sync the budget and explain.
      void refreshTokens();
      const d = (err as ApiError).details as { required?: number; available?: number } | undefined;
      showTokenPrompt({ action: 'do that', needed: d?.required ?? 0, available: d?.available ?? 0, message: (err as ApiError).message });
    } else if (!opts.quiet) toast(errorMessage(err), 'error');
    throw err;
  }
}

function mergeGraph(g: ProjectGraph) {
  studio.set((s) => ({
    projects: [g.project, ...s.projects.filter((p) => p.id !== g.project.id)],
    dashboards: [...s.dashboards.filter((d) => d.projectId !== g.project.id), ...g.dashboards],
    variables: [...s.variables.filter((v) => v.projectId !== g.project.id), ...g.variables],
  }));
}

const replaceProject = (p: Project) => studio.set((s) => ({ projects: s.projects.map((x) => (x.id === p.id ? p : x)) }));

/* ================================================================ projects */

export interface ProjectInput {
  name: string;
  description: string;
  category: string;
  icon: string;
  accent: string;
  deviceIds: ID[];
  lmsProgram: LmsProgramRef | null;
  importVariables: boolean;
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const cost = tokenBudget().costs.project;
  if (!ensureTokens(cost, 'create a project')) throw tokenError(cost, 'create a project');
  const g = await mutate(() => projectApi.create({ ...input, name: input.name.trim(), description: input.description.trim() }), { quiet: true });
  mergeGraph(g);
  return g.project;
}

/** Optimistic update; rolled back (with an error toast) if the server rejects it. */
export async function updateProject(id: ID, patch: Partial<Pick<Project, 'name' | 'description' | 'category' | 'icon' | 'accent' | 'lmsProgram'>> & { settings?: ProjectSettings; defaultDashboardId?: ID }): Promise<Project | null> {
  const before = studio.get().projects.find((p) => p.id === id);
  if (!before) return null;
  replaceProject({ ...before, ...patch });
  try {
    const saved = await mutate(() => projectApi.update(id, patch));
    replaceProject(saved);
    return saved;
  } catch {
    replaceProject(before);
    return null;
  }
}

/** Resolves to the export bundle, or null when the server rejected it (error toast already shown). */
export async function exportProject(id: ID): Promise<unknown> {
  try {
    return await mutate(() => projectApi.exportBundle(id));
  } catch {
    return null;
  }
}

export async function duplicateProject(id: ID): Promise<Project | null> {
  const dashes = studio.get().dashboards.filter((d) => d.projectId === id);
  if (!ensureTokens(graphCost(dashes.map((d) => d.widgets.length), tokenBudget().costs), 'duplicate this project')) return null;
  try {
    const g = await mutate(() => projectApi.duplicate(id));
    mergeGraph(g);
    return g.project;
  } catch {
    return null;
  }
}

export async function importProject(json: string): Promise<{ project?: Project; error?: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { error: 'That file is not valid JSON.' };
  }
  const bundleDashes = (parsed as { dashboards?: { widgets?: unknown[] }[] } | null)?.dashboards;
  if (Array.isArray(bundleDashes)) {
    const cost = graphCost(bundleDashes.map((d) => (Array.isArray(d?.widgets) ? d.widgets.length : 0)), tokenBudget().costs);
    if (!ensureTokens(cost, 'import this project')) return { error: `Importing this project needs ${formatTokens(cost)} tokens.` };
  }
  try {
    const g = await mutate(() => projectApi.importBundle(parsed), { quiet: true });
    mergeGraph(g);
    return { project: g.project };
  } catch (err) {
    return { error: err instanceof ApiError && err.code === 'VALIDATION_ERROR' ? 'That file is not a Kokoon IoT Studio project export.' : errorMessage(err) };
  }
}

export async function deleteProject(id: ID): Promise<boolean> {
  try {
    await mutate(() => projectApi.remove(id));
  } catch {
    return false;
  }
  studio.set((s) => {
    const history = { ...s.history };
    s.dashboards.filter((d) => d.projectId === id).forEach((d) => {
      delete history[d.id];
      pendingSaves.delete(d.id);
    });
    return {
      projects: s.projects.filter((p) => p.id !== id),
      dashboards: s.dashboards.filter((d) => d.projectId !== id),
      variables: s.variables.filter((v) => v.projectId !== id),
      activity: s.activity.filter((a) => a.projectId !== id),
      history,
    };
  });
  return true;
}

/* =============================================================== dashboards */

export async function createDashboard(projectId: ID, name: string): Promise<Dashboard | null> {
  const hasOne = studio.get().dashboards.some((d) => d.projectId === projectId);
  if (hasOne && !ensureTokens(tokenBudget().costs.dashboard, 'add a dashboard')) return null;
  try {
    const r = await mutate(() => dashboardApi.create(projectId, name.trim() || 'Untitled dashboard'));
    studio.set((s) => ({ dashboards: [...s.dashboards, r.dashboard] }));
    replaceProject(r.project);
    return r.dashboard;
  } catch {
    return null;
  }
}

export async function renameDashboard(id: ID, name: string): Promise<void> {
  const d = studio.get().dashboards.find((x) => x.id === id);
  if (!d || !name.trim() || name.trim() === d.name) return;
  studio.set((s) => ({ dashboards: s.dashboards.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)) }));
  try {
    const saved = await mutate(() => dashboardApi.rename(id, name.trim()));
    studio.set((s) => ({ dashboards: s.dashboards.map((x) => (x.id === id ? { ...x, name: saved.name, updatedAt: saved.updatedAt } : x)) }));
  } catch {
    studio.set((s) => ({ dashboards: s.dashboards.map((x) => (x.id === id ? { ...x, name: d.name } : x)) }));
  }
}

export async function deleteDashboard(id: ID): Promise<boolean> {
  try {
    const project = await mutate(() => dashboardApi.remove(id));
    pendingSaves.delete(id);
    studio.set((s) => ({ dashboards: s.dashboards.filter((x) => x.id !== id) }));
    replaceProject(project);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------ editor saves (debounced) */

interface PendingSave {
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  dirty: boolean;
}
const pendingSaves = new Map<ID, PendingSave>();
const SAVE_DEBOUNCE_MS = 600;

function scheduleSave(dashId: ID, delay = SAVE_DEBOUNCE_MS) {
  const p = pendingSaves.get(dashId) ?? { timer: null, running: false, dirty: false };
  p.dirty = true;
  if (p.timer) clearTimeout(p.timer);
  p.timer = setTimeout(() => void flushDashboard(dashId), delay);
  pendingSaves.set(dashId, p);
  studio.set((s) => ({ save: { ...s.save, status: 'unsaved', error: undefined, conflict: false } }));
}

async function flushDashboard(dashId: ID): Promise<void> {
  const p = pendingSaves.get(dashId);
  if (!p) return;
  if (p.running) {
    p.dirty = true;
    return; // re-run after the current save completes
  }
  const d = studio.get().dashboards.find((x) => x.id === dashId);
  if (!d) {
    pendingSaves.delete(dashId);
    return;
  }
  p.timer = null;
  p.dirty = false;
  p.running = true;
  const sent = d.widgets;
  studio.set((s) => ({ save: { ...s.save, status: 'saving' } }));
  try {
    const saved = await dashboardApi.saveWidgets(dashId, sent, d.revision);
    studio.set((s) => ({
      dashboards: s.dashboards.map((x) =>
        x.id === dashId
          ? // keep local edits made while the request was in flight; adopt the server's revision
            { ...x, revision: saved.revision, updatedAt: saved.updatedAt, widgets: x.widgets === sent ? saved.widgets : x.widgets }
          : x,
      ),
      projects: s.projects.map((pr) => (pr.id === d.projectId ? { ...pr, updatedAt: saved.updatedAt } : pr)),
    }));
    p.running = false;
    if (p.dirty) return void flushDashboard(dashId);
    pendingSaves.delete(dashId);
    if (!pendingSaves.size && !inflight) studio.set({ save: { status: 'saved', at: Date.now() } });
  } catch (err) {
    p.running = false;
    const tokens = isTokenError(err);
    // A token refusal can't be fixed by retrying the same layout: offer Reload (back to the last saved version).
    const conflict = tokens || (err instanceof ApiError && err.code === 'REVISION_CONFLICT');
    studio.set({ save: { status: 'error', at: studio.get().save.at, error: errorMessage(err), conflict } });
    if (tokens) {
      void refreshTokens();
      const det = (err as ApiError).details as { required?: number; available?: number } | undefined;
      showTokenPrompt({ action: 'save this dashboard', needed: det?.required ?? 0, available: det?.available ?? 0, message: errorMessage(err) });
    } else toast(conflict ? 'This dashboard changed in another tab. Reload to continue editing.' : `Save failed: ${errorMessage(err)}`, 'error');
  }
}

/** Retry every failed/pending dashboard save. */
export function retrySave() {
  for (const id of pendingSaves.keys()) void flushDashboard(id);
}

export const hasUnsavedChanges = () => pendingSaves.size > 0 || inflight > 0;

/**
 * Replace a dashboard's widgets locally (instant) and schedule a server save. `record` pushes onto the undo stack.
 * Returns false (and changes nothing) when the change needs more tokens than are left.
 */
export function setWidgets(dashId: ID, widgets: Widget[], opts: { record?: boolean } = {}): boolean {
  const s = studio.get();
  const d = s.dashboards.find((x) => x.id === dashId);
  if (!d) return false;
  const added = widgets.length - d.widgets.length;
  if (!ensureTokens(widgetChangeCost(d, widgets), added > 1 ? `add ${added} widgets` : 'add this widget')) return false;
  const history = { ...s.history };
  if (opts.record !== false) {
    const h = history[dashId] ?? { past: [], future: [] };
    history[dashId] = { past: [...h.past, d.widgets].slice(-60), future: [] };
  }
  studio.set({ dashboards: s.dashboards.map((x) => (x.id === dashId ? { ...x, widgets } : x)), history });
  scheduleSave(dashId);
  return true;
}

export function undo(dashId: ID): boolean {
  const s = studio.get();
  const h = s.history[dashId];
  const d = s.dashboards.find((x) => x.id === dashId);
  if (!h || !h.past.length || !d) return false;
  const prev = h.past[h.past.length - 1];
  if (!ensureTokens(widgetChangeCost(d, prev), 'undo (it brings widgets back)')) return false;
  studio.set({
    dashboards: s.dashboards.map((x) => (x.id === dashId ? { ...x, widgets: prev } : x)),
    history: { ...s.history, [dashId]: { past: h.past.slice(0, -1), future: [d.widgets, ...h.future] } },
  });
  scheduleSave(dashId);
  return true;
}

export function redo(dashId: ID): boolean {
  const s = studio.get();
  const h = s.history[dashId];
  const d = s.dashboards.find((x) => x.id === dashId);
  if (!h || !h.future.length || !d) return false;
  const next = h.future[0];
  if (!ensureTokens(widgetChangeCost(d, next), 'redo (it adds widgets)')) return false;
  studio.set({
    dashboards: s.dashboards.map((x) => (x.id === dashId ? { ...x, widgets: next } : x)),
    history: { ...s.history, [dashId]: { past: [...h.past, d.widgets], future: h.future.slice(1) } },
  });
  scheduleSave(dashId);
  return true;
}

/* ================================================================ variables */

export interface VariableInput {
  key: string;
  displayName: string;
  dataType: DataType;
  direction: Direction;
  deviceId: ID | null;
  stateTopic?: string;
  commandTopic?: string;
  unit?: string;
  min?: number;
  max?: number;
}

export type VariableErrors = Partial<Record<keyof VariableInput | 'form', string>>;

/** Instant client-side checks for good UX. The server re-validates everything. */
export function validateVariable(input: VariableInput, projectId: ID, excludeId?: ID): VariableErrors {
  const errors: VariableErrors = {};
  const others = studio.get().variables.filter((v) => v.projectId === projectId && v.id !== excludeId);
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(input.key)) errors.key = 'Use lowercase letters, digits and “_”, starting with a letter (e.g. led_state).';
  else if (others.some((v) => v.key === input.key)) errors.key = `“${input.key}” is already used in this project. Identifiers must be unique.`;
  if (!input.displayName.trim()) errors.displayName = 'Give the variable a display name.';
  if (input.direction !== 'command') {
    const e = validateTopic(input.stateTopic ?? '');
    if (e) errors.stateTopic = e;
  }
  if (input.direction !== 'telemetry') {
    const e = validateTopic(input.commandTopic ?? '');
    if (e) errors.commandTopic = e;
    else if (input.commandTopic === input.stateTopic) errors.commandTopic = 'Use a different topic for commands than for reported values.';
  }
  if (input.min !== undefined && input.max !== undefined && input.min >= input.max) errors.max = 'Maximum must be greater than minimum.';
  return errors;
}

function normalise(input: VariableInput): VariablePayload {
  return {
    ...input,
    key: input.key.trim(),
    displayName: input.displayName.trim(),
    stateTopic: input.direction === 'command' ? undefined : input.stateTopic?.trim(),
    commandTopic: input.direction === 'telemetry' ? undefined : input.commandTopic?.trim(),
    unit: input.unit?.trim() || undefined,
  };
}

/** Map a server rejection onto form fields. */
function serverErrors(err: unknown): VariableErrors {
  if (err instanceof ApiError) {
    const fe = err.fieldErrors;
    if (Object.keys(fe).length) return fe as VariableErrors;
    return { form: err.message };
  }
  return { form: errorMessage(err) };
}

export async function createVariable(projectId: ID, raw: VariableInput): Promise<{ variable?: Variable; errors?: VariableErrors }> {
  const errors = validateVariable(raw, projectId);
  if (Object.keys(errors).length) return { errors };
  try {
    const variable = await mutate(() => variableApi.create(projectId, normalise(raw)), { quiet: true });
    studio.set((s) => ({ variables: [...s.variables, variable] }));
    return { variable };
  } catch (err) {
    return { errors: serverErrors(err) };
  }
}

export async function updateVariable(id: ID, raw: VariableInput): Promise<{ errors?: VariableErrors }> {
  const existing = studio.get().variables.find((v) => v.id === id);
  if (!existing) return { errors: { form: 'Variable not found.' } };
  const errors = validateVariable(raw, existing.projectId, id);
  if (Object.keys(errors).length) return { errors };
  try {
    const saved = await mutate(() => variableApi.update(id, normalise(raw)), { quiet: true });
    studio.set((s) => ({ variables: s.variables.map((v) => (v.id === id ? saved : v)) }));
    return {};
  } catch (err) {
    return { errors: serverErrors(err) };
  }
}

export function bindingCount(variableId: ID, dashboards = studio.get().dashboards): number {
  return dashboards.reduce((n, d) => n + d.widgets.filter((w) => w.binding?.variableId === variableId).length, 0);
}

/** The server unbinds widgets that used the variable; mirror that locally. */
export async function deleteVariable(id: ID): Promise<boolean> {
  try {
    await mutate(() => variableApi.remove(id));
  } catch {
    return false;
  }
  studio.set((s) => ({
    variables: s.variables.filter((x) => x.id !== id),
    dashboards: unbindLocally(s.dashboards, [id]),
  }));
  return true;
}

/** Mirror the server unbinding these variables from widgets (it bumps each touched dashboard's revision once per variable). */
const unbindLocally = (dashboards: Dashboard[], ids: ID[]) =>
  ids.reduce(
    (ds, id) =>
      ds.map((d) =>
        d.widgets.some((w) => w.binding?.variableId === id) ? { ...d, revision: d.revision + 1, widgets: d.widgets.map((w) => (w.binding?.variableId === id ? { ...w, binding: null } : w)) } : d,
      ),
    dashboards,
  );

let lmsSyncRun: Promise<void> | null = null;
let lmsSyncAgain = false;

/**
 * The LMS re-synced a board (Run / Upload in the block editor): take the server's
 * devices, projects and variables now, so an open dashboard shows the new
 * declarations (direction, type, renamed or removed keys) without a reload.
 * Dashboards are kept as edited here (unsaved edits survive); only the widgets
 * bound to removed variables are unbound, as the server did.
 */
export function applyLmsSync(e: { removedVariableIds: ID[] }): Promise<void> {
  if (e.removedVariableIds.length) studio.set((s) => ({ dashboards: unbindLocally(s.dashboards, e.removedVariableIds) }));
  if (lmsSyncRun) {
    lmsSyncAgain = true; // a burst of syncs: one more fetch after the current one
    return lmsSyncRun;
  }
  lmsSyncRun = (async () => {
    try {
      do {
        lmsSyncAgain = false;
        const w = await userApi.workspace();
        studio.set((s) => {
          const known = new Set(s.projects.map((p) => p.id));
          return {
            devices: w.devices,
            projects: w.projects,
            variables: w.variables,
            // A project the LMS just created comes with its dashboards
            dashboards: [...s.dashboards.filter((d) => w.projects.some((p) => p.id === d.projectId)), ...w.dashboards.filter((d) => !known.has(d.projectId))],
          };
        });
      } while (lmsSyncAgain);
    } finally {
      lmsSyncRun = null;
    }
  })();
  return lmsSyncRun;
}

export async function importDeviceVariable(projectId: ID, deviceId: ID, key: string): Promise<Variable | null> {
  try {
    const v = await mutate(() => variableApi.importFromDevice(projectId, deviceId, key));
    studio.set((s) => ({ variables: s.variables.some((x) => x.id === v.id) ? s.variables : [...s.variables, v] }));
    return v;
  } catch {
    return null;
  }
}

/** Topic suggestions inside the device's server-assigned namespace (or the user's sandbox). */
export function suggestVariableTopics(deviceId: ID | null, key: string, direction: Direction, topicRoot = 'kokoon/devices') {
  const d = studio.get().devices.find((x) => x.id === deviceId);
  const prefix = d ? d.topicPrefix : sandboxPrefix(topicRoot, auth.get().user?.id ?? 'me');
  return suggestTopics(prefix, key || 'variable', direction);
}

/* ================================================================== devices */

export async function createSimulatedDevice(input: { name: string; board: string; kit: string; projectIds: ID[] }): Promise<Device | null> {
  try {
    const r = await mutate(() => deviceApi.createSimulated({ ...input, name: input.name.trim() }));
    studio.set((s) => ({
      devices: [...s.devices, r.device],
      projects: s.projects.map((p) => (r.projectIds.includes(p.id) && !p.deviceIds.includes(r.device.id) ? { ...p, deviceIds: [...p.deviceIds, r.device.id] } : p)),
    }));
    return r.device;
  } catch {
    return null;
  }
}

export async function renameDevice(id: ID, name: string): Promise<void> {
  if (!name.trim()) return;
  try {
    const d = await mutate(() => deviceApi.rename(id, name.trim()));
    studio.set((s) => ({ devices: s.devices.map((x) => (x.id === id ? d : x)) }));
  } catch {
    /* toast shown by mutate */
  }
}

export async function setProjectDevice(projectId: ID, deviceId: ID, associated: boolean): Promise<boolean> {
  try {
    const p = await mutate(() => (associated ? projectApi.associateDevice(projectId, deviceId) : projectApi.dissociateDevice(projectId, deviceId)));
    replaceProject(p);
    return true;
  } catch {
    return false;
  }
}

/* ============================================================== preferences */

export async function dismissOnboarding(): Promise<void> {
  studio.set((s) => ({ preferences: { ...s.preferences, onboardingDismissed: true } }));
  try {
    await userApi.updatePreferences({ onboardingDismissed: true });
  } catch (err) {
    studio.set((s) => ({ preferences: { ...s.preferences, onboardingDismissed: false } }));
    toast(errorMessage(err), 'error');
  }
}
