/**
 * Typed Kokoon Backend endpoints. Every URL the app calls is listed here —
 * components never build URLs themselves.
 */
import type {
  ActivityEvent, CommandState, Dashboard, DataType, Device, DeviceRuntime, Direction, ID, LmsProgramRef, MqttMessage, MqttStatus, Plan, Project, ProjectSettings,
  SimMode, StudioData, TelemetrySample, TokenState, User, Variable, Widget,
} from '../../types/models';
import { del, get, patch, post, put, qs } from './client';

export interface AuthConfig {
  registrationEnabled: boolean;
  demoWorkspaceOnSignup: boolean;
  mqttMode: 'simulated' | 'broker';
  /** "Sign in with Kokoon LMS" — startUrl is the LMS page that signs the student in and posts back. */
  lmsSso?: { enabled: boolean; startUrl: string | null };
}

export interface ProjectGraph {
  project: Project;
  dashboards: Dashboard[];
  variables: Variable[];
}

export interface VariablePayload {
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

export interface Snapshot {
  status: MqttStatus;
  values: Record<string, { value: unknown; at: number }>;
  history: Record<string, TelemetrySample[]>;
  messages: MqttMessage[];
  devices: Record<ID, DeviceRuntime>;
  commands: Record<string, CommandState>;
  serverTime: number;
}

export const authApi = {
  config: () => get<AuthConfig>('/auth/config'),
  me: () => get<{ user: User; session: { accessExpiresAt: number } }>('/auth/me'),
  login: (email: string, password: string) => post<{ user: User }>('/auth/login', { email, password }),
  register: (name: string, email: string, password: string) => post<{ user: User }>('/auth/register', { name, email, password }),
  logout: () => post<{ signedOut: boolean }>('/auth/logout', {}),
};

export const userApi = {
  workspace: () => get<StudioData>('/users/me/workspace'),
  tokens: () => get<TokenState>('/users/me/tokens'),
  redeemKit: (code: string) => post<{ tokens: TokenState; upgraded: boolean }>('/users/me/redeem-kit', { code }),
  updatePreferences: (prefs: { onboardingDismissed?: boolean }) => patch<User>('/users/me/preferences', prefs),
  resetDemo: () => post<StudioData>('/users/me/demo-workspace/reset', {}),
};

export const projectApi = {
  create: (input: { name: string; description: string; category: string; icon: string; accent: string; deviceIds: ID[]; lmsProgram: LmsProgramRef | null; importVariables: boolean }) =>
    post<ProjectGraph>('/projects', input),
  update: (id: ID, patchBody: Partial<Pick<Project, 'name' | 'description' | 'category' | 'icon' | 'accent' | 'lmsProgram'>> & { settings?: ProjectSettings; defaultDashboardId?: ID }) =>
    patch<Project>(`/projects/${id}`, patchBody),
  remove: (id: ID) => del<{ id: ID }>(`/projects/${id}`),
  duplicate: (id: ID) => post<ProjectGraph>(`/projects/${id}/duplicate`, {}),
  exportBundle: (id: ID) => get<unknown>(`/projects/${id}/export`),
  importBundle: (bundle: unknown) => post<ProjectGraph>('/projects/import', bundle),
  associateDevice: (id: ID, deviceId: ID) => put<Project>(`/projects/${id}/devices/${deviceId}`, {}),
  dissociateDevice: (id: ID, deviceId: ID) => del<Project>(`/projects/${id}/devices/${deviceId}`),
  activity: (id: ID, limit = 100) => get<ActivityEvent[]>(`/projects/${id}/activity${qs({ limit })}`),
};

export const dashboardApi = {
  create: (projectId: ID, name: string) => post<{ dashboard: Dashboard; project: Project }>(`/projects/${projectId}/dashboards`, { name }),
  rename: (id: ID, name: string) => patch<Dashboard>(`/dashboards/${id}`, { name }),
  remove: (id: ID) => del<Project>(`/dashboards/${id}`),
  saveWidgets: (id: ID, widgets: Widget[], revision: number) => put<Dashboard>(`/dashboards/${id}/widgets`, { widgets, revision }),
};

export const variableApi = {
  create: (projectId: ID, input: VariablePayload) => post<Variable>(`/projects/${projectId}/variables`, input),
  importFromDevice: (projectId: ID, deviceId: ID, key: string) => post<Variable>(`/projects/${projectId}/variables/import`, { deviceId, key }),
  update: (id: ID, input: VariablePayload) => put<Variable>(`/variables/${id}`, input),
  remove: (id: ID) => del<{ id: ID; projectId: ID }>(`/variables/${id}`),
};

export const deviceApi = {
  createSimulated: (input: { name: string; board: string; kit: string; projectIds: ID[] }) => post<{ device: Device; projectIds: ID[] }>('/devices', input),
  rename: (id: ID, name: string) => patch<Device>(`/devices/${id}`, { name }),
  setSimulationMode: (id: ID, mode: SimMode) => post<{ deviceId: ID; mode: SimMode }>(`/devices/${id}/simulation`, { mode }),
};

export const mqttApi = {
  snapshot: (historyMinutes = 15) => get<Snapshot>(`/mqtt/snapshot${qs({ historyMinutes })}`),
  command: (variableId: ID, value: unknown) => post<{ message: MqttMessage; command: CommandState }>('/mqtt/commands', { variableId, value }),
  publish: (topic: string, payload: string) => post<{ message: MqttMessage; command: CommandState }>('/mqtt/publish', { topic, payload }),
  streamPath: '/mqtt/stream',
};

export interface Product {
  id: string;
  name: string;
  description: string;
  plan: Plan;
  tokens: number;
  /** Paise. */
  amount: number;
  currency: 'INR';
}

export interface CheckoutConfig {
  provider: 'mock' | 'razorpay';
  /** Public Razorpay key id (null for the test checkout). */
  keyId: string | null;
  testMode: boolean;
}

export interface Payment {
  id: ID;
  productId: string;
  productName: string;
  plan: Plan;
  tokens: number;
  amount: number;
  currency: 'INR';
  status: 'created' | 'paid' | 'failed';
  provider: 'mock' | 'razorpay';
  providerOrderId: string;
  providerPaymentId: string | null;
  failureReason: string | null;
  createdAt: number;
  paidAt: number | null;
}

export interface CheckoutSession extends CheckoutConfig {
  orderId: string;
  amount: number;
  currency: 'INR';
  name: string;
  description: string;
  prefill: { name: string; email: string };
}

export const paymentApi = {
  catalog: () => get<{ products: Product[]; checkout: CheckoutConfig; plans: Record<Plan, number> }>('/payments/catalog'),
  history: () => get<Payment[]>('/payments'),
  createOrder: (productId: string) => post<{ payment: Payment; checkout: CheckoutSession }>('/payments/orders', { productId }),
  verify: (input: { paymentId: ID; providerOrderId: string; providerPaymentId: string; signature: string }) => post<{ payment: Payment; tokens: TokenState }>('/payments/verify', input),
  completeMock: (paymentId: ID, outcome: 'success' | 'failure') => post<{ payment: Payment; tokens: TokenState }>('/payments/mock/complete', { paymentId, outcome }),
  cancel: (paymentId: ID, reason: string) => post<Payment>('/payments/cancel', { paymentId, reason }),
};

/** Private (admin) API — the server enforces the role; the UI only hides what the user cannot use. */
export const adminApi = {
  setSimulation: (input: { paused?: boolean; intervalMs?: number }) => patch<MqttStatus>('/admin/mqtt/simulation', input),
  users: (q: { q?: string; page?: number; pageSize?: number } = {}) => get<Page<ManagedUser>>(`/admin/users${qs({ ...q, sort: '-createdAt' })}`),
  user: (id: ID) => get<ManagedUser>(`/admin/users/${id}`),
  changePlan: (id: ID, input: { plan?: Plan; bonusTokens?: number; reason?: string }) => patch<ManagedUser>(`/admin/users/${id}/plan`, input),
  kitCodes: (q: { status?: 'redeemed' | 'unused'; page?: number; pageSize?: number } = {}) => get<Page<KitCode>>(`/admin/kit-codes${qs(q)}`),
  generateKitCodes: (input: { count: number; plan: Plan; bonusTokens: number; note: string }) => post<{ codes: string[]; items: KitCode[] }>('/admin/kit-codes', input),
};

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ManagedUser extends User {
  updatedAt: number;
  projectCount?: number;
  deviceCount?: number;
  bonusTokens: number;
  /** Kokoon LMS user id when the account is linked to the LMS. */
  lmsUserId?: string | null;
  tokenAllowance: number;
  tokensUsed?: number;
}

export interface KitCode {
  id: ID;
  /** Masked except the last 4 characters. */
  code: string;
  plan: Plan;
  bonusTokens: number;
  note: string;
  createdAt: number;
  redeemedBy: ID | null;
  redeemedAt: number | null;
}
