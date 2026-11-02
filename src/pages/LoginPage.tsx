import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Button, Field } from '../components/ui';
import { navigate, useLocation } from '../lib/router';
import { ApiError, errorMessage } from '../services/api/client';
import { config } from '../services/config';
import { register, signIn, useAuth } from '../state/auth';

/** Shown when "Sign in with Kokoon LMS" comes back with `#/login?sso_error=<code>`. */
const SSO_ERRORS: Record<string, string> = {
  expired: 'The sign-in from the LMS took too long and expired. Go back to the LMS and click “Open in IoT Studio” again.',
  invalid: 'IoT Studio could not verify the sign-in from the LMS. Start again from the LMS; if it keeps happening, ask your teacher.',
  replayed: 'That LMS sign-in was already used. Start again from the LMS.',
  disabled: 'Your IoT Studio account is disabled. Contact a Kokoon administrator.',
  unavailable: 'Signing in with the LMS is not available right now. Try again in a minute.',
};

/**
 * Sign in / create account. Credentials go to Kokoon Backend over HTTPS in
 * production; the session comes back as HttpOnly cookies, so nothing
 * sensitive is ever stored by this page.
 */
export function LoginPage() {
  const cfg = useAuth((s) => s.config);
  const notice = useAuth((s) => s.notice);
  const { path, query } = useLocation();
  const ssoErrorCode = query.get('sso_error');
  const ssoError = ssoErrorCode ? SSO_ERRORS[ssoErrorCode] ?? SSO_ERRORS.invalid : null;
  const lmsSso = cfg?.lmsSso?.enabled && cfg.lmsSso.startUrl ? cfg.lmsSso.startUrl : null;
  // Come back to the page the student was trying to open (the LMS re-checks it too).
  const lmsHref = lmsSso ? `${lmsSso}?next=${encodeURIComponent(path === '/login' ? '/' : path)}` : null;
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const canRegister = cfg?.registrationEnabled ?? false;

  const submit = async () => {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (mode === 'signin') await signIn(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
      if (path === '/login') navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <header className="auth-top">
        <span className="logo">KOKOON<span>.</span></span>
        <span className="sysver">IOT_STUDIO: {config.appVersion}</span>
      </header>
      <main className="auth-main" id="main">
        <section className="auth-hero">
          <div className="hero-kicker"><i /> KOKOON LABS · IOT STUDIO</div>
          <h1 className="hero-title">
            YOUR HARDWARE,<br />
            <em className="serif">live</em> ON SCREEN
          </h1>
          <p className="hero-sub">Sign in to build dashboards for the ESP32 projects you program in the LMS — toggles, gauges and charts bound to live MQTT variables.</p>
        </section>
        <section className="auth-card cut-frame" aria-labelledby="auth-title">
          <div className="kicker kicker-accent">// {mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}</div>
          <h2 id="auth-title" className="modal-title">{mode === 'signin' ? 'Welcome back to the lab' : 'Join IoT Studio'}</h2>
          {notice && mode === 'signin' && <p className="auth-notice"><Icon name="LuInfo" size={14} /> {notice}</p>}
          {ssoError && mode === 'signin' && <div className="auth-error" role="alert"><Icon name="LuCircleAlert" size={15} /> {ssoError}</div>}
          {lmsHref && mode === 'signin' && (
            <>
              <a className="btn btn-primary btn-lg auth-lms" href={lmsHref}>
                <Icon name="LuGraduationCap" size={16} /> Sign in with Kokoon LMS
              </a>
              <p className="muted small">Students: use your LMS account — your boards and programs come with you.</p>
              <div className="auth-divider" role="separator"><span>or with an IoT Studio password</span></div>
            </>
          )}
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {mode === 'register' && (
              <Field label="Your name" htmlFor="auth-name" error={fieldErrors.name}>
                <input id="auth-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
              </Field>
            )}
            <Field label="Email" htmlFor="auth-email" error={fieldErrors.email}>
              <input id="auth-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password" htmlFor="auth-password" error={fieldErrors.password} hint={mode === 'register' ? 'At least 10 characters, with a letter and a digit.' : undefined}>
              <input id="auth-password" className="input" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && <div className="auth-error" role="alert"><Icon name="LuCircleAlert" size={15} /> {error}</div>}
            <Button type="submit" variant={lmsHref && mode === 'signin' ? 'outline' : 'primary'} size="lg" disabled={busy} iconRight="LuArrowRight">
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
          <div className="auth-switch">
            {mode === 'signin' ? (
              canRegister ? (
                <>New here? <button type="button" className="link-btn" onClick={() => { setMode('register'); setError(null); }}>Create an account</button></>
              ) : (
                <span className="muted small">Accounts are created by your administrator.</span>
              )
            ) : (
              <>Already have an account? <button type="button" className="link-btn" onClick={() => { setMode('signin'); setError(null); }}>Sign in</button></>
            )}
          </div>
          {cfg?.demoWorkspaceOnSignup && mode === 'register' && <p className="muted small">New accounts start with a sample workspace. Its devices are simulated by the server and labelled SIM.</p>}
        </section>
      </main>
    </div>
  );
}
