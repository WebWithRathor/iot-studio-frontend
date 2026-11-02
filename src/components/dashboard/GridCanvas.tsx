import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Widget, WidgetType } from '../../types/models';
import { clamp, cn } from '../../utils';
import { getWidgetDef } from '../../widgets/definitions';
import { WidgetFrame } from '../../widgets/WidgetFrame';
import { useSize } from '../../widgets/hooks';
import { applyLayout, COLS, compact, sameLayout, toItems, type Item } from './layoutEngine';

/** Shared between the library (drag source) and the canvas (drop target). */
export const dragPayload: { type: WidgetType | null } = { type: null };
export const DRAG_MIME = 'application/x-kokoon-widget';

interface Interaction {
  id: string;
  kind: 'move' | 'resize';
  startX: number;
  startY: number;
  orig: Item;
  moved: boolean;
}

export function GridCanvas(props: {
  widgets: Widget[];
  projectId: string;
  rowHeight: number;
  gap: number;
  selectedId: string | null;
  showHeaders: boolean;
  onSelect: (id: string | null) => void;
  onCommit: (widgets: Widget[]) => void;
  onDropNew: (type: WidgetType, x: number, y: number) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { widgets, rowHeight: rowH, gap } = props;
  const [ref, size] = useSize<HTMLDivElement>();
  const [live, setLive] = useState<{ items: Item[]; activeId: string; px: { left: number; top: number; width: number; height: number } } | null>(null);
  const [dropGhost, setDropGhost] = useState<Item | null>(null);
  const inter = useRef<Interaction | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  const colW = size.w > 0 ? (size.w - gap * (COLS - 1)) / COLS : 60;
  const cellX = colW + gap;
  const cellY = rowH + gap;
  const px = (i: { x: number; y: number; w: number; h: number }) => ({
    left: i.x * cellX,
    top: i.y * cellY,
    width: i.w * colW + (i.w - 1) * gap,
    height: i.h * rowH + (i.h - 1) * gap,
  });

  const items = live?.items ?? toItems(widgets);
  const maxY = Math.max(items.reduce((m, i) => Math.max(m, i.y + i.h), 0), dropGhost ? dropGhost.y + dropGhost.h : 0);
  const height = Math.max((maxY + 4) * cellY, 520);

  // Window listeners only while an interaction is running — no leaks.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const it = inter.current;
      if (!it) return;
      const dx = e.clientX - it.startX;
      const dy = e.clientY - it.startY;
      if (!it.moved && Math.hypot(dx, dy) < 4) return;
      it.moved = true;
      const def = getWidgetDef(widgets.find((w) => w.id === it.id)!.type);
      let target: Item;
      let pix: { left: number; top: number; width: number; height: number };
      if (it.kind === 'move') {
        const x = clamp(Math.round(it.orig.x + dx / cellX), 0, COLS - it.orig.w);
        const y = Math.max(0, Math.round(it.orig.y + dy / cellY));
        target = { ...it.orig, x, y };
        const o = px(it.orig);
        pix = { ...o, left: o.left + dx, top: o.top + dy };
      } else {
        const w = clamp(Math.round(it.orig.w + dx / cellX), def.minSize.w, COLS - it.orig.x);
        const h = clamp(Math.round(it.orig.h + dy / cellY), def.minSize.h, 24);
        target = { ...it.orig, w, h };
        const o = px(it.orig);
        pix = { ...o, width: Math.max(colW, o.width + dx), height: Math.max(rowH, o.height + dy) };
      }
      const others = toItems(widgets).filter((i) => i.id !== it.id);
      setLive({ items: compact([target, ...others], it.id), activeId: it.id, px: pix });
    };
    const up = () => {
      const it = inter.current;
      inter.current = null;
      document.body.classList.remove('is-dragging');
      const l = liveRef.current;
      setLive(null);
      if (it?.moved && l) {
        const next = applyLayout(widgets, l.items);
        if (!sameLayout(next, widgets)) props.onCommit(next);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [widgets, cellX, cellY, colW, rowH]);

  const start = (e: any, id: string, kind: 'move' | 'resize') => {
    if (e.button !== 0) return;
    if (kind === 'move' && (e.target as HTMLElement).closest('.no-drag')) return;
    const w = widgets.find((x) => x.id === id);
    if (!w) return;
    props.onSelect(id);
    inter.current = { id, kind, startX: e.clientX, startY: e.clientY, orig: { id, ...w.layout }, moved: false };
    document.body.classList.add('is-dragging');
    e.preventDefault();
    e.stopPropagation();
  };

  const cellFromEvent = (e: any, w: number, h: number): Item => {
    const r = (ref.current as HTMLElement).getBoundingClientRect();
    const x = clamp(Math.floor((e.clientX - r.left) / cellX - w / 2 + 0.5), 0, COLS - w);
    const y = Math.max(0, Math.floor((e.clientY - r.top) / cellY - h / 2 + 0.5));
    return { id: '__drop', x, y, w, h };
  };

  return (
    <div
      ref={ref}
      className={cn('grid-canvas', live && 'is-interacting')}
      style={{ height, '--cell-x': `${cellX}px`, '--cell-y': `${cellY}px`, '--gap': `${gap}px` } as CSSProperties}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) props.onSelect(null);
      }}
      onDragOver={(e) => {
        if (!dragPayload.type) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        const def = getWidgetDef(dragPayload.type);
        const g = cellFromEvent(e, def.defaultSize.w, def.defaultSize.h);
        setDropGhost((p) => (p && p.x === g.x && p.y === g.y ? p : g));
      }}
      onDragLeave={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropGhost(null);
      }}
      onDrop={(e) => {
        const type = dragPayload.type;
        dragPayload.type = null;
        setDropGhost(null);
        if (!type) return;
        e.preventDefault();
        const def = getWidgetDef(type);
        const g = cellFromEvent(e, def.defaultSize.w, def.defaultSize.h);
        props.onDropNew(type, g.x, g.y);
      }}
    >
      {live && (() => {
        const target = live.items.find((i) => i.id === live.activeId);
        return target ? <div className="grid-placeholder" style={px(target)} /> : null;
      })()}
      {dropGhost && <div className="grid-placeholder is-drop" style={px(dropGhost)} />}
      {widgets.map((w) => {
        const item = items.find((i) => i.id === w.id) ?? { id: w.id, ...w.layout };
        const active = live?.activeId === w.id;
        const pos = active ? live!.px : px(item);
        return (
          <div
            key={w.id}
            className={cn('grid-item', active && 'is-active', props.selectedId === w.id && 'is-selected')}
            style={pos}
            onPointerDown={(e) => start(e, w.id, 'move')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                props.onSelect(w.id);
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`${getWidgetDef(w.type).name}: ${w.config.title}. Press Enter to select; arrow keys move, Shift+arrows resize.`}
            aria-pressed={props.selectedId === w.id}
          >
            <WidgetFrame
              widget={w}
              projectId={props.projectId}
              mode="edit"
              selected={props.selectedId === w.id}
              showHeader={props.showHeaders}
              onDuplicate={() => props.onDuplicate(w.id)}
              onDelete={() => props.onDelete(w.id)}
            />
            {props.selectedId === w.id && (
              <span className="resize-handle no-drag" onPointerDown={(e) => start(e, w.id, 'resize')} aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}
