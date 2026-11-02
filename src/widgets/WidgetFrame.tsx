import { Icon } from '../components/Icon';
import { sendCommand } from '../state/runtime';
import { useStudio } from '../state/studio';
import { toast } from '../state/ui';
import type { Widget } from '../types/models';
import { cn, timeAgo } from '../utils';
import { checkCompatibility, getWidgetDef } from './definitions';
import { useBoundValue, useNow, type BoundValue } from './hooks';
import { WidgetRenderer } from './renderers';

function StatusStrip({ bound, edit, io }: { bound: BoundValue; edit: boolean; io: string }) {
  const now = useNow();
  if (io === 'none') return null;
  const c = bound.command;
  // Command feedback takes priority for controls.
  if (io === 'write' && c && now - c.at < 15000) {
    if (c.status === 'pending') return <div className="w-strip is-pending"><span className="spinner" /> Sent {JSON.stringify(c.value)} · waiting for ack</div>;
    if (c.status === 'acknowledged') return <div className="w-strip is-ok"><Icon name="LuCheck" size={12} /> Device ack · {Math.max(0, (c.ackAt ?? c.at) - c.at)} ms {bound.device?.simulated && <span className="sim-tag">SIM</span>}</div>;
    return <div className="w-strip is-bad"><Icon name="LuCircleAlert" size={12} /> {c.reason ?? 'Command failed'}</div>;
  }
  switch (bound.status) {
    case 'unbound':
      return <div className="w-strip is-unbound"><Icon name="LuLink" size={12} /> {edit ? 'Not bound — select to choose a variable' : 'Not bound to a variable'}</div>;
    case 'missing':
      return <div className="w-strip is-bad"><Icon name="LuCircleAlert" size={12} /> Bound variable was deleted</div>;
    case 'waiting':
      return <div className="w-strip is-wait"><span className="pulse-dot" /> Waiting for data</div>;
    case 'offline':
      return <div className="w-strip is-bad"><Icon name="LuWifiOff" size={12} /> Device offline · last value {timeAgo(bound.at, now)}</div>;
    case 'real-hw':
      return <div className="w-strip is-info"><Icon name="LuPlug" size={12} /> Real hardware · no broker connected in demo mode</div>;
    default:
      return null;
  }
}

export function WidgetFrame(props: {
  widget: Widget;
  projectId: string;
  mode: 'edit' | 'preview';
  selected?: boolean;
  showHeader?: boolean;
  onDuplicate?: () => void;
  onDelete?: () => void;
}) {
  const { widget, mode, projectId } = props;
  const def = getWidgetDef(widget.type);
  const bound = useBoundValue(widget);
  const projectName = useStudio((s) => s.projects.find((p) => p.id === projectId)?.name ?? '');
  const edit = mode === 'edit';
  const headerOn = widget.config.showHeader !== false && props.showHeader !== false && widget.type !== 'divider' && widget.type !== 'label';

  const publish = (value: unknown) => {
    const v = bound.variable;
    if (!v) return; // unbound controls only change locally
    const compat = checkCompatibility(def, v);
    if (compat.level === 'error') {
      toast(`${widget.config.title}: ${compat.reason}`, 'error');
      return;
    }
    void sendCommand(v, value, { projectId, source: `${projectName} › ${widget.config.title}` });
  };

  const live = bound.status === 'live';
  return (
    <div
      className={cn(
        'widget',
        `widget-${widget.type}`,
        edit && 'is-edit',
        props.selected && 'is-selected',
        widget.config.visible === false && 'is-hidden',
        !headerOn && 'no-header',
      )}
      data-widget-id={widget.id}
    >
      {headerOn && (
        <div className="widget-head">
          <span className="widget-title" title={widget.config.description || widget.config.title}>{widget.config.title}</span>
          {def.io !== 'none' && live && (
            <span className="live-chip" title={bound.device?.simulated ? 'Live simulated data' : 'Live'}>
              <i /> {bound.device?.simulated ? 'SIM' : 'LIVE'}
            </span>
          )}
        </div>
      )}
      <div className="widget-body">
        <WidgetRenderer widget={widget} bound={bound} interactive={!edit} publish={publish} projectId={projectId} />
      </div>
      <StatusStrip bound={bound} edit={edit} io={def.io} />
      {edit && widget.config.visible === false && <span className="hidden-tag">Hidden in preview</span>}
      {edit && props.selected && (
        <div className="widget-tools no-drag">
          <button type="button" onClick={props.onDuplicate} aria-label="Duplicate widget" title="Duplicate (Ctrl+D)"><Icon name="LuCopy" size={14} /></button>
          <button type="button" onClick={props.onDelete} aria-label="Delete widget" title="Delete (Del)"><Icon name="LuTrash2" size={14} /></button>
        </div>
      )}
    </div>
  );
}
