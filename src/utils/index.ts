import type { DataType } from '../types/models';

export const uid = (prefix = 'id'): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const cn = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

export function timeAgo(t: number | null | undefined, now = Date.now()): string {
  if (!t) return '—';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function clock(t: number, withMs = false): string {
  const d = new Date(t);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  const base = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return withMs ? `${base}.${p(d.getMilliseconds(), 3)}` : base;
}

export function formatDuration(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return ['true', '1', 'on', 'yes'].includes(v.toLowerCase());
  return false;
}

export function formatValue(value: unknown, dataType: DataType | undefined, precision?: number): string {
  if (value === undefined || value === null) return '—';
  if (dataType === 'boolean' || typeof value === 'boolean') return toBool(value) ? 'ON' : 'OFF';
  if (dataType === 'json' || (typeof value === 'object' && value !== null)) {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  const n = toNumber(value);
  if (n !== null && dataType !== 'string' && dataType !== 'color') {
    const p = precision ?? (dataType === 'integer' ? 0 : 1);
    return n.toFixed(clamp(p, 0, 6));
  }
  return String(value);
}

/** Coerce an arbitrary value into the shape a data type expects. */
export function coerce(value: unknown, dataType: DataType): unknown {
  switch (dataType) {
    case 'boolean': return toBool(value);
    case 'integer': return Math.round(toNumber(value) ?? 0);
    case 'float': return toNumber(value) ?? 0;
    case 'color': return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#000000';
    case 'json':
      if (typeof value === 'string') { try { return JSON.parse(value); } catch { return { value }; } }
      return value;
    default: return value === undefined || value === null ? '' : String(value);
  }
}

export function encodePayload(value: unknown, unit?: string): string {
  return JSON.stringify(unit ? { value, unit } : { value });
}

export function decodePayload(payload: string): unknown {
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object' && 'value' in parsed) return (parsed as { value: unknown }).value;
    return parsed;
  } catch {
    return payload;
  }
}

export function prettyJson(payload: string): string {
  try { return JSON.stringify(JSON.parse(payload), null, 2); } catch { return payload; }
}

export function downloadJson(filename: string, data: unknown): boolean {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ color */

export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToHsv(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max === 0 ? 0 : d / max, max];
}

export const isValidHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

/* --------------------------------------------------------------- geometry */

export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** SVG arc path, angles in degrees, 0° = +x axis, clockwise (screen coords). */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const sweep = Math.max(0.0001, end - start);
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, start + sweep);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
