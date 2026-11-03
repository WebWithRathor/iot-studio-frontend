import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { dismissToast, useUi } from '../state/ui';
import type { ConnectionState } from '../types/models';
import { cn } from '../utils';
import { Icon } from './Icon';

/* ================================================================= buttons */

type ButtonVariant = 'primary' | 'outline' | 'dark' | 'ghost' | 'danger' | 'lime';

export function Button(props: {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  iconRight?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  title?: string;
  className?: string;
  'aria-pressed'?: boolean;
  id?: string;
}) {
  const { variant = 'outline', size = 'md', icon, iconRight, children, className, type = 'button', ...rest } = props;
  return (
    <button type={type} className={cn('btn', `btn-${variant}`, `btn-${size}`, !children && 'btn-icon-only', className)} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 14 : 16} />}
    </button>
  );
}

export function IconButton(props: { icon: string; label: string; onClick?: () => void; disabled?: boolean; active?: boolean; className?: string; size?: number }) {
  return (
    <button
      type="button"
      className={cn('icon-btn', props.active && 'is-active', props.className)}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.active}
    >
      <Icon name={props.icon} size={props.size ?? 16} />
    </button>
  );
}

/* ================================================================== labels */

/** `// LABEL` mono kicker, as used across the LMS. */
export function Kicker({ children, tone = 'accent', className }: { children: ReactNode; tone?: 'accent' | 'muted' | 'ink'; className?: string }) {
  return <div className={cn('kicker', `kicker-${tone}`, className)}>// {children}</div>;
}

export function Badge({ children, tone = 'neutral', className, title }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'lime' | 'ok' | 'warn' | 'bad' | 'ink' | 'info'; className?: string; title?: string }) {
  return <span className={cn('badge', `badge-${tone}`, className)} title={title}>{children}</span>;
}

/** Marks a variable declared by an LMS block; warns when the latest flashed program dropped it. */
export function FirmwareBadge({ v }: { v: { firmwareRef: { source: 'lms'; declared?: boolean } | null } }) {
  if (!v.firmwareRef) return null;
  return v.firmwareRef.declared === false ? (
    <Badge tone="warn" title="The program flashed most recently from the LMS no longer declares this variable. The board will not send or accept it until the block is added back.">NO LONGER DECLARED</Badge>
  ) : (
    <Badge tone="info" title="Declared by a block in the LMS program flashed to this board">LMS BLOCK</Badge>
  );
}

export function SimTag({ compact }: { compact?: boolean }) {
  return (
    <span className="sim-tag" title="Simulated by the Kokoon server — not real hardware">
      {compact ? 'SIM' : 'SIMULATED'}
    </span>
  );
}

export const STATE_META: Record<ConnectionState, { label: string; short: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' | 'info'; help: string }> = {
  connected: { label: 'Connected', short: 'Online', tone: 'ok', help: 'The device is sending messages to the broker.' },
  connecting: { label: 'Connecting', short: 'Connecting', tone: 'warn', help: 'The device is opening its broker connection.' },
  disconnected: { label: 'Disconnected', short: 'Offline', tone: 'neutral', help: 'The broker reported the device offline (Last Will).' },
  waiting: { label: 'Waiting for first message', short: 'Waiting', tone: 'info', help: 'No message from this device yet.' },
  auth_required: { label: 'Authentication required', short: 'Auth', tone: 'warn', help: 'The broker rejected the device’s credentials.' },
  error: { label: 'Error', short: 'Error', tone: 'bad', help: 'The connection failed.' },
};

export function StateBadge({ state, short }: { state: ConnectionState; short?: boolean }) {
  const m = STATE_META[state];
  return (
    <span className={cn('state', `state-${m.tone}`, state === 'connecting' && 'is-pulsing')} title={m.help}>
      <i aria-hidden="true" />
      {short ? m.short : m.label}
    </span>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="infotip" tabIndex={0} aria-label={text} role="note">
      <Icon name="LuInfo" size={13} />
      <span className="infotip-bubble" role="tooltip">{text}</span>
    </span>
  );
}

/* =================================================================== forms */

export function Field({ label, hint, error, children, htmlFor, tip }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string; tip?: string }) {
  return (
    <div className={cn('field', error && 'has-error')}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {tip && <InfoTip text={tip} />}
      </label>
      {children}
      {error ? <div className="field-error" role="alert">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button type="button" role="switch" id={id} aria-checked={checked} className={cn('switch', checked && 'is-on')} onClick={() => onChange(!checked)}>
      <span className="switch-track"><span className="switch-thumb" /></span>
      <span className="switch-label">{label}</span>
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; icon?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={cn(value === o.value && 'is-active')} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { value: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" type="button" aria-selected={value === t.value} className={cn('tab', value === t.value && 'is-active')} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* =================================================================== modal */

export function Modal(props: { open: boolean; onClose: () => void; title: string; kicker?: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    if (!props.open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button');
      el?.focus();
    }, 20);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
      prev?.focus?.();
    };
  }, [props.open]);
  if (!props.open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="modal cut-frame" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} style={{ maxWidth: props.width ?? 560 }}>
        <div className="modal-head">
          <div>
            {props.kicker && <Kicker>{props.kicker}</Kicker>}
            <h2 id={titleId} className="modal-title">{props.title}</h2>
          </div>
          <IconButton icon="LuX" label="Close" onClick={props.onClose} />
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmHost() {
  const req = useUi((s) => s.confirm);
  if (!req) return null;
  return (
    <Modal
      open
      onClose={() => req.resolve(false)}
      title={req.title}
      kicker={req.danger ? 'CONFIRM' : 'CHECK'}
      width={460}
      footer={
        <>
          <Button onClick={() => req.resolve(false)}>Cancel</Button>
          <Button variant={req.danger ? 'danger' : 'primary'} onClick={() => req.resolve(true)}>{req.confirmLabel}</Button>
        </>
      }
    >
      <p className="modal-text">{req.message}</p>
    </Modal>
  );
}

export function ToastHost() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cn('toast', `toast-${t.kind}`)}>
          <Icon name={t.kind === 'error' ? 'LuCircleAlert' : t.kind === 'success' ? 'LuCircleCheck' : 'LuInfo'} size={16} />
          <span>{t.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)}><Icon name="LuX" size={14} /></button>
        </div>
      ))}
    </div>
  );
}

