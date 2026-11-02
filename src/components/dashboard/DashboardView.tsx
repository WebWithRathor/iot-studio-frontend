import type { CSSProperties } from 'react';
import type { Dashboard } from '../../types/models';
import { WidgetFrame } from '../../widgets/WidgetFrame';
import { useSize } from '../../widgets/hooks';
import { cn } from '../../utils';

/**
 * Read-only placement of a dashboard (preview mode and project pages).
 * Widgets stay fully interactive. Below ~640px the grid stacks into one
 * column in reading order instead of shrinking every widget.
 */
export function DashboardView({ dashboard, rowHeight = 56, gap = 12, showHeaders = true }: { dashboard: Dashboard; rowHeight?: number; gap?: number; showHeaders?: boolean }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const stacked = size.w > 0 && size.w < 640;
  const widgets = dashboard.widgets
    .filter((w) => w.config.visible !== false)
    .slice()
    .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
  return (
    <div
      ref={ref}
      className={cn('dash-view', stacked && 'is-stacked')}
      style={{ '--row': `${rowHeight}px`, '--gap': `${gap}px` } as CSSProperties}
    >
      {widgets.map((w) => (
        <div
          key={w.id}
          className="dash-cell"
          style={
            stacked
              ? { gridRow: `span ${Math.max(w.layout.h, w.type === 'label' || w.type === 'divider' ? 1 : 2)}` }
              : { gridColumn: `${w.layout.x + 1} / span ${w.layout.w}`, gridRow: `${w.layout.y + 1} / span ${w.layout.h}` }
          }
        >
          <WidgetFrame widget={w} projectId={dashboard.projectId} mode="preview" showHeader={showHeaders} />
        </div>
      ))}
    </div>
  );
}
