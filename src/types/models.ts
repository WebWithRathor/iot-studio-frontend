/**
 * Kokoon IoT Studio — shared domain model.
 *
 * These shapes are the integration contract with Kokoon Backend: the API
 * returns exactly these DTOs (string ids, epoch-ms timestamps).
 * Persisted configuration (projects, dashboards, widgets, variables, devices,
 * activity) lives in MongoDB on the server. Transient runtime state (current
 * values, telemetry history, MQTT messages, connection states) lives in
 * `state/runtime.ts`, fed by the server's snapshot + SSE stream. Nothing is
 * stored in browser storage.
 */

export type ID = string;

/* ------------------------------------------------------------------ users */

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'DEVELOPER' | 'USER';

/** Returned by the backend (`/auth/me`). Authorisation is enforced server-side; `permissions` only shapes the UI. */
export interface User {
  id: ID;
  name: string;
  email: string;
  role: Role;
  permissions: string[];
  initials: string;
  status: 'active' | 'disabled';
  /** `local` = IoT Studio sign-up / admin-created; `lms` = created by "Sign in with Kokoon LMS". */
  source: 'local' | 'lms';
  /** False while an LMS-created account has no password of its own (password sign-in is off). */
  passwordSet?: boolean;
  preferences: { onboardingDismissed: boolean };
  plan: Plan;
  createdAt: number;
  lastLoginAt: number | null;
}

/* ---------------------------------------------------------------- tokens */

/** FREE = every account, PLUS = bought online (10,000 tokens), PREMIUM = activated with a kit code (or set by an admin). */
export type Plan = 'FREE' | 'PLUS' | 'PREMIUM';

export const PLAN_LABELS: Record<Plan, string> = { FREE: 'Free', PLUS: 'Plus', PREMIUM: 'Premium' };

export interface TokenCosts {
  /** New project, including its first dashboard. */
  project: number;
  /** Each dashboard after a project's first. */
  dashboard: number;
  /** Each widget. */
  widget: number;
}

/** Build budget. Building costs tokens, deleting refunds them; `used` is derived from the workspace. */
export interface TokenState {
  plan: Plan;
  planAllowance: number;
  bonusTokens: number;
  allowance: number;
  used: number;
  available: number;
  breakdown: {
    projects: { count: number; tokens: number };
    dashboards: { count: number; tokens: number };
    widgets: { count: number; tokens: number; free: number };
  };
  costs: TokenCosts;
  plans: Record<Plan, number>;
}

/* --------------------------------------------------------- LMS references */

/**
 * A pointer to a program authored in the Kokoon LMS block editor.
 * IoT Studio never stores the program itself — only a reference, so the two
 * products keep independent project records.
 */
export interface LmsProgramRef {
  programId: string;
  name: string;
  version?: string;
  source: 'mock' | 'lms';
}

/* ---------------------------------------------------------------- devices */

export type DataType = 'boolean' | 'integer' | 'float' | 'string' | 'color' | 'json';

/** Device → Dashboard, Dashboard → Device, or both. */
export type Direction = 'telemetry' | 'command' | 'bidirectional';

export type ConnectionState =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'waiting'
  | 'auth_required'
  | 'error';

/** A variable a device advertises (firmware / LMS MQTT block declaration). */
export interface VariableTemplate {
  key: string;
  displayName: string;
  dataType: DataType;
  direction: Direction;
  unit?: string;
  min?: number;
  max?: number;
}

export interface Device {
  id: ID;
  name: string;
  /** MQTT client / hardware identity used in topics, e.g. `esp32-s3-demo-01`. */
  hardwareId: string;
  board: string;
  /** `studio` = registered in IoT Studio, `lms` = discovered from an LMS program. */
  origin: 'studio' | 'lms';
  /** Simulated devices are driven by the backend's demo simulator, never real hardware. */
  simulated: boolean;
  lmsProgram: LmsProgramRef | null;
  firmwareVersion?: string;
  capabilities: VariableTemplate[];
  /** Topic namespace assigned by the server; variables of this device must live under it. */
  topicPrefix: string;
  status: 'active' | 'disabled';
  createdAt: number;
}

/* -------------------------------------------------------------- variables */

/**
 * A logical variable used by dashboards. It is NOT the MQTT topic and NOT the
 * firmware variable — it maps onto them:
 *   logical variable  →  stateTopic / commandTopic  →  firmware variable (firmwareRef)
 */
export interface Variable {
  id: ID;
  projectId: ID;
  /** Identifier, unique per project, e.g. `led_state`. */
  key: string;
  displayName: string;
  dataType: DataType;
  direction: Direction;
  deviceId: ID | null;
  /** Topic the device publishes its value / reported state on. */
  stateTopic?: string;
  /** Topic the dashboard publishes commands on. */
  commandTopic?: string;
  unit?: string;
  min?: number;
  max?: number;
  /** Future link to the LMS MQTT block that implements this variable in firmware. */
  /** Set when the variable comes from an LMS "declare IoT variable" block. `declared: false` = the latest flashed program no longer declares it. */
  firmwareRef: { source: 'lms'; blockId: string; variableName: string; declared?: boolean } | null;
  createdAt: number;
}

/* ---------------------------------------------------------------- widgets */

