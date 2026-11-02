import { useMemo, useRef, useState, type ReactNode } from 'react';
import { DashboardView } from '../components/dashboard/DashboardView';
import { DeviceCreateModal } from '../components/DeviceCreateModal';
import { Icon, PROJECT_ICONS } from '../components/Icon';
import { ProjectFormModal } from '../components/ProjectFormModal';
import { Badge, Button, EmptyState, Field, FirmwareBadge, InfoTip, Kicker, Menu, Modal, SimTag, StateBadge, Switch } from '../components/ui';
import { DIRECTION_META, VariableForm } from '../components/VariableForm';
import { config } from '../services/config';
import { Link, navigate, Redirect } from '../lib/router';
import { variableMapping } from '../services';
import { useRuntime } from '../state/runtime';
import {
  ACCENTS, CATEGORIES, bindingCount, createDashboard, createVariable, deleteDashboard, deleteProject, deleteVariable, duplicateProject,
  exportProject, importDeviceVariable, importProject, setProjectDevice, updateProject, updateVariable, useStudio, useTokenBudget,
} from '../state/studio';
import { confirmDialog, toast } from '../state/ui';
import type { ActivityEvent, ActivityType, Project, Variable } from '../types/models';
import { clock, cn, downloadJson, formatValue, timeAgo } from '../utils';
import { dataTypeLabel } from '../widgets/definitions';
import { useNow } from '../widgets/hooks';

/* ================================================================== layout */

const TABS = [
  { seg: '', label: 'Overview' },
  { seg: 'dashboard', label: 'Dashboard' },
  { seg: 'devices', label: 'Devices' },
  { seg: 'variables', label: 'Variables' },
  { seg: 'activity', label: 'Activity' },
  { seg: 'settings', label: 'Settings' },
];

