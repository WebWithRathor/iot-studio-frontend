import { useEffect, useState } from 'react';
import { DEVICE_BOARDS as BOARDS, DEVICE_KITS } from '../services/catalog';
import { createSimulatedDevice, useStudio } from '../state/studio';
import { toast } from '../state/ui';
import type { Device } from '../types/models';
import { Button, Field, Modal, SimTag } from './ui';

export function DeviceCreateModal({ open, onClose, projectId, onCreated }: { open: boolean; onClose: () => void; projectId?: string; onCreated?: (d: Device) => void }) {
  const projects = useStudio((s) => s.projects);
  const [name, setName] = useState('');
  const [board, setBoard] = useState(BOARDS[0]);
  const [kit, setKit] = useState('full');
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName('');
    setBoard(BOARDS[0]);
    setKit('full');
    setProjectIds(projectId ? [projectId] : []);
    setError('');
    setBusy(false);
  }, [open]);
  const submit = async () => {
    if (busy) return;
    if (!name.trim()) { setError('Name the device, e.g. “Desk ESP32”.'); return; }
    setBusy(true);
    const d = await createSimulatedDevice({ name, board, kit, projectIds });
    setBusy(false);
    if (!d) return; // error toast already shown
    toast(`${d.name} registered and connecting (simulated)`, 'success');
    onCreated?.(d);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a simulated device" kicker="DEVICE" width={540}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Adding…' : 'Add device'}</Button></>}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <p className="modal-text">
          <SimTag /> A simulated ESP32 is run by the Kokoon server: it publishes telemetry through the platform’s MQTT pipeline and answers commands. Real devices are registered by an administrator.
        </p>
        <Field label="Device name" htmlFor="dc-name" error={error}>
          <input id="dc-name" className="input" value={name} placeholder="Desk ESP32" onChange={(e) => { setName(e.target.value); setError(''); }} />
        </Field>
        <div className="form-row">
          <Field label="Board" htmlFor="dc-board">
            <select id="dc-board" className="input" value={board} onChange={(e) => setBoard(e.target.value)}>
              {BOARDS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Firmware variables" htmlFor="dc-kit" hint="What the simulated firmware declares.">
            <select id="dc-kit" className="input" value={kit} onChange={(e) => setKit(e.target.value)}>
              {Object.entries(DEVICE_KITS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>
        {!projectId && projects.length > 0 && (
          <fieldset className="fieldset">
            <legend>Associate with projects <span className="muted">— optional</span></legend>
            <div className="check-list">
              {projects.map((p) => (
                <label key={p.id} className="check">
                  <input type="checkbox" checked={projectIds.includes(p.id)} onChange={(e) => setProjectIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id)))} />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
