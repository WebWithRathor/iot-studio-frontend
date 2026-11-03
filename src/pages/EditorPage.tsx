import { useEffect, useRef, useState } from 'react';
import { DashboardView } from '../components/dashboard/DashboardView';
import { GridCanvas } from '../components/dashboard/GridCanvas';
import { compact, findSpot, toItems, applyLayout, COLS } from '../components/dashboard/layoutEngine';
import { Library } from '../components/dashboard/Library';
import { PropertiesPanel, type PanelChange } from '../components/dashboard/PropertiesPanel';
import { Icon } from '../components/Icon';
import { Badge, Button, IconButton, Menu, Modal, Segmented, StateBadge } from '../components/ui';
import { Link, navigate, Redirect, useLocation } from '../lib/router';
import { useTokensEnabled } from '../state/auth';
import { useRuntime } from '../state/runtime';
import { TokenPill } from '../components/tokens';
import {
  createDashboard, exportProject, redo, reloadWorkspace, renameDashboard, retrySave, setWidgets, undo, useStudio, useTokenBudget,
} from '../state/studio';
import { confirmDialog, toast } from '../state/ui';
import type { Widget, WidgetType } from '../types/models';
import { clamp, cn, downloadJson, timeAgo, uid } from '../utils';
import { checkCompatibility, getWidgetDef, makeWidget } from '../widgets/definitions';
import { useNow } from '../widgets/hooks';

function SaveStatus() {
  const save = useStudio((s) => s.save);
  const now = useNow();
  const map = {
    saving: { icon: 'LuRefreshCw', text: 'Saving…', cls: 'is-saving' },
    saved: { icon: 'LuCircleCheck', text: `Saved${save.at ? ` · ${timeAgo(save.at, now)}` : ''}`, cls: 'is-saved' },
    unsaved: { icon: 'LuCircleDot', text: 'Unsaved changes', cls: 'is-unsaved' },
    error: { icon: 'LuCircleAlert', text: 'Save failed', cls: 'is-error' },
  }[save.status];
  return (
    <div className={cn('save-status', map.cls)} title={save.error ?? 'Changes are saved to your Kokoon account automatically.'} role="status">
      <Icon name={map.icon} size={14} />
      <span>{map.text}</span>
      {save.status === 'error' && !save.conflict && <button type="button" className="link-btn" onClick={retrySave}>Retry</button>}
      {save.status === 'error' && save.conflict && <button type="button" className="link-btn" onClick={() => void reloadWorkspace().catch(() => toast('Could not reload — check your connection.', 'error'))}>Reload</button>}
    </div>
  );
}

function useIsNarrow(px = 960) {
  const [narrow, setNarrow] = useState(() => window.innerWidth < px);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < px);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [px]);
  return narrow;
}

