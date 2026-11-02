import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { StateBadge } from '../components/ui';
import { useRuntime } from '../state/runtime';
import { useStudio } from '../state/studio';
import type { Widget, WidgetType } from '../types/models';
import {
  arcPath, clamp, clock, cn, formatDuration, formatValue, hexToHsv, hexToRgb, hsvToHex, isValidHex, polar, timeAgo, toBool, toNumber,
} from '../utils';
import { useHistory, useNow, useSize, useTween, type BoundValue } from './hooks';

export interface RendererProps {
  widget: Widget;
  bound: BoundValue;
  /** False in the editor (controls are inert so the widget can be dragged). */
  interactive: boolean;
  publish: (value: unknown) => void;
  projectId: string;
}

export const accentVar = (c?: string) =>
  c && ['indigo', 'lime', 'ink', 'blue', 'rose', 'amber'].includes(c) ? `var(--accent-${c})` : 'var(--primary)';

const num = (v: unknown, fallback: number) => toNumber(v) ?? fallback;

/**
 * Value a control should display: in-flight command → reported → local/default.
 * An acknowledged command keeps showing until the device reports a value newer
 * than the ack, so the control never snaps back to the stale reading in between.
 */
function useControlValue<T>(bound: BoundValue, fallback: T, parse: (v: unknown) => T): [T, (v: T) => void] {
  const [local, setLocal] = useState<T>(fallback);
  if (!bound.variable) return [local, setLocal];
  const c = bound.command;
  if (c && (c.status === 'pending' || (c.status === 'acknowledged' && (bound.at ?? 0) < (c.ackAt ?? c.at)))) return [parse(c.value), setLocal];
  if (bound.value !== undefined && bound.value !== null) return [parse(bound.value), setLocal];
  return [local, setLocal];
}

/* ================================================================ controls */

function ButtonW({ widget, bound, interactive, publish }: RendererProps) {
  const c = widget.config;
  const [flash, setFlash] = useState(false);
  return (
    <div className="w-center">
      <button
        type="button"
        className={cn('w-press', flash && 'is-flash')}
        style={{ '--wc': accentVar(c.color) } as CSSProperties}
        disabled={!interactive}
        onClick={() => {
          publish(c.pressValue ?? 'true');
          setFlash(true);
          setTimeout(() => setFlash(false), 260);
        }}
      >
        {c.label || 'PRESS'}
      </button>
      {!bound.variable && interactive && <span className="w-note">Not bound — nothing is sent</span>}
    </div>
  );
}

function ToggleW({ widget, bound, interactive, publish }: RendererProps) {
  const c = widget.config;
  const onRaw = c.onValue ?? 'true';
  const parse = (v: unknown) => {
    if (typeof v === 'boolean') return v;
    if (bound.variable?.dataType === 'integer') return String(toNumber(v)) === String(toNumber(onRaw));
    return toBool(v);
  };
  const [on, setOn] = useControlValue(bound, false, parse);
  return (
    <div className="w-center">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={c.title}
        disabled={!interactive}
        className={cn('w-toggle', on && 'is-on')}
        style={{ '--wc': accentVar(c.color) } as CSSProperties}
        onClick={() => {
          const next = !on;
          setOn(next);
          publish(next ? onRaw : c.offValue ?? 'false');
        }}
      >
        <span className="w-toggle-thumb" />
      </button>
      <span className="w-toggle-label">{on ? c.onLabel || 'ON' : c.offLabel || 'OFF'}</span>
    </div>
  );
}

function SliderW({ widget, bound, interactive, publish }: RendererProps) {
  const c = widget.config;
  const min = c.min ?? 0;
  const max = c.max ?? 100;
  const step = c.step && c.step > 0 ? c.step : 1;
  const [value, setValue] = useControlValue(bound, c.defaultValue ?? min, (v) => num(v, min));
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const commit = () => {
    if (draft === null) return;
    setValue(draft);
    publish(draft);
    setDraft(null);
  };
  const pct = max > min ? ((clamp(shown, min, max) - min) / (max - min)) * 100 : 0;
  return (
    <div className="w-slider">
      <div className="w-slider-val">
        <span className="w-big">{formatValue(shown, 'float', c.precision ?? 0)}</span>
        {c.unit && <span className="w-unit">{c.unit}</span>}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamp(shown, min, max)}
        disabled={!interactive}
        aria-label={c.title}
        style={{ '--pct': `${pct}%`, '--wc': accentVar(c.color) } as CSSProperties}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <div className="w-scale"><span>{min}</span><span>{max}</span></div>
    </div>
  );
}

