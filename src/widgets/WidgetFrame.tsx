import { Icon } from '../components/Icon';
import { sendCommand } from '../state/runtime';
import { useStudio } from '../state/studio';
import { toast } from '../state/ui';
import type { Widget } from '../types/models';
import { cn, timeAgo } from '../utils';
import { checkCompatibility, getWidgetDef } from './definitions';
import { useBoundValue, useNow, type BoundValue } from './hooks';
import { WidgetRenderer } from './renderers';

/** The backend's reasons, said the way a student can act on them. */
export function whyFailed(reason: string | undefined, key: string | undefined): string {
  const k = key ? `“${key}”` : 'this variable';
  if (!reason) return `${k} isn’t working: the board didn’t answer.`;
  if (/No acknowledgement from the device/i.test(reason)) return `${k} isn’t working: the board didn’t answer. Is it online, with a “When IoT command received” block for ${k}?`;
  if (/^Device: unknown variable/i.test(reason)) return `${k} isn’t working: the board’s program doesn’t declare it. Add a “Declare IoT variable” block for ${k} and flash again.`;
  if (/^Device: /i.test(reason)) return `${k} isn’t working: the board said “${reason.slice(8)}”.`;
  return `${k} isn’t working: ${reason}`;
}

function StatusStrip({ bound, edit, io }: { bound: BoundValue; edit: boolean; io: string }) {
  const now = useNow();
  if (io === 'none') return null;
  const c = bound.command;
  const key = bound.variable?.key;
  // What happened to the last send comes first for controls. A failure stays until the next send.
  if (io === 'write' && c) {
    if (c.status === 'pending') return <div className="w-strip is-pending"><span className="spinner" /> Sending {JSON.stringify(c.value)}…</div>;
    if (c.status === 'failed') return <div className="w-strip is-bad" title={whyFailed(c.reason, key)}><Icon name="LuCircleAlert" size={12} /> {whyFailed(c.reason, key)}</div>;
    if (now - c.at < 15000) return <div className="w-strip is-ok"><Icon name="LuCheck" size={12} /> Board got {JSON.stringify(c.value)} · {Math.max(0, (c.ackAt ?? c.at) - c.at)} ms {bound.device?.simulated && <span className="sim-tag">SIM</span>}</div>;
  }
  switch (bound.status) {
    case 'unbound':
      return <div className="w-strip is-unbound"><Icon name="LuLink" size={12} /> {edit ? 'Not connected — pick a variable in Data' : 'Not connected to a variable'}</div>;
    case 'missing':
      return <div className="w-strip is-bad"><Icon name="LuCircleAlert" size={12} /> Its variable was deleted</div>;
    case 'waiting':
      return <div className="w-strip is-wait"><span className="pulse-dot" /> Waiting for the board to send {key ? `“${key}”` : 'a value'}</div>;
    case 'ready':
      return <div className="w-strip is-info"><Icon name="LuSend" size={12} /> {edit ? `Sends “${key}” to the board — try it in Preview` : `Sends “${key}” to the board`}</div>;
    case 'sending':
      return <div className="w-strip is-pending"><span className="spinner" /> Sending…</div>;
    case 'sent':
      return <div className="w-strip is-ok"><Icon name="LuCheck" size={12} /> Board got it · {timeAgo(bound.at, now)}</div>;
    case 'failed':
      return <div className="w-strip is-bad" title={whyFailed(c?.reason, key)}><Icon name="LuCircleAlert" size={12} /> {whyFailed(c?.reason, key)}</div>;
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

  const live = bound.status === 'live' || bound.status === 'sent';
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