export type WidgetType =
  | 'button'
  | 'toggle'
  | 'slider'
  | 'arc_slider'
  | 'color_wheel'
  | 'rotary'
  | 'stepper'
  | 'mode_selector'
  | 'momentary'
  | 'level_bar'
  | 'numeric'
  | 'text'
  | 'gauge'
  | 'progress'
  | 'status'
  | 'value_card'
  | 'line_chart'
  | 'area_chart'
  | 'bar_chart'
  | 'table'
  | 'label'
  | 'divider'
  | 'device_status'
  | 'event_log';

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetConfig {
  title: string;
  description?: string;
  showHeader?: boolean;
  visible?: boolean;
  color?: string;
  label?: string;
  unit?: string;
  precision?: number;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  onValue?: string;
  offValue?: string;
  onLabel?: string;
  offLabel?: string;
  pressValue?: string;
  /** Chart time window in seconds. */
  timeWindow?: number;
  samples?: number;
  text?: string;
  align?: 'left' | 'center';
  size?: 'sm' | 'md' | 'lg';
  deviceId?: ID;
  source?: 'variable' | 'messages';
  thresholdLow?: number;
  thresholdHigh?: number;
  /** Mode selector options: "Label=value, Label=value" or "A, B, C". */
  choices?: string;
}

/** Optional display mapping: shown = raw × scale + offset. */
export interface Binding {
  variableId: ID;
  scale?: number;
  offset?: number;
}

export interface Widget {
  /** Stable identifier — never an array index. */
  id: ID;
  type: WidgetType;
  layout: WidgetLayout;
  config: WidgetConfig;
  binding: Binding | null;
}

export interface Dashboard {
  id: ID;
  projectId: ID;
  name: string;
  widgets: Widget[];
  /** Server revision — sent back on save for optimistic concurrency. */
  revision: number;
  /** Widgets that cost no tokens (sample dashboards). */
  freeWidgets?: number;
  createdAt: number;
  updatedAt: number;
}

/* --------------------------------------------------------------- projects */

export interface ProjectSettings {
  density: 'compact' | 'comfortable';
  showWidgetHeaders: boolean;
}

export interface Project {
  id: ID;
  name: string;
  description: string;
  category: string;
  icon: string;
  accent: string;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
  /** Associations only — devices are shared records, never duplicated per project. */
  deviceIds: ID[];
  dashboardIds: ID[];
  defaultDashboardId: ID;
  lmsProgram: LmsProgramRef | null;
  settings: ProjectSettings;
  /** Sample project from the demo workspace: costs no tokens. */
  sample?: boolean;
}

/* --------------------------------------------------------------- activity */

export type ActivityType =
  | 'project.created'
  | 'project.updated'
  | 'project.duplicated'
  | 'project.imported'
  | 'dashboard.created'
  | 'dashboard.updated'
  | 'dashboard.deleted'
  | 'widget.added'
  | 'widget.removed'
  | 'binding.changed'
  | 'variable.created'
  | 'variable.updated'
  | 'variable.deleted'
  | 'device.created'
  | 'device.associated'
  | 'device.connected'
  | 'device.disconnected'
  | 'device.error'
  | 'telemetry.first'
  | 'command.published'
  | 'command.failed';

export interface ActivityEvent {
  id: ID;
  type: ActivityType;
  message: string;
  at: number;
  projectId?: ID | null;
  deviceId?: ID | null;
}

/* ------------------------------------------------------------------- MQTT */

export type MessageKind = 'telemetry' | 'command' | 'ack' | 'availability';
export type MessageStatus = 'received' | 'pending' | 'sent' | 'acknowledged' | 'failed';

export interface MqttMessage {
  id: ID;
  at: number;
  topic: string;
  /** `in` = device → platform, `out` = dashboard → device. */
  direction: 'in' | 'out';
  payload: string;
  kind: MessageKind;
  status: MessageStatus;
  deviceId: ID | null;
  /** True for messages of devices simulated by the backend demo simulator. */
  simulated: boolean;
  qos: 0 | 1;
  retain?: boolean;
  /** For acks: id of the command message this acknowledges (correlated by the server). */
  ackFor?: string;
}

export interface TelemetrySample {
  t: number;
  v: number;
}

/* -------------------------------------------------------- persisted root */

export interface StudioPreferences {
  simIntervalMs: number;
  onboardingDismissed: boolean;
}

export type SimMode = 'online' | 'offline' | 'error' | 'auth_required';

export interface DeviceRuntime {
  state: ConnectionState;
  lastSeen: number | null;
  since: number;
  messageCount: number;
  telemetrySeen: boolean;
  simMode?: SimMode;
}

export interface CommandState {
  status: 'pending' | 'acknowledged' | 'failed';
  at: number;
  ackAt?: number;
  value: unknown;
  messageId: string;
  reason?: string;
}

export interface MqttStatus {
  mode: 'simulated' | 'broker';
  transport: string;
  broker: ConnectionState;
  simulation: { enabled: boolean; paused: boolean; intervalMs: number };
  topicRoot: string;
}

export interface StudioData {
  schemaVersion: 1;
  projects: Project[];
  dashboards: Dashboard[];
  variables: Variable[];
  devices: Device[];
  activity: ActivityEvent[];
  preferences: StudioPreferences;
  /** Budget as of the last workspace load; live usage is recomputed client-side (state/tokens.ts). */
  tokens?: TokenState;
}