/** Pointer + keyboard handling shared by the arc slider and rotary knob. */
function useAngular(opts: { start: number; sweep: number; min: number; max: number; step: number; value: number; enabled: boolean; onDraft: (v: number) => void; onCommit: (v: number) => void }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);
  const [active, setActive] = useState(false);
  const last = useRef(opts.value);
  const fromEvent = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return opts.value;
    const r = el.getBoundingClientRect();
    const deg = (Math.atan2(clientY - (r.top + r.height * 0.5), clientX - (r.left + r.width / 2)) * 180) / Math.PI;
    let rel = (deg - opts.start + 720) % 360;
    if (rel > opts.sweep) rel = rel > opts.sweep + (360 - opts.sweep) / 2 ? 0 : opts.sweep;
    const raw = opts.min + (rel / opts.sweep) * (opts.max - opts.min);
    return clamp(Math.round(raw / opts.step) * opts.step, opts.min, opts.max);
  };
  const handlers = {
    onPointerDown: (e: any) => {
      if (!opts.enabled) return;
      dragging.current = true;
      setActive(true);
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      last.current = fromEvent(e.clientX, e.clientY);
      opts.onDraft(last.current);
    },
    onPointerMove: (e: any) => {
      if (!dragging.current) return;
      last.current = fromEvent(e.clientX, e.clientY);
      opts.onDraft(last.current);
    },
    onPointerUp: () => {
      if (!dragging.current) return;
      dragging.current = false;
      setActive(false);
      opts.onCommit(last.current);
    },
    onPointerCancel: () => {
      if (!dragging.current) return;
      dragging.current = false;
      setActive(false);
      opts.onCommit(last.current);
    },
    onKeyDown: (e: any) => {
      if (!opts.enabled) return;
      const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = clamp(opts.value + d * opts.step * (e.shiftKey ? 10 : 1), opts.min, opts.max);
      opts.onCommit(next);
    },
  };
  return { ref, handlers, active };
}

function ArcSliderW({ widget, bound, interactive, publish }: RendererProps) {
  const c = widget.config;
  const min = c.min ?? 0;
  const max = c.max ?? 100;
  const step = c.step && c.step > 0 ? c.step : 1;
  const [value, setValue] = useControlValue(bound, min, (v) => num(v, min));
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const t = max > min ? (clamp(shown, min, max) - min) / (max - min) : 0;
  const { ref, handlers, active } = useAngular({
    start: 135, sweep: 270, min, max, step, value: shown, enabled: interactive,
    onDraft: setDraft,
    onCommit: (v) => { setDraft(null); setValue(v); publish(v); },
  });
  // One animated position drives the arc, the handle and the number together;
  // while dragging it follows the pointer exactly.
  const tt = useTween(t, { instant: active });
  const angle = 135 + 270 * tt;
  const [hx, hy] = polar(100, 100, 74, angle);
  const display = active || max <= min ? shown : min + tt * (max - min);
  const pending = bound.command?.status === 'pending';
  const color = accentVar(c.color);
  return (
    <div className="w-fill">
      <svg ref={ref} viewBox="0 0 200 190" className={cn('w-svg', interactive && 'is-grab', active && 'is-dragging')} role="slider" tabIndex={interactive ? 0 : -1}
        aria-label={c.title} aria-valuemin={min} aria-valuemax={max} aria-valuenow={shown} {...handlers}>
        <path d={arcPath(100, 100, 74, 135, 405)} className="arc-track" />
        <path d={arcPath(100, 100, 74, 135, 135 + 270 * Math.max(tt, 0.002))} className="arc-val is-tweened" style={{ stroke: color }} />
        <circle cx={hx} cy={hy} r="18" className={cn('arc-halo', active && 'is-on', pending && 'is-pending')} style={{ fill: color }} />
        <circle cx={hx} cy={hy} r={active ? 13 : 11} className="arc-handle" style={{ stroke: color }} />
        <text x="100" y="104" className="svg-big" textAnchor="middle">{formatValue(display, 'float', c.precision ?? 0)}</text>
        <text x="100" y="128" className="svg-unit" textAnchor="middle">{c.unit ?? ''}</text>
        <text x="48" y="178" className="svg-tick" textAnchor="middle">{min}</text>
        <text x="152" y="178" className="svg-tick" textAnchor="middle">{max}</text>
      </svg>
    </div>
  );
}

