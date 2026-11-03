import { useEffect, useState } from 'react';
import { ACCENTS, useStudio } from '../../state/studio';
import type { Binding, Dashboard, Variable, Widget, WidgetConfig } from '../../types/models';
import { clamp, cn } from '../../utils';
import { getWidgetDef, type FieldDef } from '../../widgets/definitions';
import { Icon } from '../Icon';
import { Button, Field, IconButton, More, Switch, Tabs } from '../ui';
import { BindingPanel } from './BindingPanel';
import { COLS } from './layoutEngine';

type Tab = 'settings' | 'data' | 'layout';

export interface PanelChange {
  widget: Widget;
  /** Typing in the same field within a second is merged into one undo step. */
  coalesceKey?: string;
  binding?: { binding: Binding | null; variable?: Variable };
}

function NumberInput({ id, value, optional, onCommit, min, max, step }: { id: string; value: number | undefined; optional?: boolean; onCommit: (v: number | undefined) => void; min?: number; max?: number; step?: number }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => { setText(value === undefined ? '' : String(value)); }, [value]);
  return (
    <input
      id={id}
      className="input"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step}
      placeholder={optional ? 'auto' : undefined}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === '') { if (optional) onCommit(undefined); return; }
        const n = Number(t);
        if (Number.isFinite(n)) onCommit(n);
      }}
      onBlur={() => setText(value === undefined ? '' : String(value))}
    />
  );
}

function configErrors(c: WidgetConfig): Partial<Record<keyof WidgetConfig, string>> {
  const e: Partial<Record<keyof WidgetConfig, string>> = {};
  if (!c.title?.trim()) e.title = 'Give the widget a title.';
  if (c.min !== undefined && c.max !== undefined && c.min >= c.max) e.max = 'Maximum must be greater than minimum.';
  if (c.step !== undefined && c.step <= 0) e.step = 'Step must be greater than 0.';
  if (c.step !== undefined && c.min !== undefined && c.max !== undefined && c.step > c.max - c.min) e.step = 'Step is larger than the whole range.';
  if (c.precision !== undefined && (c.precision < 0 || c.precision > 6 || !Number.isInteger(c.precision))) e.precision = 'Use a whole number from 0 to 6.';
  if (c.defaultValue !== undefined && c.min !== undefined && c.max !== undefined && (c.defaultValue < c.min || c.defaultValue > c.max)) e.defaultValue = 'Default must be within min–max.';
  if (c.samples !== undefined && (c.samples < 2 || c.samples > 60)) e.samples = 'Use 2–60.';
  return e;
}

