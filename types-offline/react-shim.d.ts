/**
 * Minimal React type shim used ONLY for the offline build in this sandbox,
 * where @types/react could not be installed. It types React APIs loosely so
 * the compiler still strictly checks the app's own models, services and
 * state logic. With network access, run `npm install` and `npm run typecheck`
 * to check against the real @types/react instead.
 */
declare module 'react' {
  export type ReactNode = any;
  export type CSSProperties = { [key: string]: string | number | undefined };
  export type ComponentType<P = any> = (props: P) => any;
  export function useState<S>(init: S | (() => S)): [S, (v: S | ((prev: S) => S)) => void];
  export function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useRef<T>(init: T): { current: T };
  export function useMemo<T>(fn: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useId(): string;
  export function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T): T;
  export const Fragment: any;
  export const StrictMode: any;
  const React: any;
  export default React;
}
declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
  export namespace JSX {
    interface Element {}
    interface IntrinsicElements { [name: string]: { [handler: `on${string}`]: ((e: any) => void) | undefined; [prop: string]: any } }
    interface ElementChildrenAttribute { children: {} }
    interface IntrinsicAttributes { key?: string | number | null }
  }
}
declare module 'react-dom' {
  export function createPortal(node: any, el: Element): any;
}
declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(node: any): void; unmount(): void };
}

declare module '*.css';