function RotaryW({ widget, bound, interactive, publish }: RendererProps) {
  const c = widget.config;
  const min = c.min ?? 0;
  const max = c.max ?? 255;
  const step = c.step && c.step > 0 ? c.step : 1;
  const [value, setValue] = useControlValue(bound, min, (v) => num(v, min));
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const t = max > min ? (clamp(shown, min, max) - min) / (max - min) : 0;
  const { ref, handlers, active } = useAngular({
    start: 135, sweep: 270, min, max, step, value: shown, enabled: interactive,
    onDraft: setDraft,
    onCommit: (v) => { setDraft(null); setValue(v); publish(v); },
  });
  const ticks = Array.from({ length: 28 }, (_, i) => i / 27);
  const tt = useTween(t, { instant: active });
  const angle = 135 + 270 * tt;
  const [px, py] = polar(100, 96, 46, angle);
  return (
    <div className="w-fill">
      <svg ref={ref} viewBox="0 0 200 190" className={cn('w-svg', interactive && 'is-grab')} role="slider" tabIndex={interactive ? 0 : -1}
        aria-label={c.title} aria-valuemin={min} aria-valuemax={max} aria-valuenow={shown} {...handlers}>
        {ticks.map((k, i) => {
          const a = 135 + 270 * k;
          const [x1, y1] = polar(100, 96, 78, a);
          const [x2, y2] = polar(100, 96, i % 9 === 0 ? 66 : 71, a);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={cn('knob-tick', k <= tt && 'is-on')} style={k <= tt ? { stroke: accentVar(c.color) } : undefined} />;
        })}
        <circle cx="100" cy="96" r="58" className="knob-body" />
        <circle cx="100" cy="96" r="50" className="knob-face" />
        <line x1="100" y1="96" x2={px} y2={py} className="knob-pointer" style={{ stroke: accentVar(c.color) }} />
        <circle cx="100" cy="96" r="5" className="knob-hub" />
        <text x="100" y="182" className="svg-mid" textAnchor="middle">
          {formatValue(shown, 'float', c.precision ?? 0)} {c.unit ?? ''}
        </text>
      </svg>
    </div>
  );
}

function StepperW({ widget, bound, interactive, publish }: RendererProps) {
  const c = widget.config;
  const min = c.min ?? 0;
  const max = c.max ?? 10;
  const step = c.step && c.step > 0 ? c.step : 1;
  const [value, setValue] = useControlValue(bound, c.defaultValue ?? min, (v) => num(v, min));
  const go = (d: number) => {
    const next = clamp(+(value + d * step).toFixed(6), min, max);
    setValue(next);
    publish(next);
  };
  return (
    <div className="w-stepper">
      <button type="button" disabled={!interactive || value <= min} onClick={() => go(-1)} aria-label="Decrease">−</button>
      <div className="w-stepper-val">
        <span className="w-big">{formatValue(value, 'float', c.precision ?? 0)}</span>
        {c.unit && <span className="w-unit">{c.unit}</span>}
      </div>
      <button type="button" disabled={!interactive || value >= max} onClick={() => go(1)} aria-label="Increase">+</button>
    </div>
  );
}

function ColorWheelW({ widget, bound, interactive, publish }: RendererProps) {
  const c = widget.config;
  const [color, setColor] = useControlValue(bound, '#6262f5', (v) => (typeof v === 'string' && isValidHex(v) ? v.toLowerCase() : '#6262f5'));
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? color;
  const [h, s, v] = hexToHsv(shown);
  const [bright, setBright] = useState(v || 1);
  const wheel = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const lastPick = useRef(shown);
  useEffect(() => { if (!draft) setBright(v || 1); }, [color]);

  const pick = (x: number, y: number) => {
    const el = wheel.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const sat = clamp(Math.hypot(dx, dy) / (r.width / 2), 0, 1);
    const hex = hsvToHex(hue, sat, bright);
    lastPick.current = hex;
    setDraft(hex);
  };
  const commit = (hex: string) => {
    setDraft(null);
    setColor(hex);
    publish(hex);
  };
  const markerAngle = (h * Math.PI) / 180;
  const [r8, g8, b8] = hexToRgb(shown);
  return (
    <div className="w-color">
      <div className="w-wheel-box">
      <div
        ref={wheel}
        className={cn('w-wheel', interactive && 'is-grab')}
        role="slider"
        aria-label={`${c.title}: hue`}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(h)}
        aria-valuetext={shown}
        tabIndex={interactive ? 0 : -1}
        onPointerDown={(e) => {
          if (!interactive) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          pick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => dragging.current && pick(e.clientX, e.clientY)}
        onPointerUp={() => {
          if (!dragging.current) return;
          dragging.current = false;
          commit(lastPick.current);
        }}
        onKeyDown={(e) => {
          if (!interactive) return;
          const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 10 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -10 : 0;
          if (!d) return;
          e.preventDefault();
          commit(hsvToHex((h + d + 360) % 360, s || 1, bright));
        }}
      >
        <span
          className="w-wheel-marker"
          style={{ left: `${50 + Math.cos(markerAngle) * s * 50}%`, top: `${50 + Math.sin(markerAngle) * s * 50}%`, background: shown }}
        />
      </div>
      </div>
      <div className="w-color-row">
        <span className="w-swatch" style={{ background: shown }} />
        <div className="w-color-txt">
          <strong>{shown.toUpperCase()}</strong>
          <span>rgb({r8}, {g8}, {b8})</span>
        </div>
      </div>
      <input
        type="range"
        min={5}
        max={100}
        value={Math.round(bright * 100)}
        disabled={!interactive}
        aria-label="Brightness"
        className="w-bright"
        onChange={(e) => {
          const b = Number(e.target.value) / 100;
          setBright(b);
          const hex = hsvToHex(h, s, b);
          lastPick.current = hex;
          setDraft(hex);
        }}
        onPointerUp={() => draft && commit(draft)}
        onKeyUp={() => draft && commit(draft)}
      />
    </div>
  );
}

