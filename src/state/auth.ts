import { createStore, useStore } from '../lib/store';
import { ApiError, onUnauthenticated } from '../services/api/client';
import { authApi, type AuthConfig } from '../services/api/endpoints';
import type { User } from '../types/models';

/**
 * Session state. The session itself lives in HttpOnly cookies that this
 * code can neither read nor store — we only keep the user profile in memory.
 *   loading       → checking /auth/me on start
 *   anonymous     → show the sign-in screen
 *   authenticated → app
 *   offline       → backend unreachable (shown with a retry, never a silent fallback)
 */
export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'offline';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  config: AuthConfig | null;
  error: string | null;
  /** Set when the session ended on its own (expired / revoked elsewhere). */
  notice: string | null;
}

export const auth = createStore<AuthState>({ status: 'loading', user: null, config: null, error: null, notice: null });
export const useAuth = <T,>(sel: (s: AuthState) => T) => useStore(auth, sel);

const listeners = new Set<(s: AuthStatus) => void>();
export const onAuthChange = (cb: (s: AuthStatus) => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
function setStatus(status: AuthStatus, patch: Partial<AuthState> = {}) {
  const prev = auth.get().status;
  auth.set({ status, ...patch });
  if (prev !== status) listeners.forEach((l) => l(status));
}

onUnauthenticated(() => {
  if (auth.get().status === 'authenticated') setStatus('anonymous', { user: null, notice: 'Your session ended. Sign in again to continue.' });
});

export async function bootstrapAuth(): Promise<void> {
  setStatus('loading', { error: null });
  try {
    const config = await authApi.config();
    auth.set({ config });
    const { user } = await authApi.me();
    setStatus('authenticated', { user });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) setStatus('anonymous', { user: null });
    else setStatus('offline', { error: err instanceof Error ? err.message : 'The server is unavailable.' });
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { user } = await authApi.login(email, password);
  setStatus('authenticated', { user, notice: null });
}

export async function register(name: string, email: string, password: string): Promise<void> {
  const { user } = await authApi.register(name, email, password);
  setStatus('authenticated', { user, notice: null });
}

export async function signOut(): Promise<void> {
  try {
    await authApi.logout();
  } finally {
    setStatus('anonymous', { user: null, notice: null });
  }
}

export const hasPermission = (p: string): boolean => auth.get().user?.permissions.includes(p) ?? false;
export const useHasPermission = (p: string): boolean => useAuth((s) => s.user?.permissions.includes(p) ?? false);

export function patchUser(u: Partial<User>) {
  const cur = auth.get().user;
  if (cur) auth.set({ user: { ...cur, ...u } });
}