export function EditorPage({ projectId, dashboardId }: { projectId: string; dashboardId?: string }) {
  const simulatedMode = useRuntime((s) => (s.status ? s.status.mode === 'simulated' : true));
  const { query } = useLocation();
  const project = useStudio((s) => s.projects.find((p) => p.id === projectId));
  const dashboard = useStudio((s) => s.dashboards.find((d) => d.id === (dashboardId ?? project?.defaultDashboardId)));
  const allDashboards = useStudio((s) => s.dashboards.filter((d) => d.projectId === projectId));
  const devices = useStudio((s) => s.devices.filter((d) => project?.deviceIds.includes(d.id)));
  const variables = useStudio((s) => s.variables.filter((v) => v.projectId === projectId));
  const deviceStates = useRuntime((s) => devices.map((d) => s.devices[d.id]?.state ?? 'waiting'));
  const history = useStudio((s) => (dashboard ? s.history[dashboard.id] : undefined));
  const narrow = useIsNarrow();
  const mode: 'edit' | 'preview' = query.get('mode') === 'preview' || (narrow && query.get('mode') !== 'edit') ? 'preview' : 'edit';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(!narrow);
  const [propsOpen, setPropsOpen] = useState(!narrow);
  const [renaming, setRenaming] = useState(false);
  const [newDashOpen, setNewDashOpen] = useState(false);
  const [newDashName, setNewDashName] = useState('');
  const lastEdit = useRef<{ key: string; at: number } | null>(null);

  const widgets = dashboard?.widgets ?? [];
  const selected = widgets.find((w) => w.id === selectedId) ?? null;
  const budget = useTokenBudget();
  const tokensOn = useTokensEnabled();
  const nextCost = !tokensOn || (dashboard && widgets.length < (dashboard.freeWidgets ?? 0)) ? 0 : budget.costs.widget;
  const dense = project?.settings.density === 'compact';
  const rowHeight = dense ? 46 : 56;
  const gap = dense ? 8 : 12;

  const setMode = (m: 'edit' | 'preview') => {
    const base = `/projects/${projectId}/editor/${dashboard?.id ?? ''}`;
    navigate(m === 'preview' ? `${base}?mode=preview` : `${base}?mode=edit`, { replace: true });
  };

  /** False when the change was refused (not enough tokens). */
  const commit = (next: Widget[], coalesceKey?: string): boolean => {
    if (!dashboard) return false;
    const t = Date.now();
    const merge = coalesceKey && lastEdit.current?.key === coalesceKey && t - lastEdit.current.at < 1200;
    lastEdit.current = coalesceKey ? { key: coalesceKey, at: t } : null;
    return setWidgets(dashboard.id, next, { record: !merge });
  };

  const uniqueTitle = (base: string) => {
    const titles = new Set(widgets.map((w) => w.config.title));
    if (!titles.has(base)) return base;
    let i = 2;
    while (titles.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  };

  const addWidget = (type: WidgetType, x?: number, y?: number) => {
    if (!dashboard) return;
    const def = getWidgetDef(type);
    const spot = x !== undefined && y !== undefined ? { x, y } : findSpot(toItems(widgets), def.defaultSize.w, def.defaultSize.h);
    // One variable that fits (or one that fits and isn't used here yet): connect it, so the widget works at once
    const fits = def.io === 'none' ? [] : variables.filter((v) => checkCompatibility(def, v).level === 'ok');
    const unused = fits.filter((v) => !widgets.some((x) => x.binding?.variableId === v.id));
    const auto = fits.length === 1 ? fits[0] : unused.length === 1 ? unused[0] : undefined;
    const w = makeWidget(type, { ...spot }, { title: uniqueTitle(auto?.displayName ?? def.defaultConfig.title ?? def.name) }, auto?.id);
    const next = applyLayout([...widgets, w], compact(toItems([...widgets, w]), w.id));
    if (!commit(next)) return;
    setSelectedId(w.id);
    setPropsOpen(true);
    if (narrow) setLibraryOpen(false);
    // Bring the new widget into view.
    setTimeout(() => document.querySelector(`[data-widget-id="${w.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
  };

  const duplicate = (id: string) => {
    const src = widgets.find((w) => w.id === id);
    if (!src) return;
    const copy: Widget = { ...src, id: uid('wgt'), config: { ...src.config, title: uniqueTitle(src.config.title) }, layout: { ...src.layout, y: src.layout.y + src.layout.h } };
    const next = applyLayout([...widgets, copy], compact(toItems([...widgets, copy]), copy.id));
    if (!commit(next)) return;
    setSelectedId(copy.id);
  };

  const remove = (id: string) => {
    const w = widgets.find((x) => x.id === id);
    if (!w || !dashboard) return;
    const rest = widgets.filter((x) => x.id !== id);
    commit(applyLayout(rest, compact(toItems(rest))));
    setSelectedId(null);
    toast(`Deleted “${w.config.title}”. Press Ctrl+Z to undo.`);
  };

  const onPanelChange = (c: PanelChange) => {
    let w = c.widget;
    if (c.binding) {
      const v = c.binding.variable;
      const def = getWidgetDef(w.type);
      if (v && c.binding.binding && widgets.find((x) => x.id === w.id)?.binding?.variableId !== v.id) {
        // Helpful defaults from the variable — only where the user hasn't customised.
        const cfg = { ...w.config };
        const fieldKeys = new Set(def.fields.map((f) => f.key));
        if (cfg.title === def.defaultConfig.title || /^[A-Z][a-z]+( [a-z]+)? \d+$/.test(cfg.title)) cfg.title = v.displayName;
        if (fieldKeys.has('unit') && !cfg.unit && v.unit) cfg.unit = v.unit;
        if (def.defaultConfig.min !== undefined && v.min !== undefined && cfg.min === def.defaultConfig.min) cfg.min = v.min;
        if (def.defaultConfig.max !== undefined && v.max !== undefined && cfg.max === def.defaultConfig.max) cfg.max = v.max;
        if (v.dataType === 'integer' && fieldKeys.has('precision')) cfg.precision = 0;
        w = { ...w, config: cfg };
      }
    }
    commit(widgets.map((x) => (x.id === w.id ? w : x)), c.binding ? undefined : c.coalesceKey);
  };

  const onLayout = (id: string, layout: Widget['layout']) => {
    const next = widgets.map((w) => (w.id === id ? { ...w, layout } : w));
    commit(applyLayout(next, compact(toItems(next), id)), `${id}:layout`);
  };

  // Keyboard shortcuts (edit mode).
  useEffect(() => {
    if (!dashboard || mode !== 'edit') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable;
      if (document.querySelector('.modal-backdrop')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo(dashboard.id); else undo(dashboard.id);
        return;
      }
      if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(dashboard.id); return; }
      if (typing || !selectedId) return;
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(selectedId); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(selectedId); return; }
      if (e.key === 'Escape') { setSelectedId(null); return; }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const d = arrows[e.key];
      if (d && selected) {
        e.preventDefault();
        const def = getWidgetDef(selected.type);
        const l = selected.layout;
        const layout = e.shiftKey
          ? { ...l, w: clamp(l.w + d[0], def.minSize.w, COLS - l.x), h: clamp(l.h + d[1], def.minSize.h, 24) }
          : { ...l, x: clamp(l.x + d[0], 0, COLS - l.w), y: Math.max(0, l.y + d[1]) };
        onLayout(selected.id, layout);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!project) return <Redirect to="/" />;
  if (!dashboard) return <Redirect to={`/projects/${projectId}`} />;

  const canUndo = Boolean(history?.past.length);
  const canRedo = Boolean(history?.future.length);

  return (
    <div className={cn('editor', `mode-${mode}`)}>
      <header className="editor-bar">
        <div className="editor-bar-left">
          <IconButton icon="LuArrowLeft" label="Back to project" onClick={() => navigate(`/projects/${projectId}`)} />
          <div className="editor-names">
            <Link to={`/projects/${projectId}`} className="editor-project">{project.name}</Link>
            <div className="editor-dash">
              {renaming ? (
                <input
                  id="dash-rename"
                  className="input input-inline"
                  defaultValue={dashboard.name}
                  autoFocus
                  aria-label="Dashboard name"
                  onBlur={(e) => { renameDashboard(dashboard.id, e.target.value); setRenaming(false); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(false);
                  }}
                />
              ) : allDashboards.length > 1 ? (
                <select
                  className="input input-inline"
                  value={dashboard.id}
                  aria-label="Switch dashboard"
                  onChange={(e) => { setSelectedId(null); navigate(`/projects/${projectId}/editor/${e.target.value}?mode=${mode}`, { replace: true }); }}
                >
                  {allDashboards.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              ) : (
                <button type="button" className="dash-name-btn" onClick={() => setRenaming(true)} title="Rename dashboard">
                  {dashboard.name} <Icon name="LuPencil" size={12} />
                </button>
              )}
            </div>
          </div>
          <SaveStatus />
          <TokenPill />
        </div>

        <div className="editor-bar-mid">
          {mode === 'edit' && (
            <div className="btn-group">
              <IconButton icon="LuUndo2" label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => undo(dashboard.id)} />
              <IconButton icon="LuRedo2" label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => redo(dashboard.id)} />
            </div>
          )}
          <div className="device-pills" aria-label="Device connection">
            {devices.length === 0 ? (
              <Link to={`/projects/${projectId}/devices`} className="device-pill is-none"><Icon name="LuPlug" size={13} /> No device</Link>
            ) : (
              devices.slice(0, 2).map((d, i) => (
                <Link key={d.id} to={`/devices/${d.id}`} className="device-pill" title={`${d.name} — ${d.hardwareId}`}>
                  <StateBadge state={deviceStates[i]} short />
                  <span className="device-pill-name">{d.name}</span>
                  {d.simulated && <span className="sim-tag">SIM</span>}
                </Link>
              ))
            )}
            {devices.length > 2 && <Badge>+{devices.length - 2}</Badge>}
          </div>
        </div>

        <div className="editor-bar-right">
          <Segmented
            label="Editor mode"
            value={mode}
            onChange={setMode}
            options={[{ value: 'edit', label: 'Edit', icon: 'LuPencil' }, { value: 'preview', label: 'Preview', icon: 'LuEye' }]}
          />
          {mode === 'edit' && (
            <Button variant="primary" size="sm" icon="LuPlus" onClick={() => setLibraryOpen((o) => !o)} aria-pressed={libraryOpen}>
              Add widget
            </Button>
          )}
          <Menu
            items={[
              { label: 'Rename dashboard', icon: 'LuPencil', onSelect: () => setRenaming(true) },
              { label: 'New dashboard', icon: 'LuSquarePlus', onSelect: () => { setNewDashName(''); setNewDashOpen(true); } },
              'divider',
              { label: 'Export project (JSON)', icon: 'LuDownload', onSelect: async () => { const b = await exportProject(projectId); if (b && downloadJson(`${project.name.replace(/\W+/g, '-').toLowerCase()}.kokoon.json`, b)) toast('Project exported', 'success'); } },
              { label: 'Open MQTT console', icon: 'LuTerminal', onSelect: () => navigate('/console') },
              { label: 'Project settings', icon: 'LuSettings', onSelect: () => navigate(`/projects/${projectId}/settings`) },
              'divider',
              {
                label: 'Clear canvas', icon: 'LuTrash2', danger: true, disabled: !widgets.length,
                onSelect: async () => {
                  const ok = await confirmDialog({ title: 'Clear the canvas?', message: `This removes all ${widgets.length} widgets from “${dashboard.name}”. You can undo it with Ctrl+Z while this page is open.`, confirmLabel: 'Clear canvas', danger: true });
                  if (ok) { commit([]); setSelectedId(null); }
                },
              },
            ]}
          />
        </div>
      </header>

      {simulatedMode && (
        <div className="demo-strip" role="note">
          <span className="sim-tag">DEMO MODE</span>
          Devices and MQTT traffic are simulated by the Kokoon server. No real ESP32 or broker is connected.
        </div>
      )}

      {mode === 'preview' ? (
        <main className="preview-wrap" id="main">
          {narrow && query.get('mode') !== 'preview' && (
            <div className="narrow-note"><Icon name="LuMonitor" size={15} /> The editor works best on a wider screen. <button type="button" className="link-btn" onClick={() => setMode('edit')}>Edit anyway</button></div>
          )}
          {widgets.length ? (
            <DashboardView dashboard={dashboard} rowHeight={rowHeight} gap={gap} showHeaders={project.settings.showWidgetHeaders} />
          ) : (
            <div className="canvas-empty cut-frame">
              <h3>This dashboard is empty</h3>
              <p>Switch to Edit and add widgets from the component library.</p>
              <Button variant="primary" icon="LuPencil" onClick={() => setMode('edit')}>Edit dashboard</Button>
            </div>
          )}
        </main>
      ) : (
        <div className={cn('editor-body', libraryOpen && 'lib-open', propsOpen && 'props-open')}>
          {libraryOpen && <Library onAdd={(t) => addWidget(t)} onClose={() => setLibraryOpen(false)} nextCost={nextCost} affordable={budget.available >= nextCost} />}
          <main className="canvas-wrap" id="main" onPointerDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
            {!libraryOpen && (
              <button type="button" className="panel-tab left" onClick={() => setLibraryOpen(true)}><Icon name="LuPanelLeft" size={14} /> Components</button>
            )}
            {!propsOpen && (
              <button type="button" className="panel-tab right" onClick={() => setPropsOpen(true)}><Icon name="LuPanelRight" size={14} /> Properties</button>
            )}
            {widgets.length === 0 && (
              <div className="canvas-empty cut-frame">
                <div className="kicker kicker-accent">// EMPTY CANVAS</div>
                <h3>Start your dashboard</h3>
                <p>Pick a component from the library — or drag it here. Then bind it to a variable in the Data tab.</p>
                <div className="canvas-empty-quick">
                  {(['toggle', 'numeric', 'line_chart', 'slider', 'color_wheel'] as WidgetType[]).map((t) => (
                    <Button key={t} size="sm" icon={getWidgetDef(t).icon} onClick={() => addWidget(t)}>{getWidgetDef(t).name}</Button>
                  ))}
                </div>
              </div>
            )}
            <GridCanvas
              widgets={widgets}
              projectId={projectId}
              rowHeight={rowHeight}
              gap={gap}
              selectedId={selectedId}
              showHeaders={project.settings.showWidgetHeaders}
              onSelect={(id) => { setSelectedId(id); if (id) setPropsOpen(true); }}
              onCommit={(next) => commit(next)}
              onDropNew={(t, x, y) => addWidget(t, x, y)}
              onDuplicate={duplicate}
              onDelete={remove}
            />
          </main>
          {propsOpen && (
            <PropertiesPanel
              widget={selected}
              dashboard={dashboard}
              projectId={projectId}
              onChange={onPanelChange}
              onLayout={onLayout}
              onDuplicate={duplicate}
              onDelete={remove}
              onClose={() => (selected ? setSelectedId(null) : setPropsOpen(false))}
            />
          )}
        </div>
      )}

      <Modal
        open={newDashOpen}
        onClose={() => setNewDashOpen(false)}
        title="New dashboard"
        kicker="DASHBOARD"
        width={420}
        footer={
          <>
            <Button onClick={() => setNewDashOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={async () => {
              const d = await createDashboard(projectId, newDashName || 'Untitled dashboard');
              if (!d) return;
              setNewDashOpen(false);
              setSelectedId(null);
              navigate(`/projects/${projectId}/editor/${d.id}?mode=edit`);
            }}>Create dashboard</Button>
          </>
        }
      >
        <label className="field-label" htmlFor="new-dash-name">Name</label>
        <input id="new-dash-name" className="input" value={newDashName} placeholder="e.g. Debug view" onChange={(e) => setNewDashName(e.target.value)} />
        {tokensOn && <p className="muted small">Uses {budget.costs.dashboard} tokens · you have {budget.available.toLocaleString('en-IN')} left.</p>}
      </Modal>
    </div>
  );
}