/* ================================================================ displays */

function NumericW({ widget, bound }: RendererProps) {
  const c = widget.config;
  const isBool = bound.variable?.dataType === 'boolean';
  return (
    <div className={cn('w-numeric', `size-${c.size ?? 'lg'}`)}>
      <span className="w-big" style={{ color: c.color ? accentVar(c.color) : undefined }}>
        {formatValue(bound.value, isBool ? 'boolean' : 'float', c.precision ?? 1)}
      </span>
      {c.unit && !isBool && <span className="w-unit">{c.unit}</span>}
    </div>
  );
}

function TextW({ widget, bound }: RendererProps) {
  const c = widget.config;
  return (
    <div className={cn('w-text', c.align === 'center' && 'is-center')}>
      {bound.variable?.dataType === 'color' && typeof bound.value === 'string' && <span className="w-swatch sm" style={{ background: bound.value }} />}
      <span>{formatValue(bound.value, bound.variable?.dataType, c.precision)}</span>
    </div>
  );
}

function GaugeW({ widget, bound }: RendererProps) {
  const c = widget.config;
  const min = c.min ?? 0;
  const max = c.max ?? 100;
  const v = toNumber(bound.value);
  const t = v === null || max <= min ? 0 : clamp((v - min) / (max - min), 0, 1);
  const tt = useTween(t, { ms: 600 });
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="w-fill">
      <svg viewBox="0 0 200 128" className="w-svg" role="img" aria-label={`${c.title}: ${formatValue(v, 'float', c.precision)} ${c.unit ?? ''}`}>
        <path d={arcPath(100, 104, 80, 180, 360)} className="arc-track wide" />
        {v !== null && <path d={arcPath(100, 104, 80, 180, 180 + 180 * Math.max(tt, 0.003))} className="arc-val wide is-tweened" style={{ stroke: accentVar(c.color) }} />}
        {ticks.map((k) => {
          const [x1, y1] = polar(100, 104, 92, 180 + 180 * k);
          const [x2, y2] = polar(100, 104, 98, 180 + 180 * k);
          return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} className="gauge-tick" />;
        })}
        <text x="100" y="96" className="svg-big" textAnchor="middle">{formatValue(v, 'float', c.precision ?? 1)}</text>
        <text x="100" y="118" className="svg-unit" textAnchor="middle">{c.unit ?? ''}</text>
        <text x="20" y="124" className="svg-tick" textAnchor="middle">{min}</text>
        <text x="180" y="124" className="svg-tick" textAnchor="middle">{max}</text>
      </svg>
    </div>
  );
}

function ProgressW({ widget, bound }: RendererProps) {
  const c = widget.config;
  const min = c.min ?? 0;
  const max = c.max ?? 100;
  const v = toNumber(bound.value);
  const t = v === null || max <= min ? 0 : clamp((v - min) / (max - min), 0, 1);
  const circ = 2 * Math.PI * 46;
  return (
    <div className="w-fill">
      <svg viewBox="0 0 120 120" className="w-svg" role="img" aria-label={`${c.title}: ${Math.round(t * 100)}%`}>
        <circle cx="60" cy="60" r="46" className="ring-track" />
        <circle cx="60" cy="60" r="46" className="ring-val" style={{ stroke: accentVar(c.color), strokeDasharray: `${circ * t} ${circ}` }} transform="rotate(-90 60 60)" />
        <text x="60" y="62" className="svg-big sm" textAnchor="middle">{v === null ? '—' : `${Math.round(t * 100)}%`}</text>
        <text x="60" y="80" className="svg-unit" textAnchor="middle">{v === null ? '' : `${formatValue(v, 'float', c.precision ?? 0)} ${c.unit ?? ''}`}</text>
      </svg>
    </div>
  );
}