/* ==================================================================== menu */

export interface MenuItem {
  label: string;
  icon?: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * The popup is rendered in a portal on <body> with fixed positioning, so it is
 * never clipped by a chamfered card (`clip-path` clips descendants regardless
 * of z-index) and sits above the dock. It opens below the button, or above it
 * when there is no room, and stays inside the viewport.
 */
const MENU_GAP = 6;
const VIEWPORT_PAD = 8;

export function Menu({ items, label = 'More options', icon = 'LuEllipsis', align = 'right' }: { items: (MenuItem | 'divider')[]; label?: string; icon?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'below' | 'above' } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  /** Area of the screen not covered by the sticky top bar. */
  const visibleTop = () => {
    const bar = document.querySelector('.topbar, .editor-bar')?.getBoundingClientRect();
    return bar && bar.bottom > 0 ? bar.bottom : 0;
  };

  const place = (fromScroll = false) => {
    const trigger = ref.current?.getBoundingClientRect();
    const pop = popRef.current;
    if (!trigger || !pop) return;
    // Scrolled away (under the top bar or off screen): close instead of pinning the menu to an edge.
    if (fromScroll && (trigger.bottom <= visibleTop() || trigger.top >= window.innerHeight)) {
      setOpen(false);
      return;
    }
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Keep clear of the floating dock at the bottom of the screen.
    const dock = document.querySelector('.dock')?.getBoundingClientRect();
    const bottomLimit = dock && dock.top > vh / 2 ? dock.top - VIEWPORT_PAD : vh - VIEWPORT_PAD;
    const below = trigger.bottom + MENU_GAP;
    const fitsBelow = below + h <= bottomLimit;
    const fitsAbove = trigger.top - MENU_GAP - h >= VIEWPORT_PAD;
    const placement = fitsBelow || !fitsAbove ? 'below' : 'above';
    let top = placement === 'below' ? below : trigger.top - MENU_GAP - h;
    // Only nudge into view when opening; while scrolling the menu stays attached to its button.
    if (!fromScroll) top = Math.max(VIEWPORT_PAD, Math.min(top, vh - VIEWPORT_PAD - h));
    let left = align === 'right' ? trigger.right - w : trigger.left;
    left = Math.max(VIEWPORT_PAD, Math.min(left, vw - VIEWPORT_PAD - w));
    setPos({ top, left, placement });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => Boolean(t && (ref.current?.contains(t as Node) || popRef.current?.contains(t as Node)));
    const onDoc = (e: MouseEvent) => { if (!inside(e.target)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onResize = () => place();
    // Scrolling the menu's own list must not move or close it.
    const onScroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) place(true); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <IconButton icon={icon} label={label} onClick={() => setOpen((o) => !o)} active={open} />
      {open && createPortal(
        <div
          ref={popRef}
          className={cn('menu-pop is-floating', pos?.placement === 'above' && 'is-above')}
          role="menu"
          style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          // Portal events still bubble through React parents (e.g. a clickable card): keep them here.
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {items.map((it, i) =>
            it === 'divider' ? (
              <div key={i} className="menu-div" role="separator" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                className={cn('menu-item', it.danger && 'is-danger')}
                onClick={(e) => { e.stopPropagation(); setOpen(false); it.onSelect(); }}
              >
                {it.icon && <Icon name={it.icon} size={15} />}
                {it.label}
              </button>
            ),
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ================================================================== misc */

export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={22} /></div>
      <h3 className="empty-title">{title}</h3>
      {children && <p className="empty-text">{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/** Extra detail a first-time student doesn't need: closed until they ask for it. */
export function More({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <details className={cn('more', className)}>
      <summary><Icon name="LuChevronRight" size={14} className="more-chev" /> {label}</summary>
      <div className="more-body">{children}</div>
    </details>
  );
}

export function PageHeader({ kicker, title, serif, children, actions }: { kicker?: string; title: string; serif?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        {kicker && <Kicker>{kicker}</Kicker>}
        <h1 className="page-title">
          {title} {serif && <em className="serif">{serif}</em>}
        </h1>
        {children && <div className="page-sub">{children}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
