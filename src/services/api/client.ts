import { config } from '../config';

/**
 * The ONE HTTP client for Kokoon Backend.
 *   - credentials: 'include' → the HttpOnly auth cookies travel with every call
 *     (tokens are never readable by JavaScript and never stored by the app)
 *   - X-Requested-With header → required by the backend's CSRF protection
 *   - unwraps `{ success, data }` and turns `{ success:false, error }` into ApiError
 *   - on 401 it refreshes the session ONCE (single-flight, shared by all
 *     concurrent requests) and retries; if that fails the app returns to sign-in
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { fieldErrors?: Record<string, string>; formErrors?: string[]; [k: string]: unknown },
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get fieldErrors(): Record<string, string> {
    return this.details?.fieldErrors ?? {};
  }
}

const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];
const unauthListeners = new Set<() => void>();
let refreshing: Promise<boolean> | null = null;

export const onUnauthenticated = (cb: () => void) => {
  unauthListeners.add(cb);
  return () => unauthListeners.delete(cb);
};
const emitUnauthenticated = () => unauthListeners.forEach((l) => l());

export const apiUrl = (path: string) => `${config.apiBaseUrl.replace(/\/$/, '')}${path}`;

async function send(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    return await fetch(apiUrl(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'include', signal, cache: 'no-store' });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Can’t reach the Kokoon server. Check that the backend is running and try again.');
  }
}

async function parse<T>(res: Response): Promise<T> {
  let json: { success?: boolean; data?: T; error?: { code: string; message: string; details?: ApiError['details'] }; requestId?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (res.ok && json?.success) return json.data as T;
  const e = json?.error;
  throw new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? `The server answered ${res.status}.`, e?.details, json?.requestId ?? res.headers.get('x-request-id') ?? undefined);
}

/** Refresh the session using the refresh cookie. Single-flight across concurrent callers. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= send('POST', '/auth/refresh', {})
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown, opts: { signal?: AbortSignal } = {}): Promise<T> {
  let res = await send(method, path, body, opts.signal);
  if (res.status === 401 && !NO_REFRESH.some((p) => path.startsWith(p))) {
    const peek = (await res.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
    const code = peek?.error?.code;
    if (code !== 'ACCOUNT_DISABLED') {
      if (await refreshSession()) res = await send(method, path, body, opts.signal);
    }
    if (res.status === 401) {
      emitUnauthenticated();
    }
  }
  return parse<T>(res);
}

export const get = <T>(path: string, opts?: { signal?: AbortSignal }) => api<T>('GET', path, undefined, opts);
export const post = <T>(path: string, body: unknown = {}) => api<T>('POST', path, body);
export const put = <T>(path: string, body: unknown) => api<T>('PUT', path, body);
export const patch = <T>(path: string, body: unknown) => api<T>('PATCH', path, body);
export const del = <T>(path: string, body?: unknown) => api<T>('DELETE', path, body);

/** Query-string helper that skips undefined values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

/** Human message for any thrown value. */
export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : 'Something went wrong.');