function StatusW({ widget, bound }: RendererProps) {
  const c = widget.config;
  let tone: 'on' | 'off' | 'warn' = 'off';
  let label = c.offLabel || 'OFF';
  const v = bound.value;
  if (bound.status === 'offline') {
    tone = 'warn';
    label = 'DEVICE OFFLINE';
  } else if (v !== undefined && v !== null) {
    const n = typeof v === 'boolean' ? null : toNumber(v);
    if (n !== null && (c.thresholdLow !== undefined || c.thresholdHigh !== undefined)) {
      const warn = (c.thresholdLow !== undefined && n < c.thresholdLow) || (c.thresholdHigh !== undefined && n > c.thresholdHigh);
      tone = warn ? 'warn' : 'on';
      label = `${warn ? 'CHECK' : c.onLabel || 'OK'} · ${formatValue(n, 'float', 1)}`;
    } else if (typeof v === 'string' && bound.variable?.dataType === 'string') {
      tone = 'on';
      label = v;
    } else {
      tone = toBool(v) ? 'on' : 'off';
      label = tone === 'on' ? c.onLabel || 'ON' : c.offLabel || 'OFF';
    }
  }
  return (
    <div className="w-status">
      <span className={cn('led', `led-${tone}`)} style={tone === 'on' ? ({ '--wc': accentVar(c.color ?? 'lime') } as CSSProperties) : undefined} />
      <span className="w-status-label">{label}</span>
    </div>
  );
}

function Sparkline({ data, color, id }: { data: { v: number }[]; color: string; id: string }) {
  if (data.length < 2) return null;
  const vs = data.map((d) => d.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const span = hi - lo || 1;
  const pts = data.map((d, i) => `${((i / (data.length - 1)) * 100).toFixed(2)},${(28 - ((d.v - lo) / span) * 24).toFixed(2)}`);
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-spark" aria-hidden="true">
      <defs>
        <linearGradient id={`sg-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,30 ${pts.join(' ')} 100,30`} fill={`url(#sg-${id})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ValueCardW({ widget, bound }: RendererProps) {
  const c = widget.config;
  const hist = useHistory(bound.topic, 120);
  const vs = hist.map((h) => h.v);
  const prev = hist.length > 3 ? hist[hist.length - 4].v : null;
  const cur = toNumber(bound.value);
  const trend = prev === null || cur === null ? 0 : cur - prev;
  return (
    <div className="w-card">
      <div className="w-card-top">
        <span className="w-big">{formatValue(bound.value, 'float', c.precision ?? 1)}</span>
        {c.unit && <span className="w-unit">{c.unit}</span>}
        {Math.abs(trend) > 0.0001 && <span className={cn('w-trend', trend > 0 ? 'up' : 'down')}>{trend > 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(c.precision ?? 1)}</span>}
      </div>
      <Sparkline data={hist} color={accentVar(c.color)} id={widget.id} />
      <div className="w-minmax">
        <span>MIN {vs.length ? formatValue(Math.min(...vs), 'float', c.precision ?? 1) : '—'}</span>
        <span>MAX {vs.length ? formatValue(Math.max(...vs), 'float', c.precision ?? 1) : '—'}</span>
      </div>
    </div>
  );
}

/* ================================================================== charts */

function TimeChart({ widget, bound, area }: RendererProps & { area: boolean }) {
  const c = widget.config;
  const win = c.timeWindow ?? 60;
  const data = useHistory(bound.topic, win);
  const [ref, size] = useSize<HTMLDivElement>();
  const W = Math.max(size.w, 120);
  const H = Math.max(size.h, 60);
  const pad = { l: 40, r: 10, t: 8, b: 20 };
  const now = data.length ? data[data.length - 1].t : Date.now();
  const t0 = now - win * 1000;
  const vs = data.map((d) => d.v);
  let lo = c.min ?? (vs.length ? Math.min(...vs) : 0);
  let hi = c.max ?? (vs.length ? Math.max(...vs) : 1);
  if (c.min === undefined && c.max === undefined) {
    const span = hi - lo || Math.abs(hi) * 0.1 || 1;
    lo -= span * 0.15;
    hi += span * 0.15;
  }
  if (hi <= lo) hi = lo + 1;
  const x = (t: number) => pad.l + ((t - t0) / (win * 1000)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const pts = data.map((d) => `${x(d.t).toFixed(1)},${y(d.v).toFixed(1)}`);
  const color = accentVar(c.color);
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const last = data[data.length - 1];
  return (
    <div className="w-chart" ref={ref}>
      {size.w > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${c.title}: ${data.length} samples in the last ${win} seconds`}>
          <defs>
            <linearGradient id={`ag-${widget.id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={area ? 0.32 : 0.12} />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((tv, i) => (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={y(tv)} y2={y(tv)} className="grid-line" />
              <text x={pad.l - 6} y={y(tv) + 3} className="svg-tick" textAnchor="end">{formatValue(tv, 'float', Math.abs(hi - lo) < 5 ? 1 : 0)}</text>
            </g>
          ))}
          <text x={pad.l} y={H - 4} className="svg-tick">−{win >= 60 ? `${win / 60}m` : `${win}s`}</text>
          <text x={W - pad.r} y={H - 4} className="svg-tick" textAnchor="end">now</text>
          {pts.length > 1 && (
            <>
              <polygon points={`${x(data[0].t)},${H - pad.b} ${pts.join(' ')} ${x(last.t)},${H - pad.b}`} fill={`url(#ag-${widget.id})`} />
              <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
              <circle cx={x(last.t)} cy={y(last.v)} r="4" fill={color} className="chart-dot" />
            </>
          )}
        </svg>
      )}
      {last && (
        <div className="w-chart-last">
          {formatValue(last.v, 'float', c.precision ?? 1)} <small>{c.unit ?? ''}</small>
        </div>
      )}
      {bound.variable && data.length < 2 && <div className="w-chart-empty">Collecting samples…</div>}
    </div>
  );
}

