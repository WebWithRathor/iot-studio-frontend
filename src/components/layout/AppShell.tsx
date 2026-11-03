import { useEffect, useRef, useState, type ReactNode } from 'react';
import { config } from '../../services/config';
import { Link, useLocation } from '../../lib/router';
import { signOut, useAuth, useHasPermission, useTokensEnabled } from '../../state/auth';
import { setSimulationInterval, setSimulationPaused, useRuntime } from '../../state/runtime';
import { hasUnsavedChanges, resetDemoData, useStudio } from '../../state/studio';
import { confirmDialog, toast } from '../../state/ui';
import { errorMessage } from '../../services/api/client';
import { cn } from '../../utils';
import { BrandLogo } from '../BrandLogo';
import { Icon } from '../Icon';
import { PlanBadge, TokenMeter, TokenPill } from '../tokens';
import { Badge, Button, More, StateBadge, Switch } from '../ui';

function Popover({ trigger, children, label }: { trigger: ReactNode; children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="popover" ref={ref}>
      <button type="button" className="popover-trigger" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>{trigger}</button>
      {open && <div className="popover-pop cut-frame" role="dialog" aria-label={label}>{children}</div>}
    </div>
  );
}

function SimulationStatus() {
  const stream = useRuntime((s) => s.broker);
  const status = useRuntime((s) => s.status);
  const paused = useRuntime((s) => s.simPaused);
  const online = useRuntime((s) => Object.values(s.devices).filter((d) => d.state === 'connected').length);
  const total = useStudio((s) => s.devices.length);
  const canManage = useHasPermission('mqtt:manage');
  const canReset = useHasPermission('workspace:demo:reset');
  const mode = status?.mode ?? 'simulated';
  const label = stream !== 'connected' ? 'Reconnecting…' : mode === 'broker' ? 'Live' : paused ? 'Demo paused' : 'Demo data';
  return (
    <Popover label="Live data status" trigger={<span className={cn('lab-status', (paused || stream !== 'connected') && 'is-paused')}><i aria-hidden="true" /> {label}</span>}>
      <div className="kicker kicker-accent">// {mode === 'broker' ? 'LIVE DATA' : 'DEMO MODE'}</div>
      <p className="pop-text">
        {stream !== 'connected'
          ? 'Lost the connection to Kokoon for a moment. Reconnecting on its own…'
          : mode === 'broker'
            ? 'Readings from your boards arrive here live, and your controls reach them straight away.'
            : 'Everything here is a demo: devices and readings are simulated, nothing reaches real hardware.'}
      </p>
      <dl className="kv">
        <div><dt>Devices online</dt><dd>{online} / {total}</dd></div>
      </dl>
      <More label="Technical details">
        <dl className="kv">
          <div><dt>Server transport</dt><dd>{status?.transport ?? '—'}</dd></div>
          <div><dt>Server ↔ broker</dt><dd>{status ? <StateBadge state={status.broker} /> : '—'}</dd></div>
          <div><dt>Browser ↔ server</dt><dd><StateBadge state={stream} /></dd></div>
        </dl>
      </More>
      {canManage ? (
        <>
          <Switch checked={!paused} label={paused ? 'Simulation paused (all users)' : 'Simulation running (all users)'} onChange={(on) => void setSimulationPaused(!on)} />
          <label className="field-label" htmlFor="sim-interval">Telemetry interval</label>
          <select id="sim-interval" className="input" value={status?.simulation.intervalMs ?? 2000} onChange={(e) => void setSimulationInterval(Number(e.target.value))}>
            <option value={1000}>Every 1 second</option>
            <option value={2000}>Every 2 seconds</option>
            <option value={5000}>Every 5 seconds</option>
          </select>
        </>
      ) : mode !== 'broker' ? (
        <p className="muted small">The simulation is shared by everyone on this server; administrators can pause it or change its speed. You can disconnect your own simulated devices from their device page.</p>
      ) : null}
      {canReset && (mode !== 'broker' || canManage) && (
        <Button size="sm" variant="ghost" icon="LuRefreshCw" onClick={async () => {
          const ok = await confirmDialog({ title: 'Reset demo data?', message: 'This deletes all of YOUR projects, dashboards, variables and simulated devices on the server and restores the sample workspace. Other users are not affected.', confirmLabel: 'Reset my workspace', danger: true });
          if (!ok) return;
          try {
            await resetDemoData();
            toast('Sample workspace restored', 'success');
          } catch (err) {
            toast(errorMessage(err), 'error');
          }
        }}>Reset my demo data</Button>
      )}
    </Popover>
  );
}

