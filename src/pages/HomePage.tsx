import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../components/Icon';
import { ProjectFormModal } from '../components/ProjectFormModal';
import { Badge, Button, EmptyState, Menu, StateBadge } from '../components/ui';
import { Link, navigate } from '../lib/router';
import { useRuntime } from '../state/runtime';
import { ACCENTS, deleteProject, dismissOnboarding, duplicateProject, importProject, useStudio } from '../state/studio';
import { confirmDialog, toast } from '../state/ui';
import type { Dashboard, Project } from '../types/models';
import { cn, timeAgo } from '../utils';
import { getWidgetDef } from '../widgets/definitions';
import { useNow } from '../widgets/hooks';

export function DashboardThumb({ dashboard, accent }: { dashboard?: Dashboard; accent: string }) {
  const ws = dashboard?.widgets ?? [];
  const rows = Math.max(6, ws.reduce((m, w) => Math.max(m, w.layout.y + w.layout.h), 0));
  return (
    <div className="thumb" aria-hidden="true" style={{ '--thumb-accent': ACCENTS[accent]?.var ?? 'var(--primary)' } as CSSProperties}>
      {ws.length === 0 ? (
        <span className="thumb-empty">EMPTY CANVAS</span>
      ) : (
        ws.map((w) => {
          const def = getWidgetDef(w.type);
          return (
            <span
              key={w.id}
              className={cn('thumb-w', `cat-${def.category}`, w.binding && 'is-bound')}
              style={{
                left: `${(w.layout.x / 12) * 100}%`,
                top: `${(w.layout.y / rows) * 100}%`,
                width: `calc(${(w.layout.w / 12) * 100}% - 3px)`,
                height: `calc(${(w.layout.h / rows) * 100}% - 3px)`,
              }}
            >
              {w.layout.w >= 2 && w.layout.h >= 2 && <Icon name={def.icon} size={12} />}
            </span>
          );
        })
      )}
    </div>
  );
}

function ProjectStatus({ project }: { project: Project }) {
  const states = useRuntime((s) => project.deviceIds.map((id) => s.devices[id]?.state ?? 'waiting'));
  if (!project.deviceIds.length) return <span className="muted small">No device</span>;
  const online = states.filter((s) => s === 'connected').length;
  if (online === states.length) return <StateBadge state="connected" short />;
  if (states.includes('connecting')) return <StateBadge state="connecting" short />;
  if (online > 0) return <span className="state state-warn"><i />{online}/{states.length} online</span>;
  return <StateBadge state={states[0]} short />;
}

function ProjectCard({ project, onEdit }: { project: Project; onEdit: (p: Project) => void }) {
  const dashboard = useStudio((s) => s.dashboards.find((d) => d.id === project.defaultDashboardId));
  const widgetCount = useStudio((s) => s.dashboards.filter((d) => d.projectId === project.id).reduce((n, d) => n + d.widgets.length, 0));
  const now = useNow();
  const open = () => navigate(`/projects/${project.id}`);
  return (
    <article className="project-card cut-card">
      <button type="button" className="project-card-hit" onClick={open} aria-label={`Open ${project.name}`} />
      <DashboardThumb dashboard={dashboard} accent={project.accent} />
      <div className="project-card-body">
        <div className="project-card-top">
          <span className="project-icon" style={{ background: ACCENTS[project.accent]?.var }}><Icon name={project.icon} size={16} /></span>
          <span className="kicker kicker-muted">// {project.category.toUpperCase()}</span>
          <div className="project-card-menu">
            <Menu
              items={[
                { label: 'Open', icon: 'LuFolderOpen', onSelect: open },
                { label: 'Edit dashboard', icon: 'LuLayoutDashboard', onSelect: () => navigate(`/projects/${project.id}/editor/${project.defaultDashboardId}?mode=edit`) },
                { label: 'Edit details', icon: 'LuPencil', onSelect: () => onEdit(project) },
                { label: 'Duplicate', icon: 'LuCopy', onSelect: async () => { const c = await duplicateProject(project.id); if (c) toast(`Created “${c.name}”`, 'success'); } },
                'divider',
                {
                  label: 'Delete', icon: 'LuTrash2', danger: true,
                  onSelect: async () => {
                    const ok = await confirmDialog({
                      title: `Delete “${project.name}”?`,
                      message: 'Its dashboards, widgets, variables and activity are permanently removed from your workspace. Devices are shared and are kept. This cannot be undone.',
                      confirmLabel: 'Delete project',
                      danger: true,
                    });
                    if (ok && (await deleteProject(project.id))) { toast(`Deleted “${project.name}”`); }
                  },
                },
              ]}
            />
          </div>
        </div>
        <h3 className="project-name">{project.name}</h3>
        <p className="project-desc">{project.description || 'No description yet.'}</p>
        <dl className="project-meta">
          <div><dt>Widgets</dt><dd>{widgetCount}</dd></div>
          <div><dt>Devices</dt><dd>{project.deviceIds.length}</dd></div>
          <div><dt>Status</dt><dd><ProjectStatus project={project} /></dd></div>
        </dl>
        <div className="project-foot">
          <span>Edited {timeAgo(project.updatedAt, now)}</span>
          <span>Activity {timeAgo(project.lastActivityAt, now)}</span>
        </div>
        {project.lmsProgram && <Badge tone="info" className="project-lms" title="Linked LMS program (reference only)"><Icon name="LuLink" size={11} /> {project.lmsProgram.name}</Badge>}
      </div>
    </article>
  );
}