function BarChartW({ widget, bound }: RendererProps) {
  const c = widget.config;
  const n = clamp(c.samples ?? 16, 2, 60);
  const data = useHistory(bound.topic, undefined, n);
  const vs = data.map((d) => d.v);
  const hi = Math.max(...vs, 0) || 1;
  const lo = Math.min(...vs, 0);
  return (
    <div className="w-bars" role="img" aria-label={`${c.title}: last ${data.length} readings`}>
      <div className="w-bars-plot">
        {data.map((d, i) => (
          <div key={d.t} className="w-bar" title={`${clock(d.t)} · ${formatValue(d.v, 'float', c.precision ?? 0)} ${c.unit ?? ''}`}>
            <span style={{ height: `${Math.max(2, ((d.v - lo) / (hi - lo || 1)) * 100)}%`, background: i === data.length - 1 ? accentVar(c.color) : undefined }} />
          </div>
        ))}
      </div>
      <div className="w-scale">
        <span>{data.length ? clock(data[0].t) : ''}</span>
        <span>{data.length ? `${formatValue(vs[vs.length - 1], 'float', c.precision ?? 0)} ${c.unit ?? ''}` : ''}</span>
      </div>
    </div>
  );
}

/* =================================================================== other */

function TableW({ widget, bound, projectId }: RendererProps) {
  const c = widget.config;
  const rows = clamp(c.samples ?? 12, 3, 50);
  const project = useStudio((s) => s.projects.find((p) => p.id === projectId));
  const deviceIds = project?.deviceIds ?? [];
  const msgs = useRuntime((s) => (c.source === 'messages' ? s.messages : null));
  const hist = useHistory(c.source === 'messages' ? null : bound.topic, undefined, rows);
  if (c.source === 'messages') {
    const list = (msgs ?? []).filter((m) => m.deviceId && deviceIds.includes(m.deviceId)).slice(-rows).reverse();
    return (
      <div className="w-table-wrap">
        <table className="w-table">
          <thead><tr><th>Time</th><th>Dir</th><th>Topic</th><th>Payload</th></tr></thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id}>
                <td>{clock(m.at)}</td>
                <td className={m.direction === 'in' ? 'dir-in' : 'dir-out'}>{m.direction === 'in' ? 'IN' : 'OUT'}</td>
                <td className="mono-cut">{m.topic.split('/').slice(-2).join('/')}</td>
                <td className="mono-cut">{m.payload}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={4} className="w-table-empty">No messages from this project’s devices yet.</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }
  const list = hist.slice().reverse();
  return (
    <div className="w-table-wrap">
      <table className="w-table">
        <thead><tr><th>Time</th><th>{bound.variable?.key ?? 'Value'}</th><th>Δ</th></tr></thead>
        <tbody>
          {list.map((h, i) => {
            const prev = list[i + 1];
            const d = prev ? h.v - prev.v : 0;
            return (
              <tr key={h.t}>
                <td>{clock(h.t)}</td>
                <td><strong>{formatValue(h.v, 'float', c.precision ?? 2)}</strong> {c.unit ?? bound.variable?.unit ?? ''}</td>
                <td className={d > 0 ? 'up' : d < 0 ? 'down' : ''}>{prev ? (d >= 0 ? '+' : '') + d.toFixed(c.precision ?? 2) : ''}</td>
              </tr>
            );
          })}
          {!list.length && <tr><td colSpan={3} className="w-table-empty">{bound.variable ? 'No readings yet.' : 'Bind a variable to list its readings.'}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function LabelW({ widget }: RendererProps) {
  const c = widget.config;
  return <div className={cn('w-label', `size-${c.size ?? 'md'}`, c.align === 'center' && 'is-center')}>{c.text || 'Label'}</div>;
}

function DividerW({ widget }: RendererProps) {
  return (
    <div className="w-divider">
      {widget.config.label ? <span>// {widget.config.label}</span> : null}
    </div>
  );
}

function DeviceStatusW({ widget }: RendererProps) {
  const deviceId = widget.config.deviceId;
  const device = useStudio((s) => s.devices.find((d) => d.id === deviceId));
  const rt = useRuntime((s) => (deviceId ? s.devices[deviceId] : undefined));
  const uptime = useRuntime((s) => (device ? s.values[`${device.topicPrefix}/telemetry/uptime`]?.value : undefined));
  const now = useNow();
  if (!device) return <div className="w-hint-center">Choose a device in Settings.</div>;
  return (
    <div className="w-device">
      <div className="w-device-head">
        <strong>{device.name}</strong>
        {device.simulated && <span className="sim-tag">SIM</span>}
      </div>
      <code className="w-device-id">{device.hardwareId}</code>
      <StateBadge state={rt?.state ?? 'waiting'} />
      <dl className="w-dl">
        <div><dt>Last seen</dt><dd>{timeAgo(rt?.lastSeen, now)}</dd></div>
        <div><dt>Messages</dt><dd>{rt?.messageCount ?? 0}</dd></div>
        <div><dt>Uptime</dt><dd>{toNumber(uptime) !== null ? formatDuration(toNumber(uptime)!) : '—'}</dd></div>
        <div><dt>Board</dt><dd>{device.board}</dd></div>
      </dl>
    </div>
  );
}

function EventLogW({ widget, projectId }: RendererProps) {
  const n = clamp(widget.config.samples ?? 20, 5, 50);
  const deviceIds = useStudio((s) => s.projects.find((p) => p.id === projectId)?.deviceIds ?? []);
  const events = useStudio((s) => s.activity.filter((a) => a.projectId === projectId || (!a.projectId && a.deviceId && deviceIds.includes(a.deviceId))).slice(0, n));
  const now = useNow();
  return (
    <ul className="w-log">
      {events.map((e) => (
        <li key={e.id}>
          <span className="w-log-time">{timeAgo(e.at, now)}</span>
          <span>{e.message}</span>
        </li>
      ))}
      {!events.length && <li className="w-hint-center">No events yet.</li>}
    </ul>
  );
}

/* ============================================================ new in 1.1 */

/** "Low=1, Medium=2, High=3" or "Off, Eco, Boost" → options. */
export function parseChoices(raw: string | undefined): { label: string; value: string }[] {
  const out = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf('=');
      return i > 0 ? { label: s.slice(0, i).trim(), value: s.slice(i + 1).trim() } : { label: s, value: s };
    })
    .filter((o) => o.label && o.value);
  return out.slice(0, 8);
}

function ModeSelectorW({ widget, bound, interactive, publish }: RendererProps) {
  const c = widget.config;
  const options = parseChoices(c.choices);
  const [current, setCurrent] = useControlValue<string>(bound, options[0]?.value ?? '', (v) => (v === undefined || v === null ? '' : String(v)));
  const pending = bound.command?.status === 'pending';
  if (!options.length) return <div className="w-hint-center">Add options in Settings, e.g. <code>Low=1, High=2</code>.</div>;
  const same = (a: string, b: string) => a === b || (toNumber(a) !== null && toNumber(a) === toNumber(b));
  return (
    <div className={cn('w-modes', options.length > 3 && 'is-grid')} role="radiogroup" aria-label={c.title} style={{ '--wc': accentVar(c.color) } as CSSProperties}>
      {options.map((o) => {
        const on = same(current, o.value);
        return (
          <button
            key={`${o.label}=${o.value}`}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.label === o.value ? o.label : `${o.label} (sends ${o.value})`}
            disabled={!interactive}
            className={cn('w-mode', on && 'is-on', on && pending && 'is-pending')}
            onClick={() => {
              if (on) return;
              setCurrent(o.value);
              const n = toNumber(o.value);
              publish(bound.variable?.dataType === 'integer' && n !== null ? n : o.value);
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Sends ON while held and OFF on release — for motors, horns, jog buttons. */
function MomentaryW({ widget, bound, interactive, publish }: RendererProps) {
  const c = widget.config;
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);
  const press = () => {
    if (!interactive || heldRef.current) return;
    heldRef.current = true;
    setHeld(true);
    publish(c.onValue ?? 'true');
  };
  const release = () => {
    if (!heldRef.current) return;
    heldRef.current = false;
    setHeld(false);
    publish(c.offValue ?? 'false');
  };
  // Never leave a motor running if the widget unmounts mid-press.
  useEffect(() => () => { if (heldRef.current) publish(c.offValue ?? 'false'); }, []);
  const reported = bound.value === undefined || bound.value === null ? null : toBool(bound.value);
  return (
    <div className="w-center">
      <button
        type="button"
        className={cn('w-press w-hold', held && 'is-held')}
        style={{ '--wc': accentVar(c.color) } as CSSProperties}
        disabled={!interactive}
        aria-pressed={held}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); press(); }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } }}
        onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } }}
        onBlur={release}
        onContextMenu={(e) => e.preventDefault()}
      >
        {held ? c.onLabel || 'RUNNING' : c.label || 'HOLD'}
      </button>
      <span className="w-note">{!bound.variable && interactive ? 'Not bound — nothing is sent' : reported === null ? 'Hold to run · release to stop' : `Device reports ${reported ? c.onLabel || 'ON' : c.offLabel || 'OFF'}`}</span>
    </div>
  );
}

