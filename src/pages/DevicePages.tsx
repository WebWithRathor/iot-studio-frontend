import { useState } from 'react';
import { DeviceCreateModal } from '../components/DeviceCreateModal';
import { Icon } from '../components/Icon';
import { Badge, Button, EmptyState, FirmwareBadge, InfoTip, Kicker, More, PageHeader, SimTag, STATE_META, StateBadge } from '../components/ui';
import { DIRECTION_META } from '../components/VariableForm';
import { Link, Redirect } from '../lib/router';
import { config } from '../services/config';
import { topics } from '../services/mqtt/topics';
import { setDeviceSimMode, useRuntime } from '../state/runtime';
import { renameDevice, setProjectDevice, useStudio } from '../state/studio';
import { toast } from '../state/ui';
import type { Device, MqttMessage } from '../types/models';
import { clock, cn, formatValue, prettyJson, timeAgo } from '../utils';
import { useNow } from '../widgets/hooks';

/* ================================================================== list */

export function DevicesPage() {
  const devices = useStudio((s) => s.devices);
  const projects = useStudio((s) => s.projects);
  const rt = useRuntime((s) => devices.map((d) => s.devices[d.id]));
  const [filter, setFilter] = useState<'all' | 'sim' | 'lms'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const now = useNow();
  const rows = devices.map((d, i) => ({ d, r: rt[i] })).filter(({ d }) => filter === 'all' || (filter === 'sim' ? d.simulated : d.origin === 'lms'));
  return (
    <main className="page" id="main">
      <PageHeader title="Your" serif="boards" actions={<Button icon="LuPlus" onClick={() => setCreateOpen(true)}>Add simulated device</Button>}>
        Boards show up here after you flash an IoT program to them from the LMS.
      </PageHeader>
      {devices.some((d) => d.simulated) && <div className="chips">
        {([['all', `All · ${devices.length}`], ['sim', `Simulated · ${devices.filter((d) => d.simulated).length}`], ['lms', `From LMS · ${devices.filter((d) => d.origin === 'lms').length}`]] as const).map(([k, l]) => (
          <button key={k} type="button" className={cn('chip', filter === k && 'is-active')} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>}
      <div className="device-grid">
        {rows.map(({ d, r }) => {
          const assoc = projects.filter((p) => p.deviceIds.includes(d.id));
          return (
            <Link key={d.id} to={`/devices/${d.id}`} className="device-card cut-card">
              <div className="device-card-top">
                <span className="device-chip-icon"><Icon name="LuCpu" size={18} /></span>
                {d.simulated && <SimTag />}
              </div>
              <h3>{d.name}</h3>
              <StateBadge state={r?.state ?? 'waiting'} />
              <dl className="kv">
                <div><dt>Last seen</dt><dd>{timeAgo(r?.lastSeen, now)}</dd></div>
                <div><dt>Program</dt><dd>{d.lmsProgram ? d.lmsProgram.name : d.firmwareVersion ?? '—'}</dd></div>
                <div><dt>Projects</dt><dd>{assoc.length ? assoc.map((p) => p.name).join(', ') : '—'}</dd></div>
              </dl>
            </Link>
          );
        })}
        {!rows.length && <EmptyState icon="LuCpu" title="No boards yet">Flash an IoT program to your board from the LMS and it appears here. No board? Add a simulated one to try things out.</EmptyState>}
      </div>
      <DeviceCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </main>
  );
}

/* ================================================================ detail */

function MessageRows({ messages, empty }: { messages: MqttMessage[]; empty: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!messages.length) return <p className="muted small">{empty}</p>;
  return (
    <ul className="msg-mini">
      {messages.map((m) => (
        <li key={m.id} className={cn(m.direction === 'in' ? 'is-in' : 'is-out')}>
          <button type="button" className="msg-mini-row" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>
            <span className="msg-dir">{m.direction === 'in' ? '↓ IN' : '↑ OUT'}</span>
            <span className="msg-time">{clock(m.at)}</span>
            <code className="msg-topic">{m.topic.split('/').slice(3).join('/') || m.topic}</code>
            <code className="msg-payload">{m.payload}</code>
            <span className={cn('msg-status', `st-${m.status}`)}>{m.status}</span>
          </button>
          {open === m.id && <pre className="payload-view">{m.topic}{'\n\n'}{prettyJson(m.payload)}</pre>}
        </li>
      ))}
    </ul>
  );
}

function SimControls({ device }: { device: Device }) {
  const state = useRuntime((s) => s.devices[device.id]?.state ?? 'waiting');
  const mode = useRuntime((s) => s.devices[device.id]?.simMode ?? 'online');
  const acts: { m: Parameters<typeof setDeviceSimMode>[1]; label: string; icon: string }[] = [
    { m: 'online', label: 'Reconnect', icon: 'LuWifi' },
    { m: 'offline', label: 'Simulate disconnect', icon: 'LuWifiOff' },
    { m: 'error', label: 'Simulate error', icon: 'LuTriangleAlert' },
    { m: 'auth_required', label: 'Reject credentials', icon: 'LuLock' },
  ];
  return (
    <section className="sim-controls cut-frame">
      <div>
        <Kicker>SIMULATION CONTROLS</Kicker>
        <p className="muted small">Change how this simulated device behaves to see how dashboards react. Current: <StateBadge state={state} /></p>
      </div>
      <div className="row-gap">
        {acts.map((a) => (
          <Button key={a.m} size="sm" icon={a.icon} variant={mode === a.m ? 'dark' : 'outline'} aria-pressed={mode === a.m}
            onClick={async () => { if (await setDeviceSimMode(device.id, a.m)) toast(`${device.name}: ${a.label.toLowerCase()} (simulated)`); }}>
            {a.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

export function DeviceDetailPage({ deviceId }: { deviceId: string }) {
  const brokerMode = useRuntime((s) => s.status?.mode);
  const device = useStudio((s) => s.devices.find((d) => d.id === deviceId));
  const projects = useStudio((s) => s.projects);
  const variables = useStudio((s) => s.variables.filter((v) => v.deviceId === deviceId));
  const rt = useRuntime((s) => s.devices[deviceId]);
  const messages = useRuntime((s) => s.messages.filter((m) => m.deviceId === deviceId));
  const values = useRuntime((s) => s.values);
  const [renaming, setRenaming] = useState(false);
  const now = useNow();
  if (!device) return <Redirect to="/devices" />;
  const flashedFromLms = device.origin === 'lms' && device.lmsProgram?.source === 'lms';
  const state = rt?.state ?? 'waiting';
  const recent = messages.slice(-40).reverse();
  const commands = messages.filter((m) => m.direction === 'out' || m.kind === 'ack').slice(-12).reverse();

  return (
    <main className="page" id="main">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/devices">Devices</Link>
        <Icon name="LuChevronRight" size={13} />
        <span aria-current="page">{device.name}</span>
      </nav>
      <header className="device-head">
        <span className="device-chip-icon lg"><Icon name="LuCpu" size={26} /></span>
        <div className="project-head-main">
          {device.simulated && <Kicker>SIMULATED DEVICE</Kicker>}
          {renaming ? (
            <input id="dev-rename" className="input input-lg" defaultValue={device.name} autoFocus aria-label="Device name"
              onBlur={(e) => { renameDevice(device.id, e.target.value); setRenaming(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }} />
          ) : (
            <h1 className="page-title">
              {device.name}{' '}
              <button type="button" className="icon-btn inline" aria-label="Rename device" title="Rename" onClick={() => setRenaming(true)}><Icon name="LuPencil" size={15} /></button>
            </h1>
          )}
          <div className="row-gap">
            <StateBadge state={state} />
            {device.simulated && <SimTag />}
          </div>
        </div>
      </header>

      {device.simulated ? (
        <SimControls device={device} />
      ) : flashedFromLms ? (
        <div className="notice cut-frame">
          <Icon name="LuGraduationCap" size={18} />
          <div>
            <strong>Running your LMS program “{device.lmsProgram!.name}”</strong>
            {brokerMode === 'broker' ? (
              <p>To change what it sends, edit the blocks in the LMS and flash it again.</p>
            ) : (
              <p>This server runs in simulated MQTT mode, so real boards cannot reach it yet. Ask an administrator to switch the backend to the MQTT broker.</p>
            )}
            <a className="btn btn-outline btn-sm" href={config.lmsUrl} target="_blank" rel="noopener noreferrer"><Icon name="LuExternalLink" size={14} /> Open in LMS</a>
          </div>
        </div>
      ) : (
        <div className="notice cut-frame">
          <Icon name="LuPlug" size={18} />
          <div>
            <strong>Real hardware — waiting for a broker integration</strong>
            <p>This device was discovered from the LMS program “{device.lmsProgram?.name}” (mock discovery). IoT Studio will only show its data once the backend connects to the authorised MQTT broker. Nothing shown here is faked for it.</p>
          </div>
        </div>
      )}

      <div className="detail-grid">
        <section className="panel-card cut-card">
          <Kicker>STATUS</Kicker>
          <dl className="kv">
            <div><dt>Connection</dt><dd><StateBadge state={state} /> <InfoTip text={STATE_META[state].help} /></dd></div>
            <div><dt>Last seen</dt><dd>{timeAgo(rt?.lastSeen, now)}</dd></div>
            <div><dt>Board</dt><dd>{device.board}</dd></div>
            <div><dt>Program</dt><dd>{device.lmsProgram ? device.lmsProgram.name : device.firmwareVersion}</dd></div>
          </dl>
        </section>

        <section className="panel-card cut-card">
          <Kicker>LATEST VALUES</Kicker>
          <ul className="tele-list">
            {device.capabilities.map((c) => {
              const t = c.direction !== 'command' ? topics.telemetry(device.topicPrefix, c.key) : topics.command(device.topicPrefix, c.key);
              const e = values[t];
              return (
                <li key={c.key}>
                  <span className="tele-key"><span className="dir-mini" title={DIRECTION_META[c.direction].label}>{DIRECTION_META[c.direction].arrow}</span>{c.displayName}</span>
                  <span className="tele-val">
                    {e ? (
                      <>
                        {c.dataType === 'color' && typeof e.value === 'string' && <span className="w-swatch xs" style={{ background: e.value }} />}
                        <strong>{formatValue(e.value, c.dataType)}</strong> {c.unit ?? ''} <small>{timeAgo(e.at, now)}</small>
                      </>
                    ) : <span className="muted">{c.direction === 'command' ? 'you control this' : 'no data yet'}</span>}
                  </span>
                </li>
              );
            })}
            {!device.capabilities.length && <li className="muted">This program doesn’t share any values yet.</li>}
          </ul>
        </section>

        <section className="panel-card cut-card span-2">
          <Kicker>USED IN PROJECTS</Kicker>
          <div className="check-list">
            {projects.map((p) => (
              <label key={p.id} className="check">
                <input type="checkbox" checked={p.deviceIds.includes(device.id)} onChange={(e) => setProjectDevice(p.id, device.id, e.target.checked)} />
                <Link to={`/projects/${p.id}`}>{p.name}</Link>
              </label>
            ))}
            {!projects.length && <p className="muted small">No projects yet.</p>}
          </div>
        </section>
      </div>

      <More label="Technical details (MQTT)" className="device-more">
        <div className="detail-grid">
          <section className="panel-card cut-card">
            <Kicker>CONNECTION DETAILS</Kicker>
            <dl className="kv">
              <div><dt>Broker</dt><dd>{device.simulated ? 'Kokoon server simulator' : brokerMode === 'broker' ? 'Platform MQTT broker' : 'Not connected (server in simulated mode)'}</dd></div>
              <div><dt>Client ID</dt><dd><code>{device.hardwareId}</code></dd></div>
              <div><dt>Topic prefix</dt><dd><code className="wrap">{device.topicPrefix}/#</code></dd></div>
              <div><dt>Availability (LWT)</dt><dd><code className="wrap">{topics.availability(device.topicPrefix)}</code></dd></div>
              <div><dt>Credentials</dt><dd className="muted">Never shown in the browser. <InfoTip text={flashedFromLms ? 'Issued to the LMS when the board was flashed and built into its firmware. They only allow this device’s own topics.' : 'Knowing a device ID or topic never grants access.'} /></dd></div>
              <div><dt>TLS</dt><dd className="muted">Required for the real broker</dd></div>
              <div><dt>State since</dt><dd>{rt ? timeAgo(rt.since, now) : '—'}</dd></div>
              <div><dt>Messages (session)</dt><dd className="tabnum">{rt?.messageCount ?? 0}</dd></div>
              <div><dt>Origin</dt><dd>{flashedFromLms ? 'Flashed from the Kokoon LMS' : device.origin === 'lms' ? 'Discovered from LMS (mock)' : 'Registered in IoT Studio'}</dd></div>
              <div><dt>Registered</dt><dd>{new Date(device.createdAt).toLocaleDateString()}</dd></div>
            </dl>
          </section>

          <section className="panel-card cut-card">
            <Kicker>RECENT COMMANDS</Kicker>
            <MessageRows messages={commands} empty="No commands sent this session." />
          </section>

          <section className="panel-card cut-card span-2">
            <Kicker>VARIABLES USING THIS DEVICE</Kicker>
            {variables.length ? (
              <div className="table-wrap">
                <table className="table compact">
                  <thead><tr><th>Project</th><th>Variable</th><th>Direction</th><th>Topic</th></tr></thead>
                  <tbody>
                    {variables.map((v) => (
                      <tr key={v.id}>
                        <td><Link to={`/projects/${v.projectId}/variables`}>{projects.find((p) => p.id === v.projectId)?.name}</Link></td>
                        <td><code>{v.key}</code> <FirmwareBadge v={v} /></td>
                        <td>{DIRECTION_META[v.direction].arrow} {DIRECTION_META[v.direction].label}</td>
                        <td><code className="wrap">{v.stateTopic ?? v.commandTopic}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted small">No project variables use this device yet.</p>}
          </section>

          <section className="panel-card cut-card span-2">
            <div className="panel-card-head">
              <Kicker>MESSAGE HISTORY</Kicker>
              <Link to={`/console?device=${device.id}`} className="link-arrow">OPEN IN CONSOLE →</Link>
            </div>
            <MessageRows messages={recent.slice(0, 14)} empty={device.simulated || brokerMode === 'broker' ? 'No messages yet.' : 'No messages — real hardware is not connected in demo mode.'} />
          </section>
        </div>
      </More>
    </main>
  );
}

