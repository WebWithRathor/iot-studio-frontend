import { useState } from 'react';
import { variableMapping } from '../../services';
import { useRuntime } from '../../state/runtime';
import { createVariable, importDeviceVariable, useStudio } from '../../state/studio';
import type { Binding, ID, Variable, Widget } from '../../types/models';
import { cn, formatValue, timeAgo } from '../../utils';
import { checkCompatibility, dataTypeLabel, getWidgetDef } from '../../widgets/definitions';
import { useNow } from '../../widgets/hooks';
import { Icon } from '../Icon';
import { Badge, Button, Field, InfoTip } from '../ui';
import { DIRECTION_META, VariableForm } from '../VariableForm';

function LastValue({ v }: { v: Variable }) {
  const topic = v.stateTopic ?? v.commandTopic ?? '';
  const e = useRuntime((s) => s.values[topic]);
  const now = useNow();
  if (!e) return <span className="muted">no data yet</span>;
  return <span>{formatValue(e.value, v.dataType)} {v.unit ?? ''} · {timeAgo(e.at, now)}</span>;
}

export function BindingPanel({ widget, projectId, onBind }: { widget: Widget; projectId: ID; onBind: (b: Binding | null, v?: Variable) => void }) {
  const def = getWidgetDef(widget.type);
  const project = useStudio((s) => s.projects.find((p) => p.id === projectId));
  const devices = useStudio((s) => s.devices.filter((d) => project?.deviceIds.includes(d.id)));
  const variables = useStudio((s) => s.variables.filter((v) => v.projectId === projectId));
  const bound = variables.find((v) => v.id === widget.binding?.variableId) ?? null;
  const [deviceFilter, setDeviceFilter] = useState<string>(bound?.deviceId ?? 'all');
  const [creating, setCreating] = useState(false);

  if (def.io === 'none') {
    return (
      <div className="bind-none">
        <Icon name="LuInfo" size={16} />
        <p>
          {widget.type === 'device_status'
            ? 'This component shows a device rather than a variable. Choose the device in the Settings tab.'
            : widget.type === 'event_log'
              ? 'Shows this project’s activity — no binding needed.'
              : 'This component is static and has no data source.'}
        </p>
      </div>
    );
  }

  const filtered = variables.filter((v) => deviceFilter === 'all' || (deviceFilter === 'none' ? !v.deviceId : v.deviceId === deviceFilter));
  const filterDevices = devices.filter((d) => deviceFilter === 'all' || d.id === deviceFilter);
  const available = filterDevices.flatMap((d) =>
    d.capabilities.filter((c) => !variables.some((v) => v.deviceId === d.id && v.key === c.key)).map((c) => ({ device: d, cap: c })),
  );
  const needs = def.io === 'write' ? 'command' : 'telemetry';
  const isNumericRead = def.io === 'read' && bound && (bound.dataType === 'integer' || bound.dataType === 'float');

  return (
    <div className="bind">
      <div className="bind-need">
        <span className={cn('dir-pill', `dir-${needs}`)}>{needs === 'command' ? '↑ Dashboard → Device' : '↓ Device → Dashboard'}</span>
        <p>{def.bindingHint}</p>
      </div>

      {bound ? (
        <div className="bind-current cut-frame">
          <div className="bind-current-head">
            <div>
              <div className="kicker kicker-accent">// BOUND TO</div>
              <strong className="bind-name">{bound.displayName}</strong>
            </div>
            <Button size="sm" icon="LuX" onClick={() => onBind(null)}>Unbind</Button>
          </div>
          <dl className="bind-map">
            <div>
              <dt>Logical variable <InfoTip text="What dashboards bind to. Lives in IoT Studio and is unique per project." /></dt>
              <dd><code>{bound.key}</code> · {dataTypeLabel(bound.dataType)}</dd>
            </div>
            {bound.stateTopic && (
              <div>
                <dt>↓ State topic <InfoTip text="The MQTT topic the device publishes its value on. The dashboard subscribes to it." /></dt>
                <dd><code className="wrap">{bound.stateTopic}</code></dd>
              </div>
            )}
            {bound.commandTopic && (
              <div>
                <dt>↑ Command topic <InfoTip text="The MQTT topic this dashboard publishes commands on. The device subscribes to it." /></dt>
                <dd><code className="wrap">{bound.commandTopic}</code></dd>
              </div>
            )}
            <div>
              <dt>Firmware variable <InfoTip text="The variable inside the program running on the ESP32, defined by an MQTT block in the LMS." /></dt>
              <dd className="muted">{variableMapping.describe(bound)}</dd>
            </div>
            <div>
              <dt>Last value</dt>
              <dd><LastValue v={bound} /></dd>
            </div>
          </dl>
          {(() => {
            const c = checkCompatibility(def, bound);
            return c.level !== 'ok' ? <p className={cn('bind-warn', c.level === 'error' && 'is-error')}><Icon name="LuTriangleAlert" size={14} /> {c.reason}</p> : null;
          })()}
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
        </div>
      ) : (
        <div className="bind-empty">
          <Icon name="LuLink" size={16} />
          <span>Not bound. Pick a variable below — nothing is connected automatically.</span>
        </div>
      )}

      <Field label="Device" htmlFor="bind-device">
        <select id="bind-device" className="input" value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)}>
          <option value="all">All project devices</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.name}{d.simulated ? ' (simulated)' : ''}</option>)}
          <option value="none">Variables without a device</option>
        </select>
      </Field>

      <div className="bind-section">
        <h4>Project variables</h4>
        {filtered.length === 0 && <p className="muted small">No variables{deviceFilter !== 'all' ? ' for this device' : ''} yet.</p>}
        <ul className="var-pick" role="listbox" aria-label="Variables">
          {filtered.map((v) => {
            const c = checkCompatibility(def, v);
            const active = v.id === bound?.id;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={c.level === 'error'}
                  className={cn('var-opt', active && 'is-active', c.level === 'error' && 'is-incompatible')}
                  onClick={() => onBind({ variableId: v.id }, v)}
                  title={c.reason}
                >
                  <span className="var-opt-main">
                    <strong>{v.displayName}</strong>
                    <code>{v.key}</code>
                  </span>
                  <span className="var-opt-meta">
                    <Badge tone="neutral">{dataTypeLabel(v.dataType)}</Badge>
                    <span className="dir-mini" title={DIRECTION_META[v.direction].label}>{DIRECTION_META[v.direction].arrow}</span>
                  </span>
                  {c.level !== 'ok' && <span className={cn('var-opt-why', c.level)}>{c.reason}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {available.length > 0 && (
        <div className="bind-section">
          <h4>Declared by device <InfoTip text="Variables the device’s firmware declares (simulated here). Adding one creates a project variable with suggested topics." /></h4>
          <ul className="var-pick">
            {available.map(({ device, cap }) => {
              const fake = { ...cap, id: '', projectId, deviceId: device.id, firmwareRef: null, createdAt: 0, stateTopic: cap.direction !== 'command' ? 'x' : undefined, commandTopic: cap.direction !== 'telemetry' ? 'x' : undefined } as Variable;
              const c = checkCompatibility(def, fake);
              return (
                <li key={device.id + cap.key}>
                  <button
                    type="button"
                    className={cn('var-opt is-available', c.level === 'error' && 'is-incompatible')}
                    disabled={c.level === 'error'}
                    title={c.reason}
                    onClick={async () => {
                      const v = await importDeviceVariable(projectId, device.id, cap.key);
                      if (v) onBind({ variableId: v.id }, v);
                    }}
                  >
                    <span className="var-opt-main">
                      <strong>{cap.displayName}</strong>
                      <code>{cap.key} · {device.name}</code>
                    </span>
                    <span className="var-opt-meta"><Icon name="LuPlus" size={14} /> Add &amp; bind</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="bind-section">
        {creating ? (
          <>
            <h4>New variable</h4>
            <VariableForm
              projectId={projectId}
              compact
              idPrefix="bind-new"
              submitLabel="Create & bind"
              initial={{
                deviceId: deviceFilter !== 'all' && deviceFilter !== 'none' ? deviceFilter : devices[0]?.id ?? null,
                direction: def.io === 'write' ? 'bidirectional' : 'telemetry',
                dataType: def.accepts[0] ?? 'float',
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
          <Button size="sm" icon="LuPlus" onClick={() => setCreating(true)}>Create a custom variable</Button>
        )}
      </div>
    </div>
  );
}
