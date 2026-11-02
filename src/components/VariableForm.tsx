import { useState } from 'react';
import { suggestVariableTopics, useStudio, type VariableErrors, type VariableInput } from '../state/studio';
import type { DataType, Direction, ID } from '../types/models';
import { Button, Field, InfoTip } from './ui';

export const DIRECTION_META: Record<Direction, { label: string; arrow: string; help: string }> = {
  telemetry: { label: 'Device → Dashboard', arrow: '↓', help: 'Telemetry: the device publishes values, dashboards subscribe and display them.' },
  command: { label: 'Dashboard → Device', arrow: '↑', help: 'Command: dashboards publish values, the device subscribes and acts. No reported state.' },
  bidirectional: { label: 'Both directions', arrow: '↕', help: 'Dashboards send commands and the device reports its actual state back.' },
};

const TYPES: { value: DataType; label: string }[] = [
  { value: 'boolean', label: 'Boolean (true / false)' },
  { value: 'integer', label: 'Integer' },
  { value: 'float', label: 'Floating-point number' },
  { value: 'string', label: 'String' },
  { value: 'color', label: 'RGB color (#RRGGBB)' },
  { value: 'json', label: 'JSON object' },
];

const optNum = (s: string): number | undefined => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Number(s));

export function VariableForm(props: {
  projectId: ID;
  initial?: Partial<VariableInput>;
  submitLabel: string;
  onSubmit: (input: VariableInput) => Promise<VariableErrors | undefined>;
  onCancel: () => void;
  compact?: boolean;
  idPrefix?: string;
}) {
  const p = props.idPrefix ?? 'vf';
  const devices = useStudio((s) => {
    const proj = s.projects.find((x) => x.id === props.projectId);
    return s.devices.filter((d) => proj?.deviceIds.includes(d.id));
  });
  const init = props.initial ?? {};
  const [key, setKey] = useState(init.key ?? '');
  const [displayName, setDisplayName] = useState(init.displayName ?? '');
  const [dataType, setDataType] = useState<DataType>(init.dataType ?? 'float');
  const [direction, setDirection] = useState<Direction>(init.direction ?? 'telemetry');
  const [deviceId, setDeviceId] = useState<ID | null>(init.deviceId ?? devices[0]?.id ?? null);
  const [stateTopic, setStateTopic] = useState(init.stateTopic ?? '');
  const [commandTopic, setCommandTopic] = useState(init.commandTopic ?? '');
  const [topicsTouched, setTopicsTouched] = useState(Boolean(init.stateTopic || init.commandTopic));
  const [unit, setUnit] = useState(init.unit ?? '');
  const [min, setMin] = useState(init.min !== undefined ? String(init.min) : '');
  const [max, setMax] = useState(init.max !== undefined ? String(init.max) : '');
  const [errors, setErrors] = useState<VariableErrors>({});
  const [busy, setBusy] = useState(false);

  // Suggest conventional topics until the user edits them by hand.
  const suggested = suggestVariableTopics(deviceId, key, direction);
  const st = topicsTouched ? stateTopic : suggested.stateTopic ?? '';
  const ct = topicsTouched ? commandTopic : suggested.commandTopic ?? '';
  const numeric = dataType === 'integer' || dataType === 'float';

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const errs = await props.onSubmit({
      key: key.trim(),
      displayName: displayName.trim() || key.trim(),
      dataType,
      direction,
      deviceId,
      stateTopic: st,
      commandTopic: ct,
      unit: unit || undefined,
      min: numeric ? optNum(min) : undefined,
      max: numeric ? optNum(max) : undefined,
    });
    setBusy(false);
    setErrors(errs ?? {});
  };

  return (
    <form
      className={props.compact ? 'form-grid is-compact' : 'form-grid'}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Identifier" htmlFor={`${p}-key`} error={errors.key} hint="Used in code and topics, e.g. fan_state" tip="The logical variable’s name in IoT Studio. It does not have to match the firmware variable name.">
        <input id={`${p}-key`} className="input mono" value={key} placeholder="fan_state" autoComplete="off" onChange={(e) => setKey(e.target.value.replace(/\s+/g, '_').toLowerCase())} />
      </Field>
      <Field label="Display name" htmlFor={`${p}-name`} error={errors.displayName}>
        <input id={`${p}-name`} className="input" value={displayName} placeholder="Fan" onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
      <Field label="Data type" htmlFor={`${p}-type`}>
        <select id={`${p}-type`} className="input" value={dataType} onChange={(e) => setDataType(e.target.value as DataType)}>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>
      <Field label="Direction" htmlFor={`${p}-dir`} hint={DIRECTION_META[direction].help}>
        <select id={`${p}-dir`} className="input" value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
          {(Object.keys(DIRECTION_META) as Direction[]).map((d) => <option key={d} value={d}>{DIRECTION_META[d].arrow} {DIRECTION_META[d].label}</option>)}
        </select>
      </Field>
      <Field label="Device" htmlFor={`${p}-dev`} hint={devices.length ? undefined : 'Associate a device with this project to pick it here.'}>
        <select id={`${p}-dev`} className="input" value={deviceId ?? ''} onChange={(e) => setDeviceId(e.target.value || null)}>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.hardwareId})</option>)}
          <option value="">No device — topics only</option>
        </select>
      </Field>
      {direction !== 'command' && (
        <Field label="State topic (device publishes)" htmlFor={`${p}-st`} error={errors.stateTopic} tip="The MQTT topic carries the value over the network. Several variables in different projects can read the same topic.">
          <input id={`${p}-st`} className="input mono" value={st} onChange={(e) => { setTopicsTouched(true); setStateTopic(e.target.value); setCommandTopic(ct); }} />
        </Field>
      )}
      {direction !== 'telemetry' && (
        <Field label="Command topic (dashboard publishes)" htmlFor={`${p}-ct`} error={errors.commandTopic}>
          <input id={`${p}-ct`} className="input mono" value={ct} onChange={(e) => { setTopicsTouched(true); setCommandTopic(e.target.value); setStateTopic(st); }} />
        </Field>
      )}
      {!topicsTouched && (
        <p className="form-note">
          Topics follow the proposed <code>&lt;device prefix&gt;/telemetry|command/&lt;key&gt;</code> convention and must stay under the device’s prefix. Edit them to match your LMS MQTT block. <InfoTip text="The LMS MQTT block is the authority on real topics. IoT Studio only suggests a convention." />
        </p>
      )}
      {numeric && (
        <div className="form-row">
          <Field label="Unit" htmlFor={`${p}-unit`}><input id={`${p}-unit`} className="input" value={unit} placeholder="°C" onChange={(e) => setUnit(e.target.value)} /></Field>
          <Field label="Min" htmlFor={`${p}-min`}><input id={`${p}-min`} className="input" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></Field>
          <Field label="Max" htmlFor={`${p}-max`} error={errors.max}><input id={`${p}-max`} className="input" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} /></Field>
        </div>
      )}
      {errors.form && <div className="auth-error" role="alert">{errors.form}</div>}
      <div className="form-actions">
        <Button onClick={props.onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : props.submitLabel}</Button>
      </div>
    </form>
  );
}
