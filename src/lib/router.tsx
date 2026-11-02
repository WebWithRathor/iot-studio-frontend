import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

/**
 * Tiny hash router. Hash routing keeps the prototype deployable as a static
 * file (no server rewrites). Swap for React Router when the app gets a host.
 */

function readHash(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/' + h;
}

const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => listeners.forEach((l) => l()));

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useLocation(): { path: string; query: URLSearchParams; full: string } {
  const full = useSyncExternalStore(subscribe, readHash);
  const [path, qs = ''] = full.split('?');
  return { path: path || '/', query: new URLSearchParams(qs), full };
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const target = '#' + to;
  if (opts.replace) {
    window.history.replaceState(null, '', target);
    listeners.forEach((l) => l());
  } else {
    window.location.hash = to;
  }
  window.scrollTo({ top: 0 });
}

/** Match `/projects/:id/editor` style patterns. Returns params or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  const wildcard = p[p.length - 1] === '*';
  if (wildcard) p.pop();
  if (wildcard ? s.length < p.length : s.length !== p.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function Link(props: {
  to: string;
  children: ReactNode;
  className?: string;
  title?: string;
  'aria-current'?: 'page' | undefined;
  onClick?: () => void;
}) {
  const { to, children, onClick, ...rest } = props;
  return (
    <a
      href={'#' + to}
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick?.();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}
