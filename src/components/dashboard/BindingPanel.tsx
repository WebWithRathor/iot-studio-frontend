import { useState } from 'react';
import { variableMapping } from '../../services';
import { sendCommand, useRuntime } from '../../state/runtime';
import { createVariable, importDeviceVariable, useStudio } from '../../state/studio';
import type { Binding, DataType, ID, Variable, Widget } from '../../types/models';
import { cn, formatValue, timeAgo } from '../../utils';
import { checkCompatibility, dataTypeLabel, getWidgetDef } from '../../widgets/definitions';
import { useNow } from '../../widgets/hooks';
import { whyFailed } from '../../widgets/WidgetFrame';
import { Icon } from '../Icon';
import { Badge, Button, Field, More } from '../ui';
import { DIRECTION_META, VariableForm } from '../VariableForm';

/**
 * Data tab of a widget: pick the variable it shows or sends. Everything the
 * board declared in the LMS is listed; picking one just works. Topics and
 * firmware mapping are under "Technical details".
 */

function LastValue({ v }: { v: Variable }) {
  const topic = v.stateTopic ?? v.commandTopic ?? '';
  const e = useRuntime((s) => s.values[topic]);
  const c = useRuntime((s) => (v.commandTopic ? s.commands[v.commandTopic] : undefined));
  const now = useNow();
  if (e) return <span>{formatValue(e.value, v.dataType)} {v.unit ?? ''} · {timeAgo(e.at, now)}</span>;
  if (c) return <span>sent {formatValue(c.value, v.dataType)} · {timeAgo(c.at, now)}</span>;
  return <span className="muted">nothing yet</span>;
}

/** A harmless value to try a control with: on, the lowest number, a short text. */
function testValue(widget: Widget, v: Variable): unknown {
  const c = widget.config;
  switch (v.dataType) {
    case 'boolean': return c.onValue !== undefined ? c.onValue !== 'false' : true;
    case 'integer':
    case 'float': return c.defaultValue ?? c.min ?? v.min ?? 0;
    case 'color': return '#ff8800';
    case 'json': return {};
    default: return c.pressValue ?? c.onValue ?? 'test';
  }
}

/** "Send test" for controls: sends once and reports the board's answer right here. */
function SendTest({ widget, variable, projectId }: { widget: Widget; variable: Variable; projectId: ID }) {
  const c = useRuntime((s) => (variable.commandTopic ? s.commands[variable.commandTopic] : undefined));
  const [sentAt, setSentAt] = useState<number | null>(null);
  const mine = c && sentAt !== null && c.at >= sentAt;
  return (
    <div className="bind-test">
      <Button size="sm" icon="LuSend" disabled={Boolean(mine) && c?.status === 'pending'} onClick={() => {
        setSentAt(Date.now());
        void sendCommand(variable, testValue(widget, variable), { projectId, source: `Test › ${widget.config.title}` });
      }}>Send a test</Button>
      {mine && c.status === 'pending' && <span className="muted small"><span className="spinner" /> Waiting for the board…</span>}
      {mine && c.status === 'acknowledged' && <span className="bind-test-ok"><Icon name="LuCheck" size={13} /> The board got it.</span>}
      {mine && c.status === 'failed' && <span className="bind-test-bad"><Icon name="LuCircleAlert" size={13} /> {whyFailed(c.reason, variable.key)}</span>}
    </div>
  );
}