/** Vertical tank / thermometer style level. */
function LevelBarW({ widget, bound }: RendererProps) {
  const c = widget.config;
  const min = c.min ?? 0;
  const max = c.max ?? 100;
  const v = toNumber(bound.value);
  const t = v === null || max <= min ? 0 : clamp((v - min) / (max - min), 0, 1);
  const tt = useTween(t, { ms: 600 });
  const warn = v !== null && ((c.thresholdLow !== undefined && v < c.thresholdLow) || (c.thresholdHigh !== undefined && v > c.thresholdHigh));
  const marks = [1, 0.75, 0.5, 0.25, 0];
  return (
    <div className="w-level" role="img" aria-label={`${c.title}: ${formatValue(v, 'float', c.precision ?? 0)} ${c.unit ?? ''}`}>
      <div className="w-level-scale" aria-hidden="true">
        {marks.map((m) => <span key={m}>{formatValue(min + (max - min) * m, 'float', 0)}</span>)}
      </div>
      <div className={cn('w-level-tank', warn && 'is-warn')} style={{ '--wc': accentVar(c.color) } as CSSProperties}>
        {c.thresholdHigh !== undefined && max > min && <i className="w-level-line" style={{ bottom: `${clamp((c.thresholdHigh - min) / (max - min), 0, 1) * 100}%` }} />}
        {c.thresholdLow !== undefined && max > min && <i className="w-level-line" style={{ bottom: `${clamp((c.thresholdLow - min) / (max - min), 0, 1) * 100}%` }} />}
        <span className="w-level-fill" style={{ height: `${tt * 100}%` }} />
      </div>
      <div className="w-level-read">
        <span className="w-big">{formatValue(v, 'float', c.precision ?? 0)}</span>
        {c.unit && <span className="w-unit">{c.unit}</span>}
        {warn && <span className="w-level-warn">CHECK</span>}
      </div>
    </div>
  );
}

const RENDERERS: Record<WidgetType, (p: RendererProps) => ReactNode> = {
  mode_selector: ModeSelectorW,
  momentary: MomentaryW,
  level_bar: LevelBarW,
  button: ButtonW,
  toggle: ToggleW,
  slider: SliderW,
  arc_slider: ArcSliderW,
  color_wheel: ColorWheelW,
  rotary: RotaryW,
  stepper: StepperW,
  numeric: NumericW,
  text: TextW,
  gauge: GaugeW,
  progress: ProgressW,
  status: StatusW,
  value_card: ValueCardW,
  line_chart: (p) => <TimeChart {...p} area={false} />,
  area_chart: (p) => <TimeChart {...p} area />,
  bar_chart: BarChartW,
  table: TableW,
  label: LabelW,
  divider: DividerW,
  device_status: DeviceStatusW,
  event_log: EventLogW,
};

export function WidgetRenderer(p: RendererProps) {
  const R = RENDERERS[p.widget.type];
  return <R {...p} />;
}