function Onboarding({ onCreate }: { onCreate: () => void }) {
  const dismissed = useStudio((s) => s.preferences.onboardingDismissed);
  if (dismissed) return null;
  const steps = [
    { n: '01', tag: 'IN THE LMS', title: 'Program the ESP32', body: 'Build your logic with blocks and add an MQTT block for each value you want to see or control. Flash it to the board.' },
    { n: '02', tag: 'IN IOT STUDIO', title: 'Build a dashboard', body: 'Create a project, drop in toggles, gauges and charts, and arrange them on the grid.' },
    { n: '03', tag: 'LIVE', title: 'Bind, monitor, control', body: 'Bind each widget to a variable. Readings flow in from the device; your controls publish commands back.' },
  ];
  return (
    <section className="onboard" aria-label="How IoT Studio works">
      <div className="onboard-head">
        <div>
          <div className="kicker kicker-accent">// HOW IT WORKS</div>
          <h2 className="section-title">From blocks to a live dashboard</h2>
        </div>
        <button type="button" className="link-btn" onClick={() => void dismissOnboarding()}>Hide guide</button>
      </div>
      <div className="onboard-grid">
        {steps.map((s) => (
          <div key={s.n} className="step-card cut-frame">
            <div className="step-top"><span className="step-n">{s.n}</span><span className="tag">{s.tag}</span></div>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </div>
      <div className="onboard-cta">
        <Button variant="primary" icon="LuPlus" onClick={onCreate}>Create your first project</Button>
        <span className="muted small">or open one of the sample projects below — their devices are simulated.</span>
      </div>
    </section>
  );
}

function LiveFeed() {
  const activity = useStudio((s) => s.activity.slice(0, 7));
  const msgsPerMin = useRuntime((s) => s.messages.filter((m) => m.at > Date.now() - 60_000).length);
  const now = useNow();
  return (
    <aside className="feed cut-frame-dark" aria-label="Recent activity">
      <div className="feed-head">
        <span>LIVE FEED</span>
        <span className="feed-sync"><i /> SIM</span>
      </div>
      <div className="feed-stat">
        <strong>{msgsPerMin}</strong> <span>MQTT messages / min</span>
      </div>
      <ul className="feed-list">
        {activity.map((a) => (
          <li key={a.id}>
            <span className="feed-time">{timeAgo(a.at, now)}</span>
            <span>{a.message}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function DeviceSummary() {
  const devices = useStudio((s) => s.devices);
  const states = useRuntime((s) => devices.map((d) => s.devices[d.id]?.state ?? 'waiting'));
  return (
    <section className="dev-summary cut-card" aria-label="Devices">
      <div className="dev-summary-head">
        <div className="kicker kicker-accent">// DEVICES</div>
        <Link to="/devices" className="link-arrow">ALL DEVICES →</Link>
      </div>
      <ul>
        {devices.map((d, i) => (
          <li key={d.id}>
            <Link to={`/devices/${d.id}`} className="dev-row">
              <span className="dev-row-name">{d.name}</span>
              {d.simulated ? <span className="sim-tag">SIM</span> : <span className="badge badge-info">LMS</span>}
              <StateBadge state={states[i]} short />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Sort = 'recent' | 'name' | 'created' | 'activity';

export function HomePage() {
  const projects = useStudio((s) => s.projects);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const recent = useMemo(() => projects.slice().sort((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, 3), [projects]);
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = projects.filter((p) => !query || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(query));
    const by: Record<Sort, (a: Project, b: Project) => number> = {
      recent: (a, b) => b.updatedAt - a.updatedAt,
      name: (a, b) => a.name.localeCompare(b.name),
      created: (a, b) => b.createdAt - a.createdAt,
      activity: (a, b) => b.lastActivityAt - a.lastActivityAt,
    };
    return filtered.sort(by[sort]);
  }, [projects, q, sort]);

  return (
    <main className="page" id="main">
      <section className="hero">
        <div className="hero-main">
          <div className="hero-kicker"><i /> KOKOON LABS · IOT STUDIO</div>
          <h1 className="hero-title">
            BUILD THE <em className="serif">dashboard</em>
            <br />FOR YOUR HARDWARE
          </h1>
          <p className="hero-sub">Program your ESP32 in the LMS, then design the screen that monitors and controls it — toggles, gauges, charts and colour wheels, bound to live MQTT variables.</p>
          <div className="hero-actions">
            <Button variant="primary" size="lg" icon="LuPlus" onClick={() => setCreateOpen(true)}>Create project</Button>
            <Button size="lg" icon="LuTerminal" onClick={() => navigate('/console')}>Watch MQTT traffic</Button>
          </div>
        </div>
        <LiveFeed />
      </section>

      <Onboarding onCreate={() => setCreateOpen(true)} />

      {projects.length > 0 && (
        <section className="recent" aria-label="Recently active">
          <div className="kicker kicker-accent">// JUMP BACK IN</div>
          <div className="recent-row">
            {recent.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="recent-item cut-card">
                <span className="project-icon" style={{ background: ACCENTS[p.accent]?.var }}><Icon name={p.icon} size={15} /></span>
                <span className="recent-name">{p.name}</span>
                <Icon name="LuArrowUpRight" size={15} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="projects-section" aria-label="All projects">
        <div className="section-head">
          <div>
            <h2 className="section-title">
              <em className="serif">Your</em> projects
            </h2>
            <span className="kicker kicker-muted">// {projects.length} PROJECTS</span>
          </div>
          <div className="toolbar">
            <div className="search">
              <Icon name="LuSearch" size={15} />
              <input id="project-search" className="input-bare" placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
            </div>
            <select className="input input-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort projects">
              <option value="recent">Last modified</option>
              <option value="activity">Last activity</option>
              <option value="created">Newest</option>
              <option value="name">Name A–Z</option>
            </select>
            <Button icon="LuUpload" onClick={() => fileRef.current?.click()} title="Import a project exported from IoT Studio">Import</Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const r = await importProject(await f.text());
                if (r.error) toast(r.error, 'error');
                else { toast(`Imported “${r.project!.name}”`, 'success'); navigate(`/projects/${r.project!.id}`); }
              }}
            />
          </div>
        </div>
        <div className="project-layout">
          <div className="project-grid">
            {list.map((p) => <ProjectCard key={p.id} project={p} onEdit={setEditing} />)}
            {!projects.length && (
              <EmptyState icon="LuLayoutDashboard" title="No projects yet" action={<Button variant="primary" icon="LuPlus" onClick={() => setCreateOpen(true)}>Create project</Button>}>
                A project holds a dashboard, its variables and the devices it talks to.
              </EmptyState>
            )}
            {projects.length > 0 && !list.length && (
              <EmptyState icon="LuSearch" title="No matching projects">Nothing matches “{q}”. Try another name or category.</EmptyState>
            )}
          </div>
          <DeviceSummary />
        </div>
      </section>

      <ProjectFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(p) => {
          setCreateOpen(false);
          navigate(`/projects/${p.id}/editor/${p.defaultDashboardId}?mode=edit`);
        }}
      />
      <ProjectFormModal open={Boolean(editing)} project={editing ?? undefined} onClose={() => setEditing(null)} />
    </main>
  );
}
