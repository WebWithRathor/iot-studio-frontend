import { useEffect, useState } from 'react';
import { lmsDiscovery } from '../services';
import { errorMessage } from '../services/api/client';
import type { LmsProgramSummary } from '../services/integrations';
import { formatTokens } from '../lib/tokens';
import { ACCENTS, CATEGORIES, createProject, updateProject, useStudio, useTokenBudget } from '../state/studio';
import { toast } from '../state/ui';
import type { Project } from '../types/models';
import { cn } from '../utils';
import { Icon, PROJECT_ICONS } from './Icon';
import { Button, Field, InfoTip, Modal, SimTag, Switch } from './ui';

export function ProjectFormModal(props: { open: boolean; onClose: () => void; project?: Project; onCreated?: (p: Project) => void }) {
  const editing = Boolean(props.project);
  const devices = useStudio((s) => s.devices);
  const budget = useTokenBudget();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Smart Home');
  const [icon, setIcon] = useState('LuHouse');
  const [accent, setAccent] = useState('indigo');
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [importVars, setImportVars] = useState(true);
  const [programs, setPrograms] = useState<LmsProgramSummary[]>([]);
  const [programId, setProgramId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    const p = props.project;
    setName(p?.name ?? '');
    setDescription(p?.description ?? '');
    setCategory(p?.category ?? 'Smart Home');
    setIcon(p?.icon ?? 'LuHouse');
    setAccent(p?.accent ?? 'indigo');
    setDeviceIds([]);
    setImportVars(true);
    setProgramId(p?.lmsProgram?.programId ?? '');
    setError('');
    setBusy(false);
    lmsDiscovery.listPrograms().then(setPrograms);
  }, [props.open]);

  const submit = async () => {
    if (busy) return;
    if (!name.trim()) {
      setError('Give your project a name, for example “Smart Room”.');
      return;
    }
    if (name.trim().length > 60) {
      setError('Keep the name under 60 characters.');
      return;
    }
    const prog = programs.find((x) => x.programId === programId);
    const lmsProgram = prog ? { programId: prog.programId, name: prog.name, version: prog.version, source: prog.source } : null;
    setBusy(true);
    try {
      if (props.project) {
        const saved = await updateProject(props.project.id, { name: name.trim(), description: description.trim(), category, icon, accent, lmsProgram });
        if (!saved) return; // rolled back; error toast already shown
        toast('Project updated', 'success');
        props.onClose();
        return;
      }
      const p = await createProject({ name, description, category, icon, accent, deviceIds, lmsProgram, importVariables: importVars });
      toast(`Created “${p.name}”`, 'success');
      props.onCreated?.(p);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      kicker={editing ? 'EDIT PROJECT' : 'NEW IOT PROJECT'}
      title={editing ? 'Project details' : 'Create a project'}
      width={640}
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" iconRight={editing ? undefined : 'LuArrowRight'} disabled={busy} onClick={() => void submit()}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create & open editor'}
          </Button>
        </>
      }
    >
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="Project name" htmlFor="pf-name" error={error}>
          <input id="pf-name" data-autofocus className="input input-lg" value={name} placeholder="Smart Room" maxLength={80} onChange={(e) => { setName(e.target.value); setError(''); }} />
        </Field>
        <Field label="Description" htmlFor="pf-desc" hint="Optional — what does this project monitor or control?">
          <textarea id="pf-desc" className="input" rows={2} value={description} placeholder="Temperature monitoring and LED control for my desk." onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label="Category" htmlFor="pf-cat">
            <select id="pf-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Accent" htmlFor="pf-accent-indigo">
            <div className="swatches" role="radiogroup" aria-label="Accent">
              {Object.entries(ACCENTS).map(([k, a]) => (
                <button key={k} id={`pf-accent-${k}`} type="button" role="radio" aria-checked={accent === k} aria-label={a.label} title={a.label}
                  className={cn('swatch', accent === k && 'is-active')} style={{ background: a.var }} onClick={() => setAccent(k)} />
              ))}
            </div>
          </Field>
        </div>
        <Field label="Icon" htmlFor="pf-icon-LuHouse">
          <div className="icon-pick" role="radiogroup" aria-label="Project icon">
            {PROJECT_ICONS.map((i) => (
              <button key={i} id={`pf-icon-${i}`} type="button" role="radio" aria-checked={icon === i} aria-label={i.slice(2)} className={cn('icon-opt', icon === i && 'is-active')} onClick={() => setIcon(i)}>
                <Icon name={i} size={18} />
              </button>
            ))}
          </div>
        </Field>

        {!editing && (
          <fieldset className="fieldset">
            <legend>Devices <span className="muted">— optional, you can add them later</span></legend>
            <div className="device-checks">
              {devices.map((d) => (
                <label key={d.id} className={cn('device-check', deviceIds.includes(d.id) && 'is-on')}>
                  <input type="checkbox" checked={deviceIds.includes(d.id)} onChange={(e) => setDeviceIds((ids) => (e.target.checked ? [...ids, d.id] : ids.filter((x) => x !== d.id)))} />
                  <span className="device-check-main">
                    <strong>{d.name}</strong>
                    <code>{d.hardwareId}</code>
                  </span>
                  {d.simulated ? <SimTag compact /> : <span className="badge badge-info">LMS</span>}
                </label>
              ))}
            </div>
            {deviceIds.length > 0 && (
              <Switch checked={importVars} label="Add the variables these devices declare to the project" onChange={setImportVars} />
            )}
          </fieldset>
        )}

        <Field label="Link an LMS program" htmlFor="pf-lms" tip="Optional reference to the block-editor program running on the device. The IoT Studio project stays independent of the LMS project." hint="Sample programs (mock LMS discovery)">
          <select id="pf-lms" className="input" value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">None</option>
            {programs.map((p) => <option key={p.programId} value={p.programId}>{p.name} · {p.version}</option>)}
          </select>
        </Field>
        <button type="submit" hidden />
      </form>
      {!editing && (
        <p className="modal-foot-note">
          <Icon name="LuCoins" size={13} /> Uses <strong>{formatTokens(budget.costs.project)} tokens</strong> (includes the first dashboard) · you have {formatTokens(budget.available)} left.{' '}
          <InfoTip text="Building costs tokens and deleting gives them back. Projects are saved to your Kokoon account on the server." />
        </p>
      )}
    </Modal>
  );
}