function UserMenu() {
  const user = useAuth((s) => s.user);
  const plan = useStudio((s) => s.tokens?.plan ?? user?.plan ?? 'FREE');
  const tokensOn = useTokensEnabled();
  if (!user) return null;
  return (
    <Popover label="Account" trigger={<span className="user"><Icon name="LuUser" size={15} /><span>{user.name.split(' ')[0].toUpperCase()}</span></span>}>
      <div className="kicker kicker-accent">// SIGNED IN</div>
      <div className="user-card">
        <strong>{user.name}</strong>
        <span className="muted small">{user.email}</span>
        <span className="user-card-badges">
          <Badge tone={user.role === 'USER' ? 'neutral' : 'accent'}>{user.role.replace('_', ' ')}</Badge>
          {tokensOn && <PlanBadge plan={plan} />}
        </span>
      </div>
      {tokensOn && (<>
        <TokenMeter compact />
        <Link to="/plan" className="link-btn small">Plan &amp; tokens →</Link>
        <Link to="/payments" className="link-btn small">Buy tokens · payments →</Link>
      </>)}
      <p className="muted small">Your session is kept in secure cookies and renewed automatically.</p>
      <Button size="sm" icon="LuLogOut" onClick={async () => {
        if (hasUnsavedChanges()) {
          const ok = await confirmDialog({ title: 'Sign out with unsaved changes?', message: 'A dashboard change is still being saved. Signing out now may lose it.', confirmLabel: 'Sign out anyway', danger: true });
          if (!ok) return;
        }
        await signOut();
      }}>Sign out</Button>
    </Popover>
  );
}

const BASE_NAV = [
  { to: '/', label: 'Projects', icon: 'LuHouse', match: (p: string) => p === '/' || p.startsWith('/projects') },
  { to: '/devices', label: 'Devices', icon: 'LuCpu', match: (p: string) => p.startsWith('/devices') },
  { to: '/console', label: 'MQTT Console', icon: 'LuTerminal', match: (p: string) => p.startsWith('/console') },
  { to: '/plan', label: 'Plan', icon: 'LuCoins', match: (p: string) => p.startsWith('/plan') || p.startsWith('/payments') },
];
const ADMIN_NAV = { to: '/admin', label: 'Admin', icon: 'LuShieldCheck', match: (p: string) => p.startsWith('/admin') };

export function AppShell({ children }: { children: ReactNode }) {
  const { path } = useLocation();
  const isAdmin = useHasPermission('plans:manage');
  const tokensOn = useTokensEnabled();
  const NAV = [...BASE_NAV.filter((n) => tokensOn || n.to !== '/plan'), ...(isAdmin ? [ADMIN_NAV] : [])];
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <BrandLogo to="/" />
            <span className="logo-app">IoT Studio</span>
          </div>
          <nav className="topnav" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className={cn('topnav-link', n.match(path) && 'is-active')} aria-current={n.match(path) ? 'page' : undefined}>
                {n.label}
              </Link>
            ))}
            <a className="topnav-link" href={config.lmsUrl} target="_blank" rel="noreferrer" title="Open the Kokoon LMS (block editor, courses) in a new tab">
              <Icon name="LuExternalLink" size={13} /> LMS
            </a>
          </nav>
          <div className="topbar-right">
            <TokenPill />
            <SimulationStatus />
            <UserMenu />
          </div>
        </div>
      </header>
      <div className="shell-main">{children}</div>
      <nav className="dock cut-dock" aria-label="Quick navigation">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={cn('dock-link', n.match(path) && 'is-active')} aria-current={n.match(path) ? 'page' : undefined}>
            <Icon name={n.icon} size={16} />
            <span>{n.label === 'MQTT Console' ? 'Console' : n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