function ConfigField({ f, widget, err, onChange }: { f: FieldDef; widget: Widget; err?: string; onChange: (patch: Partial<WidgetConfig>, key: string) => void }) {
  const id = `cfg-${f.key}`;
  const v = widget.config[f.key];
  let control;
  switch (f.kind) {
    case 'number':
      control = <NumberInput id={id} value={v as number | undefined} optional={f.optional} min={f.min} max={f.max} step={f.step} onCommit={(n) => onChange({ [f.key]: n } as Partial<WidgetConfig>, f.key)} />;
      break;
    case 'select':
      control = (
        <select id={id} className="input" value={v === undefined ? '' : String(v)} onChange={(e) => {
          const raw = e.target.value;
          const val = f.key === 'timeWindow' ? Number(raw) : raw;
          onChange({ [f.key]: val } as Partial<WidgetConfig>, f.key);
        }}>
          {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    case 'textarea':
      control = <textarea id={id} className="input" rows={3} value={(v as string) ?? ''} onChange={(e) => onChange({ [f.key]: e.target.value } as Partial<WidgetConfig>, f.key)} />;
      break;
    case 'boolean':
      control = <Switch id={id} checked={Boolean(v)} label={f.label} onChange={(b) => onChange({ [f.key]: b } as Partial<WidgetConfig>, f.key)} />;
      break;
    default:
      control = <input id={id} className="input" value={(v as string) ?? ''} placeholder={f.placeholder} onChange={(e) => onChange({ [f.key]: e.target.value } as Partial<WidgetConfig>, f.key)} />;
  }
  return <Field label={f.label} htmlFor={id} hint={f.help} error={err}>{control}</Field>;
}

export function PropertiesPanel(props: {
  widget: Widget | null;
  dashboard: Dashboard;
  projectId: string;
  onChange: (c: PanelChange) => void;
  onLayout: (widgetId: string, layout: Widget['layout']) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('settings');
  const { widget } = props;
  const devices = useStudio((s) => {
    const p = s.projects.find((x) => x.id === props.projectId);
    return s.devices.filter((d) => p?.deviceIds.includes(d.id));
  });
  useEffect(() => {
    if (widget && getWidgetDef(widget.type).io === 'none' && tab === 'data') setTab('settings');
  }, [widget?.id]);

  if (!widget) {
    const bound = props.dashboard.widgets.filter((w) => w.binding).length;
    return (
      <aside className="panel props" aria-label="Properties">
        <div className="panel-head">
          <div className="kicker kicker-accent">// DASHBOARD</div>
          <IconButton icon="LuX" label="Close properties" onClick={props.onClose} />
        </div>
        <div className="props-empty">
          <h3>{props.dashboard.name}</h3>
          <p className="muted small">Click a widget on the canvas to set it up and connect it to a value from your board.</p>
          {props.dashboard.widgets.length > bound && (
            <p className="muted small">{props.dashboard.widgets.length - bound} widget{props.dashboard.widgets.length - bound === 1 ? ' isn’t' : 's aren’t'} connected yet.</p>
          )}
          <More label="Keyboard shortcuts">
            <ul className="tips">
              <li><kbd>Click</kbd> select · <kbd>Drag</kbd> move · corner handle resize</li>
              <li><kbd>←↑→↓</kbd> move · <kbd>Shift</kbd>+arrows resize</li>
              <li><kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate · <kbd>Del</kbd> delete</li>
              <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redo</li>
            </ul>
          </More>
        </div>
      </aside>
    );
  }

  const def = getWidgetDef(widget.type);
  const errs = configErrors(widget.config);
  const setConfig = (patch: Partial<WidgetConfig>, key: string) =>
    props.onChange({ widget: { ...widget, config: { ...widget.config, ...patch } }, coalesceKey: `${widget.id}:${key}` });
  const tabs: { value: Tab; label: string }[] = [
    { value: 'settings', label: 'Settings' },
    ...(def.io !== 'none' ? [{ value: 'data' as Tab, label: widget.binding ? 'Data ●' : 'Data' }] : []),
    { value: 'layout', label: 'Layout' },
  ];

  return (
    <aside className="panel props" aria-label="Widget properties">
      <div className="panel-head">
        <div className="props-title">
          <span className={cn('lib-icon sm', `cat-${def.category}`)}><Icon name={def.icon} size={15} /></span>
          <div>
            <div className="kicker kicker-muted">// {def.name.toUpperCase()}</div>
            <strong>{widget.config.title}</strong>
          </div>
        </div>
        <IconButton icon="LuX" label="Deselect" onClick={props.onClose} />
      </div>
      <Tabs value={tab} tabs={tabs} onChange={setTab} />
      <div className="panel-scroll">
        {tab === 'settings' && (
          <div className="form-grid">
            <Field label="Title" htmlFor="cfg-title" error={errs.title}>
              <input id="cfg-title" className="input" value={widget.config.title} onChange={(e) => setConfig({ title: e.target.value }, 'title')} />
            </Field>
            <Field label="Description" htmlFor="cfg-desc" hint="Shown as a tooltip on the title.">
              <input id="cfg-desc" className="input" value={widget.config.description ?? ''} onChange={(e) => setConfig({ description: e.target.value }, 'description')} />
            </Field>
            {widget.type === 'device_status' && (
              <Field label="Device" htmlFor="cfg-device" hint={devices.length ? undefined : 'Associate a device with this project first.'}>
                <select id="cfg-device" className="input" value={widget.config.deviceId ?? ''} onChange={(e) => setConfig({ deviceId: e.target.value || undefined }, 'deviceId')}>
                  <option value="">Choose a device…</option>
                  {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
            )}
            {def.fields.map((f) => (
              <ConfigField key={f.key} f={f} widget={widget} err={errs[f.key]} onChange={setConfig} />
            ))}
            {widget.type !== 'divider' && widget.type !== 'label' && (
              <>
                <Field label="Accent color" htmlFor="cfg-color-indigo">
                  <div className="swatches" role="radiogroup" aria-label="Accent color">
                    {Object.entries(ACCENTS).map(([k, a]) => (
                      <button key={k} id={`cfg-color-${k}`} type="button" role="radio" aria-checked={(widget.config.color ?? 'indigo') === k} aria-label={a.label} title={a.label}
                        className={cn('swatch', (widget.config.color ?? 'indigo') === k && 'is-active')} style={{ background: a.var }} onClick={() => setConfig({ color: k }, 'color')} />
                    ))}
                  </div>
                </Field>
                <Switch checked={widget.config.showHeader !== false} label="Show title bar" onChange={(b) => setConfig({ showHeader: b }, 'showHeader')} />
              </>
            )}
          </div>
        )}
        {tab === 'data' && (
          <BindingPanel widget={widget} projectId={props.projectId} onBind={(binding, variable) => props.onChange({ widget: { ...widget, binding }, binding: { binding, variable } })} />
        )}
        {tab === 'layout' && (
          <div className="form-grid">
            <div className="form-row">
              <Field label="Column (X)" htmlFor="lay-x">
                <NumberInput id="lay-x" value={widget.layout.x} onCommit={(n) => n !== undefined && props.onLayout(widget.id, { ...widget.layout, x: clamp(Math.round(n), 0, COLS - widget.layout.w) })} />
              </Field>
              <Field label="Row (Y)" htmlFor="lay-y">
                <NumberInput id="lay-y" value={widget.layout.y} onCommit={(n) => n !== undefined && props.onLayout(widget.id, { ...widget.layout, y: Math.max(0, Math.round(n)) })} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Width (cols)" htmlFor="lay-w" hint={`${def.minSize.w}–${COLS}`}>
                <NumberInput id="lay-w" value={widget.layout.w} onCommit={(n) => n !== undefined && props.onLayout(widget.id, { ...widget.layout, w: clamp(Math.round(n), def.minSize.w, COLS - widget.layout.x) })} />
              </Field>
              <Field label="Height (rows)" htmlFor="lay-h" hint={`min ${def.minSize.h}`}>
                <NumberInput id="lay-h" value={widget.layout.h} onCommit={(n) => n !== undefined && props.onLayout(widget.id, { ...widget.layout, h: clamp(Math.round(n), def.minSize.h, 24) })} />
              </Field>
            </div>
            <Switch checked={widget.config.visible !== false} label="Visible in preview" onChange={(b) => setConfig({ visible: b }, 'visible')} />
            <p className="muted small">Widgets pack upward on a 12-column grid. Hidden widgets stay in the editor but not in preview.</p>
          </div>
        )}
      </div>
      <div className="panel-foot">
        <Button size="sm" icon="LuCopy" onClick={() => props.onDuplicate(widget.id)}>Duplicate</Button>
        <Button size="sm" variant="danger" icon="LuTrash2" onClick={() => props.onDelete(widget.id)}>Delete</Button>
      </div>
    </aside>
  );
}
