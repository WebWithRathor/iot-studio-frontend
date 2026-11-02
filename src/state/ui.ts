import { createStore, useStore } from '../lib/store';
import { uid } from '../utils';

export interface Toast {
  id: string;
  message: string;
  kind: 'info' | 'success' | 'error';
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

/** Shown when an action needs more tokens than the account has left. */
export interface TokenPrompt {
  action: string;
  needed: number;
  available: number;
  /** Server explanation, when the server refused it. */
  message?: string;
}

interface UiState {
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  tokenPrompt: TokenPrompt | null;
}

export const ui = createStore<UiState>({ toasts: [], confirm: null, tokenPrompt: null });

export const showTokenPrompt = (p: TokenPrompt) => ui.set({ tokenPrompt: p });
export const closeTokenPrompt = () => ui.set({ tokenPrompt: null });
export const useUi = <T,>(sel: (s: UiState) => T) => useStore(ui, sel);

export function toast(message: string, kind: Toast['kind'] = 'info') {
  const t: Toast = { id: uid('toast'), message, kind };
  ui.set((s) => ({ toasts: [...s.toasts, t].slice(-4) }));
  setTimeout(() => ui.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), kind === 'error' ? 6000 : 3600);
}

export function dismissToast(id: string) {
  ui.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
}

export function confirmDialog(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    ui.set({
      confirm: {
        ...opts,
        resolve: (ok) => {
          ui.set({ confirm: null });
          resolve(ok);
        },
      },
    });
  });
}