export function BindingPanel({ widget, projectId, onBind }: { widget: Widget; projectId: ID; onBind: (b: Binding | null, v?: Variable) => void }) {
  const def = getWidgetDef(widget.type);
  const project = useStudio((s) => s.projects.find((p) => p.id === projectId));
  const devices = useStudio((s) => s.devices.filter((d) => project?.deviceIds.includes(d.id)));
  const variables = useStudio((s) => s.variables.filter((v) => v.projectId === projectId));
  const bound = variables.find((v) => v.id === widget.binding?.variableId) ?? null;
  const [deviceFilter, setDeviceFilter] = useState<string>('all');
  const [creating, setCreating] = useState(false);

  if (def.io === 'none') {
    return (
      <div className="bind-none">
        <Icon name="LuInfo" size={16} />
        <p>
          {widget.type === 'device_status'
            ? 'This widget shows a board, not a value. Choose the board in the Settings tab.'
            : widget.type === 'event_log'
              ? 'Shows this project’s activity — nothing to connect.'
              : 'This widget is static and shows no data.'}
        </p>
      </div>
    );
  }

  const sends = def.io === 'write';
  const pickDevice = (id: ID | null | undefined) => deviceFilter === 'all' || (deviceFilter === 'none' ? !id : id === deviceFilter);
  // Project variables plus anything the board declared that isn't in the project yet, as one list
  const options = [
    ...variables.filter((v) => pickDevice(v.deviceId)).map((v) => ({ id: v.id, v, device: devices.find((d) => d.id === v.deviceId), add: null as null | { deviceId: ID; key: string } })),
    ...devices
      .filter((d) => pickDevice(d.id))
      .flatMap((d) =>
        d.capabilities
          .filter((c) => !variables.some((v) => v.deviceId === d.id && v.key === c.key))
          .map((c) => ({
            id: `${d.id}:${c.key}`,
            v: { ...c, id: '', projectId, deviceId: d.id, firmwareRef: null, createdAt: 0, stateTopic: c.direction !== 'command' ? 'x' : undefined, commandTopic: c.direction !== 'telemetry' ? 'x' : undefined } as Variable,
            device: d,
            add: { deviceId: d.id, key: c.key },
          })),
      ),
  ]
    .map((o) => ({ ...o, compat: checkCompatibility(def, o.v) }))
    .sort((a, b) => Number(a.compat.level === 'error') - Number(b.compat.level === 'error'));
  const isNumericRead = def.io === 'read' && bound && (bound.dataType === 'integer' || bound.dataType === 'float');

  return (
    <div className="bind">
      <p className="bind-what">
        <Icon name={sends ? 'LuSend' : 'LuArrowDownLeft'} size={14} />
        {sends ? 'This widget sends a value to your board.' : 'This widget shows a value from your board.'}
      </p>

      {bound ? (
        <div className="bind-current cut-frame">
          <div className="bind-current-head">
            <div>
              <div className="kicker kicker-accent">// CONNECTED TO</div>
              <strong className="bind-name">{bound.displayName}</strong>
              <div className="muted small"><code>{bound.key}</code> · {dataTypeLabel(bound.dataType)}{bound.unit ? ` · ${bound.unit}` : ''}</div>
            </div>
            <Button size="sm" icon="LuX" onClick={() => onBind(null)}>Change</Button>
          </div>
          <p className="small"><span className="muted">Last value:</span> <LastValue v={bound} /></p>
          {(() => {
            const c = checkCompatibility(def, bound);
            return c.level !== 'ok' ? <p className={cn('bind-warn', c.level === 'error' && 'is-error')}><Icon name="LuTriangleAlert" size={14} /> {c.reason}</p> : null;
          })()}
          {sends && bound.commandTopic && <SendTest widget={widget} variable={bound} projectId={projectId} />}
          <More label="Technical details">
            <dl className="bind-map">
              {bound.stateTopic && <div><dt>↓ State topic</dt><dd><code className="wrap">{bound.stateTopic}</code></dd></div>}
              {bound.commandTopic && <div><dt>↑ Command topic</dt><dd><code className="wrap">{bound.commandTopic}</code></dd></div>}
              <div><dt>Direction</dt><dd>{DIRECTION_META[bound.direction].arrow} {DIRECTION_META[bound.direction].label}</dd></div>
              <div><dt>In the LMS program</dt><dd className="muted">{variableMapping.describe(bound)}</dd></div>
            </dl>
            {isNumericRead && (
              <div className="form-row">
                <Field label="Display scale" htmlFor="bind-scale" tip="Shown value = raw × scale + offset. Useful for unit conversion (e.g. °C → °F: ×1.8 +32).">
                  <input id="bind-scale" className="input" type="number" step="any" value={widget.binding?.scale ?? ''} placeholder="1"
                    onChange={(e) => onBind({ ...widget.binding!, scale: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </Field>
                <Field label="Offset" htmlFor="bind-offset">
                  <input id="bind-offset" className="input" type="number" step="any" value={widget.binding?.offset ?? ''} placeholder="0"
                    onChange={(e) => onBind({ ...widget.binding!, offset: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </Field>
              </div>
            )}
          </More>
        </div>
      ) : (
        <div className="bind-section">
          <h4>{sends ? 'Which value should it send?' : 'Which value should it show?'}</h4>
          {devices.length > 1 && (
            <select id="bind-device" className="input input-sm" value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)} aria-label="Board">
              <option value="all">All boards</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name}{d.simulated ? ' (simulated)' : ''}</option>)}
              <option value="none">Variables without a board</option>
            </select>
          )}
          {options.length === 0 && (
            <p className="bind-empty">
              <Icon name="LuInfo" size={16} />
              <span>No variables yet. Declare one in your LMS program with a “Declare IoT variable” block and flash the board, or create one below.</span>
            </p>
          )}
          <ul className="var-pick" role="listbox" aria-label="Variables">
            {options.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  disabled={o.compat.level === 'error'}
                  className={cn('var-opt', o.compat.level === 'error' && 'is-incompatible')}
                  title={o.compat.reason}
                  onClick={async () => {
                    if (!o.add) return onBind({ variableId: o.v.id }, o.v);
                    const v = await importDeviceVariable(projectId, o.add.deviceId, o.add.key);
                    if (v) onBind({ variableId: v.id }, v);
                  }}
                >
                  <span className="var-opt-main">
                    <strong>{o.v.displayName}</strong>
                    <code>{o.v.key}{o.device && devices.length > 1 ? ` · ${o.device.name}` : ''}</code>
                  </span>
                  <span className="var-opt-meta">
                    <Badge tone="neutral">{dataTypeLabel(o.v.dataType)}</Badge>
                    <span className="dir-mini" title={DIRECTION_META[o.v.direction].label}>{DIRECTION_META[o.v.direction].arrow}</span>
                  </span>
                  {o.compat.level !== 'ok' && <span className={cn('var-opt-why', o.compat.level)}>{o.compat.reason}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!bound && (
        <div className="bind-section">
          {creating ? (
            <>
              <h4>New variable</h4>
              <VariableForm
                projectId={projectId}
                compact
                idPrefix="bind-new"
                submitLabel="Create & connect"
                initial={{
                  deviceId: deviceFilter !== 'all' && deviceFilter !== 'none' ? deviceFilter : devices[0]?.id ?? null,
                  direction: sends ? 'command' : 'telemetry',
                  dataType: (def.accepts[0] ?? 'float') as DataType,
                }}
                onCancel={() => setCreating(false)}
                onSubmit={async (input) => {
                  const r = await createVariable(projectId, input);
                  if (r.errors) return r.errors;
                  setCreating(false);
                  onBind({ variableId: r.variable!.id }, r.variable);
                  return undefined;
                }}
              />
            </>
          ) : (
            <button type="button" className="link-btn" onClick={() => setCreating(true)}>Create a custom variable</button>
          )}
        </div>
      )}
    </div>
  );
}