export function ProjectLayout({ projectId, tab }: { projectId: string; tab: string }) {
  const project = useStudio((s) => s.projects.find((p) => p.id === projectId));
  const [editOpen, setEditOpen] = useState(false);
  if (!project) return <Redirect to="/" />;
  const counts: Record<string, number> = {};
  return (
    <main className="page" id="main">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Projects</Link>
        <Icon name="LuChevronRight" size={13} />
        <span aria-current="page">{project.name}</span>
      </nav>
      <header className="project-head">
        <span className="project-icon lg" style={{ background: ACCENTS[project.accent]?.var }}><Icon name={project.icon} size={24} /></span>
        <div className="project-head-main">
          <Kicker>{project.category.toUpperCase()} · IOT STUDIO PROJECT</Kicker>
          <h1 className="page-title">{project.name}</h1>
          {project.description && <p className="page-sub">{project.description}</p>}
          {project.lmsProgram && (
            <p className="lms-link">
              <Icon name="LuLink" size={13} /> Linked LMS program: <strong>{project.lmsProgram.name}</strong> {project.lmsProgram.version}
              {project.lmsProgram.source === 'lms' ? (
                <>
                  <InfoTip text="Created from a program in the Kokoon LMS. Flashing the program again updates this project’s variables; your dashboards stay as they are." />
                  <a href={config.lmsUrl} target="_blank" rel="noopener noreferrer">Open in LMS <Icon name="LuExternalLink" size={12} /></a>
                </>
              ) : (
                <InfoTip text="A reference only. The LMS program and this IoT Studio project are separate records; editing one never changes the other." />
              )}
              {project.lmsProgram.source === 'mock' && <Badge>MOCK</Badge>}
            </p>
          )}
        </div>
        <div className="page-actions">
          <Button icon="LuEye" onClick={() => navigate(`/projects/${project.id}/editor/${project.defaultDashboardId}?mode=preview`)}>Preview</Button>
          <Button variant="primary" icon="LuLayoutDashboard" onClick={() => navigate(`/projects/${project.id}/editor/${project.defaultDashboardId}?mode=edit`)}>Edit dashboard</Button>
          <Menu
            items={[
              { label: 'Edit details', icon: 'LuPencil', onSelect: () => setEditOpen(true) },
              { label: 'Duplicate project', icon: 'LuCopy', onSelect: async () => { const c = await duplicateProject(project.id); if (c) { toast(`Created “${c.name}”`, 'success'); navigate(`/projects/${c.id}`); } } },
              { label: 'Export (JSON)', icon: 'LuDownload', onSelect: async () => { const b = await exportProject(project.id); if (b && downloadJson(`${project.name.replace(/\W+/g, '-').toLowerCase()}.kokoon.json`, b)) toast('Project exported', 'success'); } },
            ]}
          />
        </div>
      </header>
      <nav className="subnav" aria-label="Project sections">
        {TABS.map((t) => {
          const active = tab === t.seg;
          return (
            <Link key={t.seg} to={`/projects/${project.id}${t.seg ? '/' + t.seg : ''}`} className={cn('subnav-link', active && 'is-active')} aria-current={active ? 'page' : undefined}>
              {t.label}
              {counts[t.seg] !== undefined && <span className="tab-count">{counts[t.seg]}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="project-body">
        {tab === '' && <Overview project={project} />}
        {tab === 'dashboard' && <DashboardsTab project={project} />}
        {tab === 'devices' && <ProjectDevicesTab project={project} />}
        {tab === 'variables' && <VariablesTab project={project} />}
        {tab === 'activity' && <ActivityTab project={project} />}
        {tab === 'settings' && <SettingsTab project={project} />}
      </div>
      <ProjectFormModal open={editOpen} project={project} onClose={() => setEditOpen(false)} />
    </main>
  );
}

function Panel({ title, kicker, actions, children, className }: { title?: string; kicker?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('panel-card cut-card', className)}>
      {(title || kicker || actions) && (
        <div className="panel-card-head">
          <div>
            {kicker && <Kicker>{kicker}</Kicker>}
            {title && <h2 className="panel-card-title">{title}</h2>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/* ================================================================ overview */

function Overview({ project }: { project: Project }) {
  const dashboard = useStudio((s) => s.dashboards.find((d) => d.id === project.defaultDashboardId));
  const widgets = useStudio((s) => s.dashboards.filter((d) => d.projectId === project.id).reduce((n, d) => n + d.widgets.length, 0));
  const variables = useStudio((s) => s.variables.filter((v) => v.projectId === project.id));
  const devices = useStudio((s) => s.devices.filter((d) => project.deviceIds.includes(d.id)));
  const runtimeDevices = useRuntime((s) => devices.map((d) => s.devices[d.id]));
  const msgCount = useRuntime((s) => s.messages.filter((m) => m.deviceId && project.deviceIds.includes(m.deviceId) && m.at > Date.now() - 300_000).length);
  const events = useProjectActivity(project).slice(0, 8);
  const now = useNow();
  const online = runtimeDevices.filter((d) => d?.state === 'connected').length;

  return (
    <div className="overview">
      <div className="stats">
        <div className="stat"><strong>{widgets}</strong><span>WIDGETS</span></div>
        <div className="stat"><strong>{online}/{devices.length}</strong><span>DEVICES ONLINE</span></div>
        <div className="stat"><strong>{variables.length}</strong><span>VARIABLES</span></div>
        <div className="stat"><strong>{msgCount}</strong><span>MESSAGES · 5 MIN</span></div>
      </div>
      <div className="overview-grid">
        <Panel kicker="LIVE DASHBOARD" title={dashboard?.name ?? 'Dashboard'} className="overview-dash"
          actions={<Button size="sm" icon="LuPencil" onClick={() => navigate(`/projects/${project.id}/editor/${project.defaultDashboardId}?mode=edit`)}>Edit</Button>}>
          {dashboard && dashboard.widgets.length ? (
            <DashboardView dashboard={dashboard} rowHeight={48} gap={10} showHeaders={project.settings.showWidgetHeaders} />
          ) : (
            <EmptyState icon="LuLayoutDashboard" title="No widgets yet" action={<Button variant="primary" icon="LuPlus" onClick={() => navigate(`/projects/${project.id}/editor/${project.defaultDashboardId}?mode=edit`)}>Open editor</Button>}>
              Add a toggle, a gauge or a chart and bind it to a variable.
            </EmptyState>
          )}
        </Panel>
        <div className="overview-side">
          <Panel kicker="DEVICES" actions={<Link to={`/projects/${project.id}/devices`} className="link-arrow">MANAGE →</Link>}>
            {devices.length ? (
              <ul className="mini-list">
                {devices.map((d, i) => (
                  <li key={d.id}>
                    <Link to={`/devices/${d.id}`} className="mini-row">
                      <span className="mini-main"><strong>{d.name}</strong><code>{d.hardwareId}</code></span>
                      {d.simulated && <SimTag compact />}
                      <StateBadge state={runtimeDevices[i]?.state ?? 'waiting'} short />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">No devices yet. <Link to={`/projects/${project.id}/devices`}>Associate one</Link> to receive data.</p>
            )}
          </Panel>
          <Panel kicker="RECENT TELEMETRY" actions={<Link to={`/projects/${project.id}/variables`} className="link-arrow">VARIABLES →</Link>}>
            <TelemetryList variables={variables.slice(0, 7)} />
          </Panel>
          <Panel kicker="RECENT EVENTS" actions={<Link to={`/projects/${project.id}/activity`} className="link-arrow">ALL →</Link>}>
            <ul className="event-mini">
              {events.map((e) => (
                <li key={e.id}><span className="muted">{timeAgo(e.at, now)}</span> {e.message}</li>
              ))}
              {!events.length && <li className="muted">Nothing yet.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function TelemetryList({ variables }: { variables: Variable[] }) {
  const values = useRuntime((s) => variables.map((v) => s.values[v.stateTopic ?? v.commandTopic ?? '']));
  const now = useNow();
  if (!variables.length) return <p className="muted small">No variables in this project.</p>;
  return (
    <ul className="tele-list">
      {variables.map((v, i) => (
        <li key={v.id}>
          <span className="tele-key"><span className="dir-mini">{DIRECTION_META[v.direction].arrow}</span><code>{v.key}</code></span>
          <span className="tele-val">
            {values[i] ? (
              <>
                {v.dataType === 'color' && typeof values[i].value === 'string' && <span className="w-swatch xs" style={{ background: values[i].value as string }} />}
                <strong>{formatValue(values[i].value, v.dataType)}</strong> {v.unit ?? ''}
                <small>{timeAgo(values[i].at, now)}</small>
              </>
            ) : (
              <span className="muted">waiting</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ============================================================== dashboards */

function DashboardsTab({ project }: { project: Project }) {
  const dashboards = useStudio((s) => s.dashboards.filter((d) => d.projectId === project.id));
  const [viewId, setViewId] = useState(project.defaultDashboardId);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const budget = useTokenBudget();
  const view = dashboards.find((d) => d.id === viewId) ?? dashboards[0];
  return (
    <div className="stack">
      <div className="dash-list">
        {dashboards.map((d) => (
          <div key={d.id} className={cn('dash-item cut-card', view?.id === d.id && 'is-active')}>
            <button type="button" className="dash-item-hit" onClick={() => setViewId(d.id)} aria-pressed={view?.id === d.id}>
              <strong>{d.name}</strong>
              <span className="muted small">{d.widgets.length} widgets</span>
            </button>
            {project.defaultDashboardId === d.id && <Badge tone="accent">DEFAULT</Badge>}
            <div className="dash-item-actions">
              <Button size="sm" icon="LuPencil" onClick={() => navigate(`/projects/${project.id}/editor/${d.id}?mode=edit`)}>Edit</Button>
              <Menu items={[
                { label: 'Preview full screen', icon: 'LuEye', onSelect: () => navigate(`/projects/${project.id}/editor/${d.id}?mode=preview`) },
                { label: 'Set as default', icon: 'LuCheck', disabled: project.defaultDashboardId === d.id, onSelect: () => updateProject(project.id, { defaultDashboardId: d.id }) },
                { label: 'Delete', icon: 'LuTrash2', danger: true, disabled: dashboards.length <= 1, onSelect: async () => {
                  if (await confirmDialog({ title: `Delete “${d.name}”?`, message: `Its ${d.widgets.length} widgets are removed. Variables are kept.`, confirmLabel: 'Delete dashboard', danger: true })) {
                    if (await deleteDashboard(d.id)) setViewId(project.defaultDashboardId);
                  }
                } },
              ]} />
            </div>
          </div>
        ))}
        <button type="button" className="dash-item add cut-card" onClick={() => { setNewName(''); setNewOpen(true); }}>
          <Icon name="LuPlus" size={16} /> New dashboard
        </button>
      </div>
      {view && (
        <Panel kicker="LIVE" title={view.name}>
          {view.widgets.length ? <DashboardView dashboard={view} showHeaders={project.settings.showWidgetHeaders} /> : <EmptyState icon="LuLayoutDashboard" title="Empty dashboard" action={<Button variant="primary" onClick={() => navigate(`/projects/${project.id}/editor/${view.id}?mode=edit`)}>Open editor</Button>} />}
        </Panel>
      )}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New dashboard" kicker="DASHBOARD" width={420}
        footer={<><Button onClick={() => setNewOpen(false)}>Cancel</Button><Button variant="primary" onClick={async () => { const d = await createDashboard(project.id, newName); if (!d) return; setNewOpen(false); navigate(`/projects/${project.id}/editor/${d.id}?mode=edit`); }}>Create dashboard</Button></>}>
        <label className="field-label" htmlFor="pd-new-name">Name</label>
        <input id="pd-new-name" className="input" value={newName} placeholder="e.g. Debug view" onChange={(e) => setNewName(e.target.value)} />
        <p className="muted small">Uses {budget.costs.dashboard} tokens · you have {budget.available.toLocaleString('en-IN')} left. Deleting it gives them back.</p>
      </Modal>
    </div>
  );
}

/* ================================================================= devices */

function ProjectDevicesTab({ project }: { project: Project }) {
  const all = useStudio((s) => s.devices);
  const variables = useStudio((s) => s.variables.filter((v) => v.projectId === project.id));
  const devices = all.filter((d) => project.deviceIds.includes(d.id));
  const others = all.filter((d) => !project.deviceIds.includes(d.id));
  const rt = useRuntime((s) => devices.map((d) => s.devices[d.id]));
  const [pick, setPick] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const now = useNow();
  return (
    <div className="stack">
      <Panel kicker="ASSOCIATED DEVICES" title="Devices in this project"
        actions={<Button size="sm" icon="LuPlus" onClick={() => setCreateOpen(true)}>Add simulated device</Button>}>
        <p className="muted small">Devices are shared across projects — associating one here does not copy it. <InfoTip text="One physical ESP32 can feed several projects. Authorization for real devices will be enforced by the backend." /></p>
        <div className="device-rows">
          {devices.map((d, i) => {
            const vs = variables.filter((v) => v.deviceId === d.id).length;
            const missing = d.capabilities.filter((c) => !variables.some((v) => v.deviceId === d.id && v.key === c.key));
            return (
              <div key={d.id} className="device-row-card">
                <div className="drc-main">
                  <Link to={`/devices/${d.id}`} className="drc-name">{d.name}</Link>
                  <code>{d.hardwareId}</code>
                  <span className="muted small">{d.board} · {d.firmwareVersion}</span>
                </div>
                <div className="drc-meta">
                  {d.simulated ? <SimTag /> : <Badge tone="info">FROM LMS</Badge>}
                  <StateBadge state={rt[i]?.state ?? 'waiting'} />
                  <span className="muted small">seen {timeAgo(rt[i]?.lastSeen, now)}</span>
                  <span className="muted small">{vs} variables</span>
                </div>
                <div className="drc-actions">
                  {missing.length > 0 && (
                    <Button size="sm" icon="LuPlus" onClick={async () => { const added = (await Promise.all(missing.map((c) => importDeviceVariable(project.id, d.id, c.key)))).filter(Boolean).length; if (added) toast(`Added ${added} variable${added === 1 ? '' : 's'} from ${d.name}`, 'success'); }}>
                      Add {missing.length} declared variable{missing.length > 1 ? 's' : ''}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon="LuX" onClick={async () => {
                    if (await confirmDialog({ title: `Remove ${d.name} from ${project.name}?`, message: 'The device stays registered. Variables that use its topics are kept but you should rebind or delete them.', confirmLabel: 'Remove' })) setProjectDevice(project.id, d.id, false);
                  }}>Remove</Button>
                </div>
              </div>
            );
          })}
          {!devices.length && <EmptyState icon="LuCpu" title="No devices associated">Associate a device below, or add a simulated one to try things out.</EmptyState>}
        </div>
        {others.length > 0 && (
          <div className="assoc">
            <label className="field-label" htmlFor="assoc-pick">Associate an existing device</label>
            <div className="assoc-row">
              <select id="assoc-pick" className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Choose a device…</option>
                {others.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.hardwareId}){d.simulated ? ' · simulated' : ' · LMS'}</option>)}
              </select>
              <Button variant="primary" disabled={!pick} onClick={async () => { if (await setProjectDevice(project.id, pick, true)) { setPick(''); toast('Device associated', 'success'); } }}>Associate</Button>
            </div>
          </div>
        )}
      </Panel>
      <DeviceCreateModal open={createOpen} onClose={() => setCreateOpen(false)} projectId={project.id} />
    </div>
  );
}

/* =============================================================== variables */

function dataStatus(v: Variable, entry: { at: number } | undefined, devState: string | undefined, simulated: boolean | undefined, brokerMode: boolean): { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' | 'info' } {
  if (!v.deviceId) return { label: 'No device', tone: 'neutral' };
  if (simulated === false && !brokerMode) return { label: 'Real HW · no broker', tone: 'info' };
  if (devState && ['disconnected', 'error', 'auth_required'].includes(devState)) return { label: 'Device offline', tone: 'bad' };
  if (!entry) return { label: v.direction === 'command' ? 'Not sent yet' : 'Waiting for data', tone: 'info' };
  return { label: v.direction === 'command' ? 'Last sent' : 'Live', tone: 'ok' };
}

function VariablesTab({ project }: { project: Project }) {
  const variables = useStudio((s) => s.variables.filter((v) => v.projectId === project.id));
  const dashboards = useStudio((s) => s.dashboards.filter((d) => d.projectId === project.id));
  const devices = useStudio((s) => s.devices);
  const entries = useRuntime((s) => variables.map((v) => s.values[v.stateTopic ?? v.commandTopic ?? '']));
  const devStates = useRuntime((s) => variables.map((v) => (v.deviceId ? s.devices[v.deviceId]?.state : undefined)));
  const brokerMode = useRuntime((s) => s.status?.mode === 'broker');
  const [editing, setEditing] = useState<Variable | 'new' | null>(null);
  const [q, setQ] = useState('');
  const now = useNow();
  const query = q.trim().toLowerCase();
  const rows = variables.map((v, i) => ({ v, i })).filter(({ v }) => !query || `${v.key} ${v.displayName} ${v.stateTopic ?? ''} ${v.commandTopic ?? ''}`.toLowerCase().includes(query));

  return (
    <div className="stack">
      <div className="explain cut-card">
        <div className="explain-item"><span className="explain-n">1</span><div><strong>Logical variable</strong><p>What dashboard widgets bind to, e.g. <code>led_state</code>. Lives in IoT Studio.</p></div></div>
        <div className="explain-arrow" aria-hidden="true">→</div>
        <div className="explain-item"><span className="explain-n">2</span><div><strong>MQTT topic</strong><p>The address messages travel on, e.g. <code>kokoon/devices/…/telemetry/led_state</code>.</p></div></div>
        <div className="explain-arrow" aria-hidden="true">→</div>
        <div className="explain-item"><span className="explain-n">3</span><div><strong>Firmware variable</strong><p>Defined by the MQTT block in your LMS program. Not synced in this prototype.</p></div></div>
      </div>
      <Panel kicker={`${variables.length} VARIABLES`} title="Variables"
        actions={
          <div className="toolbar">
            <div className="search"><Icon name="LuSearch" size={15} /><input id="var-search" className="input-bare" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter variables" /></div>
            <Button variant="primary" size="sm" icon="LuPlus" onClick={() => setEditing('new')}>New variable</Button>
          </div>
        }>
        {variables.length === 0 ? (
          <EmptyState icon="LuHash" title="No variables yet" action={<Button variant="primary" icon="LuPlus" onClick={() => setEditing('new')}>New variable</Button>}>
            Create one, or associate a device and add the variables it declares.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Variable</th><th>Type</th><th>Device</th><th>Topic(s)</th><th>Direction</th><th>Last value</th><th>Updated</th><th>Bindings</th><th>Status</th><th><span className="sr">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ v, i }) => {
                  const dev = devices.find((d) => d.id === v.deviceId);
                  const st = dataStatus(v, entries[i], devStates[i], dev?.simulated, brokerMode);
                  const n = bindingCount(v.id, dashboards);
                  return (
                    <tr key={v.id}>
                      <td><code className="strong">{v.key}</code> <FirmwareBadge v={v} /><div className="muted small">{v.displayName}</div></td>
                      <td><Badge>{dataTypeLabel(v.dataType)}</Badge></td>
                      <td>{dev ? <Link to={`/devices/${dev.id}`}>{dev.name}</Link> : <span className="muted">—</span>}</td>
                      <td className="topics">
                        {v.stateTopic && <div title="State topic (device publishes)"><span className="dir-mini">↓</span><code>{v.stateTopic}</code></div>}
                        {v.commandTopic && <div title="Command topic (dashboard publishes)"><span className="dir-mini">↑</span><code>{v.commandTopic}</code></div>}
                      </td>
                      <td><span className={cn('dir-pill sm', `dir-${v.direction}`)}>{DIRECTION_META[v.direction].arrow} {DIRECTION_META[v.direction].label}</span></td>
                      <td className="tabnum">
                        {entries[i] ? (
                          <>
                            {v.dataType === 'color' && typeof entries[i].value === 'string' && <span className="w-swatch xs" style={{ background: entries[i].value as string }} />}
                            {formatValue(entries[i].value, v.dataType)} {v.unit ?? ''}
                          </>
                        ) : '—'}
                      </td>
                      <td className="muted small">{entries[i] ? timeAgo(entries[i].at, now) : '—'}</td>
                      <td className="tabnum">{n}</td>
                      <td><span className={cn('state', `state-${st.tone}`)}><i />{st.label}</span></td>
                      <td className="row-actions">
                        <Menu items={[
                          { label: 'Edit', icon: 'LuPencil', onSelect: () => setEditing(v) },
                          { label: 'Firmware link…', icon: 'LuLink', onSelect: () => toast(variableMapping.describe(v)) },
                          { label: 'Delete', icon: 'LuTrash2', danger: true, onSelect: async () => {
                            if (await confirmDialog({ title: `Delete ${v.key}?`, message: n ? `${n} widget${n > 1 ? 's are' : ' is'} bound to it and will become unbound.` : 'No widgets use it.', confirmLabel: 'Delete variable', danger: true })) deleteVariable(v.id);
                          } },
                        ]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New variable' : `Edit ${editing ? (editing as Variable).key : ''}`} kicker="VARIABLE" width={600}>
        {editing !== null && (
          <VariableForm
            key={editing === 'new' ? 'new' : editing.id}
            projectId={project.id}
            idPrefix="vm"
            initial={editing === 'new' ? undefined : editing}
            submitLabel={editing === 'new' ? 'Create variable' : 'Save changes'}
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              const r = editing === 'new' ? await createVariable(project.id, input) : await updateVariable(editing.id, input);
              if (r.errors) return r.errors;
              toast(editing === 'new' ? `Variable ${input.key} created` : 'Variable updated', 'success');
              setEditing(null);
              return undefined;
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/* ================================================================ activity */

function useProjectActivity(project: Project): ActivityEvent[] {
  return useStudio((s) => s.activity.filter((a) => a.projectId === project.id || (!a.projectId && a.deviceId && project.deviceIds.includes(a.deviceId))));
}

const GROUPS: Record<string, { label: string; types: ActivityType[] }> = {
  all: { label: 'All', types: [] },
  dashboard: { label: 'Dashboard', types: ['dashboard.created', 'dashboard.updated', 'widget.added', 'widget.removed', 'binding.changed', 'project.created', 'project.updated', 'project.duplicated', 'project.imported'] },
  devices: { label: 'Devices', types: ['device.created', 'device.associated', 'device.connected', 'device.disconnected', 'device.error', 'telemetry.first'] },
  commands: { label: 'Commands', types: ['command.published', 'command.failed'] },
  variables: { label: 'Variables', types: ['variable.created', 'variable.updated', 'variable.deleted'] },
};

const TYPE_ICON: Partial<Record<ActivityType, string>> = {
  'project.created': 'LuSparkles', 'widget.added': 'LuSquarePlus', 'widget.removed': 'LuTrash2', 'binding.changed': 'LuLink',
  'device.connected': 'LuWifi', 'device.disconnected': 'LuWifiOff', 'device.error': 'LuTriangleAlert', 'command.published': 'LuArrowUpRight',
  'command.failed': 'LuCircleAlert', 'telemetry.first': 'LuArrowDownLeft', 'variable.created': 'LuHash', 'device.associated': 'LuPlug',
};

export function ActivityList({ events }: { events: ActivityEvent[] }) {
  const now = useNow();
  const byDay = useMemo(() => {
    const m = new Map<string, ActivityEvent[]>();
    for (const e of events) {
      const d = new Date(e.at);
      const today = new Date();
      const key = d.toDateString() === today.toDateString() ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
      m.set(key, [...(m.get(key) ?? []), e]);
    }
    return Array.from(m.entries());
  }, [events]);
  if (!events.length) return <EmptyState icon="LuActivity" title="No activity">Events appear as you build and as devices connect.</EmptyState>;
  return (
    <div className="timeline">
      {byDay.map(([day, list]) => (
        <section key={day}>
          <h3 className="timeline-day">// {day.toUpperCase()}</h3>
          <ul>
            {list.map((e) => (
              <li key={e.id} className={cn('tl-item', `tl-${e.type.split('.')[0]}`, e.type.endsWith('failed') || e.type.endsWith('error') ? 'is-bad' : '')}>
                <span className="tl-icon"><Icon name={TYPE_ICON[e.type] ?? 'LuCircleDot'} size={14} /></span>
                <span className="tl-msg">{e.message}</span>
                <span className="tl-time" title={new Date(e.at).toLocaleString()}>{clock(e.at)} · {timeAgo(e.at, now)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ActivityTab({ project }: { project: Project }) {
  const all = useProjectActivity(project);
  const [group, setGroup] = useState('all');
  const events = group === 'all' ? all : all.filter((e) => GROUPS[group].types.includes(e.type));
  return (
    <Panel kicker={`${all.length} EVENTS`} title="Activity"
      actions={
        <div className="chips">
          {Object.entries(GROUPS).map(([k, g]) => (
            <button key={k} type="button" className={cn('chip', group === k && 'is-active')} aria-pressed={group === k} onClick={() => setGroup(k)}>{g.label}</button>
          ))}
        </div>
      }>
      <ActivityList events={events.slice(0, 150)} />
    </Panel>
  );
}

/* ================================================================ settings */

function SettingsTab({ project }: { project: Project }) {
  const devices = useStudio((s) => s.devices);
  const dashboards = useStudio((s) => s.dashboards.filter((d) => d.projectId === project.id));
  const varCount = useStudio((s) => s.variables.filter((v) => v.projectId === project.id).length);
  const interval = useStudio((s) => s.preferences.simIntervalMs);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [nameErr, setNameErr] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="settings">
      <Panel kicker="GENERAL" title="Project details">
        <form className="form-grid" onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) { setNameErr('The project needs a name.'); return; }
          updateProject(project.id, { name: name.trim(), description: description.trim() });
          toast('Saved', 'success');
        }}>
          <Field label="Name" htmlFor="st-name" error={nameErr}><input id="st-name" className="input" value={name} onChange={(e) => { setName(e.target.value); setNameErr(''); }} /></Field>
          <Field label="Description" htmlFor="st-desc"><textarea id="st-desc" className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Category" htmlFor="st-cat">
            <select id="st-cat" className="input" value={project.category} onChange={(e) => updateProject(project.id, { category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <div className="form-actions"><Button variant="primary" type="submit" disabled={name === project.name && description === project.description}>Save details</Button></div>
        </form>
      </Panel>

      <Panel kicker="IDENTITY" title="Icon and accent">
        <div className="icon-pick" role="radiogroup" aria-label="Project icon">
          {PROJECT_ICONS.map((i) => (
            <button key={i} type="button" role="radio" aria-checked={project.icon === i} aria-label={i.slice(2)} className={cn('icon-opt', project.icon === i && 'is-active')} onClick={() => updateProject(project.id, { icon: i })}>
              <Icon name={i} size={18} />
            </button>
          ))}
        </div>
        <div className="swatches lg" role="radiogroup" aria-label="Accent">
          {Object.entries(ACCENTS).map(([k, a]) => (
            <button key={k} type="button" role="radio" aria-checked={project.accent === k} aria-label={a.label} title={a.label} className={cn('swatch', project.accent === k && 'is-active')} style={{ background: a.var }} onClick={() => updateProject(project.id, { accent: k })} />
          ))}
        </div>
      </Panel>

      <Panel kicker="DASHBOARD" title="Dashboard preferences">
        <div className="form-grid">
          <Field label="Default dashboard" htmlFor="st-default" hint="Opened from project cards and the Edit dashboard button.">
            <select id="st-default" className="input" value={project.defaultDashboardId} onChange={(e) => updateProject(project.id, { defaultDashboardId: e.target.value })}>
              {dashboards.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Grid density" htmlFor="st-density">
            <select id="st-density" className="input" value={project.settings.density} onChange={(e) => updateProject(project.id, { settings: { ...project.settings, density: e.target.value as 'compact' | 'comfortable' } })}>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </Field>
          <Switch checked={project.settings.showWidgetHeaders} label="Show widget title bars" onChange={(b) => updateProject(project.id, { settings: { ...project.settings, showWidgetHeaders: b } })} />
        </div>
      </Panel>

      <Panel kicker="DEVICES & VARIABLES" title="Connections">
        <div className="check-list">
          {devices.map((d) => (
            <label key={d.id} className="check">
              <input type="checkbox" checked={project.deviceIds.includes(d.id)} onChange={(e) => setProjectDevice(project.id, d.id, e.target.checked)} />
              {d.name} <code className="muted">{d.hardwareId}</code> {d.simulated ? <SimTag compact /> : <Badge tone="info">LMS</Badge>}
            </label>
          ))}
        </div>
        <p className="muted small">{varCount} variables · <Link to={`/projects/${project.id}/variables`}>Manage variables</Link></p>
      </Panel>

      <Panel kicker="DEMO MODE" title="Simulation">
        <p className="muted small">The simulation is shared by the whole workspace. Pause it or simulate disconnects from the header status or a device’s page.</p>
        <Field label="Telemetry interval" htmlFor="st-interval">
          <select id="st-interval" className="input" value={interval} disabled>
            <option value={interval}>{interval / 1000} s (change from the BROKER status in the header)</option>
          </select>
        </Field>
      </Panel>

      <Panel kicker="DATA" title="Export & import">
        <p className="muted small">Export saves this project’s dashboards, widgets and variables as JSON. Import creates a new project from such a file.</p>
        <div className="row-gap">
          <Button icon="LuDownload" onClick={async () => { const b = await exportProject(project.id); if (!b) return; if (downloadJson(`${project.name.replace(/\W+/g, '-').toLowerCase()}.kokoon.json`, b)) toast('Project exported', 'success'); else toast('Your browser blocked the download.', 'error'); }}>Export project</Button>
          <Button icon="LuUpload" onClick={() => fileRef.current?.click()}>Import as new project</Button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const r = await importProject(await f.text());
            if (r.error) toast(r.error, 'error'); else { toast(`Imported “${r.project!.name}”`, 'success'); navigate(`/projects/${r.project!.id}`); }
          }} />
        </div>
      </Panel>

      <Panel kicker="DANGER ZONE" title="Delete project" className="danger-zone">
        <p className="muted small">Removes the project, its {dashboards.length} dashboard(s) and {varCount} variables from your workspace on the server. Shared devices are kept.</p>
        <Button variant="danger" icon="LuTrash2" onClick={async () => {
          if (await confirmDialog({ title: `Delete “${project.name}”?`, message: 'This cannot be undone.', confirmLabel: 'Delete project', danger: true })) {
            if (!(await deleteProject(project.id))) return;
            toast(`Deleted “${project.name}”`);
            navigate('/');
          }
        }}>Delete project</Button>
      </Panel>
    </div>
  );
}
