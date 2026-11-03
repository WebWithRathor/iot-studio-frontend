import { AppShell } from '../components/layout/AppShell';
import { TokenPromptHost } from '../components/tokens';
import { AdminPage } from '../pages/AdminPage';
import { PaymentsPage } from '../pages/PaymentsPage';
import { PlanPage } from '../pages/PlanPage';
import { Button, ConfirmHost, EmptyState, ToastHost } from '../components/ui';
import { Link, matchPath, Redirect, useLocation } from '../lib/router';
import { ConsolePage } from '../pages/ConsolePage';
import { DeviceDetailPage, DevicesPage } from '../pages/DevicePages';
import { EditorPage } from '../pages/EditorPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { ProjectLayout } from '../pages/ProjectPages';
import { config } from '../services/config';
import { bootstrapAuth, useAuth, useTokensEnabled } from '../state/auth';
import { startRuntime } from '../state/runtime';
import { initStudio, useStudio } from '../state/studio';

function Routes() {
  const { path } = useLocation();
  const tokensOn = useTokensEnabled();
  let m: Record<string, string> | null;

  if ((m = matchPath('/projects/:id/editor/:dash', path)) || (m = matchPath('/projects/:id/editor', path))) {
    return <EditorPage key={m.id} projectId={m.id} dashboardId={m.dash} />;
  }

  let page;
  // '/login' is where a failed LMS sign-in lands; once signed in it is just the home page.
  if (path === '/' || path === '' || path === '/login') page = <HomePage />;
  else if ((m = matchPath('/projects/:id', path))) page = <ProjectLayout key={m.id} projectId={m.id} tab="" />;
  else if ((m = matchPath('/projects/:id/:tab', path)) && ['dashboard', 'devices', 'variables', 'activity', 'settings'].includes(m.tab)) page = <ProjectLayout key={m.id} projectId={m.id} tab={m.tab} />;
  else if (path === '/devices') page = <DevicesPage />;
  else if ((m = matchPath('/devices/:id', path))) page = <DeviceDetailPage key={m.id} deviceId={m.id} />;
  else if (path === '/console') page = <ConsolePage />;
  else if ((path === '/plan' || path === '/payments') && !tokensOn) return <Redirect to="/" />;
  else if (path === '/plan') page = <PlanPage />;
  else if (path === '/payments') page = <PaymentsPage />;
  else if (path === '/admin') page = <AdminPage />;
  else
    page = (
      <main className="page" id="main">
        <EmptyState icon="LuTriangleAlert" title="Page not found" action={<Link to="/" className="btn btn-primary btn-md">Back to projects</Link>}>
          There is nothing at <code>{path}</code>.
        </EmptyState>
      </main>
    );
  return <AppShell>{page}</AppShell>;
}

function ServerUnavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="boot-panel" id="main">
      <div className="boot-card cut-frame">
        <div className="kicker kicker-accent">// SERVER UNAVAILABLE</div>
        <h1 className="boot-title">Can’t reach Kokoon</h1>
        <p className="boot-text">{message}</p>
        <p className="boot-text small muted">
          API: <code>{config.apiBaseUrl}</code>. Start the backend (<code>npm run dev</code> in <code>Kokoon Backend</code>) and try again. Your work is stored on the server, not in this browser.
        </p>
        <Button variant="primary" icon="LuRefreshCw" onClick={onRetry}>Try again</Button>
      </div>
    </main>
  );
}

function Workspace() {
  const ready = useStudio((s) => s.ready);
  const loadError = useStudio((s) => s.loadError);
  if (loadError)
    return (
      <ServerUnavailable
        message={`Your workspace could not be loaded: ${loadError}`}
        onRetry={() => void initStudio().then(() => startRuntime()).catch(() => undefined)}
      />
    );
  if (!ready) return <div className="boot">KOKOON<span>.</span> IOT STUDIO — loading your workspace…</div>;
  return <Routes />;
}

export function App() {
  const status = useAuth((s) => s.status);
  const error = useAuth((s) => s.error);
  return (
    <>
      {status === 'loading' && <div className="boot">KOKOON<span>.</span> IOT STUDIO — connecting…</div>}
      {status === 'offline' && <ServerUnavailable message={error ?? 'The server did not respond.'} onRetry={() => void bootstrapAuth()} />}
      {status === 'anonymous' && <LoginPage />}
      {status === 'authenticated' && <Workspace />}
      <ToastHost />
      <ConfirmHost />
      {status === 'authenticated' && <TokenPromptHost />}
    </>
  );
}
