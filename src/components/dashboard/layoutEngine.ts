import type { Widget, WidgetLayout } from '../../types/models';
import { clamp } from '../../utils';

/**
 * Grid layout maths for the dashboard canvas: collision detection,
 * push-down and vertical compaction (the same model as react-grid-layout's
 * vertical compaction, implemented in-repo to stay dependency-free).
 */

export const COLS = 12;

export interface Item extends WidgetLayout {
  id: string;
}

export const collides = (a: WidgetLayout, b: WidgetLayout) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Place `priorityId` first, then pack every other item upward without overlaps. */
export function compact(items: Item[], priorityId?: string): Item[] {
  const sorted = items
    .map((i) => ({ ...i, x: clamp(i.x, 0, COLS - Math.min(i.w, COLS)), w: Math.min(i.w, COLS), y: Math.max(0, i.y) }))
    .sort((a, b) => {
      if (a.id === priorityId) return -1;
      if (b.id === priorityId) return 1;
      return a.y - b.y || a.x - b.x;
    });
  const placed: Item[] = [];
  for (const it of sorted) {
    let y = it.y;
    while (y > 0 && !placed.some((p) => collides({ ...it, y: y - 1 }, p))) y--;
    while (placed.some((p) => collides({ ...it, y }, p))) y++;
    placed.push({ ...it, y });
  }
  return placed;
}

export function applyLayout(widgets: Widget[], items: Item[]): Widget[] {
  const map = new Map(items.map((i) => [i.id, i]));
  return widgets.map((w) => {
    const i = map.get(w.id);
    if (!i) return w;
    if (i.x === w.layout.x && i.y === w.layout.y && i.w === w.layout.w && i.h === w.layout.h) return w;
    return { ...w, layout: { x: i.x, y: i.y, w: i.w, h: i.h } };
  });
}

export const toItems = (widgets: Widget[]): Item[] => widgets.map((w) => ({ id: w.id, ...w.layout }));

export function sameLayout(a: Widget[], b: Widget[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((w, i) => {
    const o = b[i];
    return o && o.id === w.id && o.layout.x === w.layout.x && o.layout.y === w.layout.y && o.layout.w === w.layout.w && o.layout.h === w.layout.h;
  });
}

/** First free spot (top-left first) for a new item of the given size. */
export function findSpot(items: Item[], w: number, h: number): { x: number; y: number } {
  const maxY = items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= COLS - w; x++) {
      const cand = { x, y, w, h };
      if (!items.some((i) => collides(cand, i))) return { x, y };
    }
  }
  return { x: 0, y: maxY };
}
