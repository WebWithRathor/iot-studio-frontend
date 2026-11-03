import { useState } from 'react';
import { navigate } from '../../lib/router';
import type { WidgetType } from '../../types/models';
import { TokenMeter } from '../tokens';
import { cn } from '../../utils';
import { CATEGORY_LABELS, WIDGETS, type WidgetCategory } from '../../widgets/definitions';
import { Icon } from '../Icon';
import { IconButton } from '../ui';
import { DRAG_MIME, dragPayload } from './GridCanvas';

/** What a first dashboard needs; the full list is one click away. */
const BASICS: WidgetType[] = ['toggle', 'button', 'slider', 'numeric', 'gauge', 'status', 'line_chart', 'label'];

/** `nextCost` = tokens the next widget costs on this dashboard (0 while sample slots are free). */
export function Library({ onAdd, onClose, nextCost, affordable }: { onAdd: (type: WidgetType) => void; onClose: () => void; nextCost: number; affordable: boolean }) {
  const [q, setQ] = useState('');
  const [hover, setHover] = useState(false);
  const [cat, setCat] = useState<WidgetCategory | 'all'>('all');
  const [showAll, setShowAll] = useState(false);
  const query = q.trim().toLowerCase();
  const basicsOnly = !showAll && !query;
  const list = WIDGETS.filter(
    (w) => (cat === 'all' || w.category === cat) && (!query || `${w.name} ${w.description} ${w.category}`.toLowerCase().includes(query)),
  );
  const groups = basicsOnly
    ? [{ c: 'basics', label: 'Most used', items: BASICS.map((t) => WIDGETS.find((w) => w.type === t)!).filter(Boolean) }]
    : (Object.keys(CATEGORY_LABELS) as WidgetCategory[])
        .map((c) => ({ c, label: CATEGORY_LABELS[c], items: list.filter((w) => w.category === c) }))
        .filter((g) => g.items.length);

  return (
    <aside className="panel library" aria-label="Component library">
      <div className="panel-head">
        <div className="kicker kicker-accent">// COMPONENTS</div>
        <IconButton icon="LuX" label="Close library" onClick={onClose} />
      </div>
      {!affordable && (
        <div className="lib-tokens">
          <TokenMeter compact pending={hover ? nextCost : 0} />
          <p className="lib-tokens-note"><Icon name="LuLock" size={12} /> Out of tokens — <button type="button" className="link-btn" onClick={() => navigate('/plan')}>upgrade or free some up</button></p>
        </div>
      )}
      <div className="lib-search">
        <Icon name="LuSearch" size={15} />
        <input id="lib-search" className="input-bare" placeholder="Search components" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search components" />
      </div>
      {!basicsOnly && (
        <div className="chips" role="tablist" aria-label="Filter by category">
          {(['all', ...Object.keys(CATEGORY_LABELS)] as (WidgetCategory | 'all')[]).map((c) => (
            <button key={c} type="button" role="tab" aria-selected={cat === c} className={cn('chip', cat === c && 'is-active')} onClick={() => setCat(c)}>
              {c === 'all' ? 'All' : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      )}
      <div className="lib-list">
        {groups.map((g) => (
          <section key={g.c}>
            <h3 className="lib-group">{g.label}</h3>
            {g.items.map((w) => (
              <button
                key={w.type}
                type="button"
                className={cn('lib-item', !affordable && 'is-locked')}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                onFocus={() => setHover(true)}
                onBlur={() => setHover(false)}
                draggable
                onDragStart={(e) => {
                  dragPayload.type = w.type;
                  e.dataTransfer.setData(DRAG_MIME, w.type);
                  e.dataTransfer.setData('text/plain', w.name);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onDragEnd={() => { dragPayload.type = null; }}
                onClick={() => onAdd(w.type)}
                title={nextCost ? `Add ${w.name} — ${nextCost} tokens (or drag it onto the canvas)` : `Add ${w.name} (or drag it onto the canvas)`}
              >
                <span className={cn('lib-icon', `cat-${w.category}`)}><Icon name={w.icon} size={18} /></span>
                <span className="lib-text">
                  <strong>{w.name}</strong>
                  <small>{w.description}</small>
                </span>
                <Icon name={affordable ? 'LuPlus' : 'LuLock'} size={15} className="lib-add" />
              </button>
            ))}
          </section>
        ))}
        {!groups.length && <p className="lib-empty">No component matches “{q}”.</p>}
        {!query && (
          <button type="button" className="link-btn lib-more" onClick={() => { setShowAll(!showAll); setCat('all'); }}>
            {showAll ? 'Show fewer' : `Show all ${WIDGETS.length} widgets`}
          </button>
        )}
      </div>
      <p className="lib-foot">Click to add, or drag onto the canvas.{nextCost ? ` Each widget uses ${nextCost} tokens; deleting gives them back.` : ''}</p>
    </aside>
  );
}
