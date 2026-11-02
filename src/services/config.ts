/**
 * Runtime configuration. Only non-secret values belong here — this file ships
 * to the browser. Broker credentials and tokens never reach the frontend:
 * the backend holds them, and authentication uses HttpOnly cookies.
 */
type Env = Record<string, string | undefined>;

function readEnv(): Env {
  try {
    // Vite injects import.meta.env; other bundlers leave it undefined.
    return ((import.meta as unknown as { env?: Env }).env ?? {}) as Env;
  } catch {
    return {};
  }
}

const env = readEnv();

declare global {
  interface Window {
    /** Optional runtime override (e.g. set by a hosting page) — never a secret. */
    __KOKOON_API_BASE_URL__?: string;
  }
}

export const config = {
  appVersion: '1.0.0',
  /** Kokoon Backend base URL (cookies are sent with every request). */
  apiBaseUrl: (typeof window !== 'undefined' && window.__KOKOON_API_BASE_URL__) || env.VITE_API_BASE_URL || 'http://localhost:4004/api/v1',
  lmsUrl: env.VITE_LMS_URL ?? 'https://test.kokoon.pre.pixxo.io/',
};
