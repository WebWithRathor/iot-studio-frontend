import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { PlanBadge, TokenMeter } from '../components/tokens';
import { Badge, Button, Field, PageHeader } from '../components/ui';
import { Link } from '../lib/router';
import { chargedWidgets, formatTokens } from '../lib/tokens';
import { ApiError, errorMessage } from '../services/api/client';
import { userApi } from '../services/api/endpoints';
import { refreshTokens, setTokenState, useStudio, useTokenBudget } from '../state/studio';
import { toast } from '../state/ui';
import { PLAN_LABELS } from '../types/models';
import { cn } from '../utils';

/** Rough "what you can build" figures for a budget, using the real costs. */
function capacity(allowance: number, c: { project: number; dashboard: number; widget: number }) {
  const widgetsInOne = Math.max(0, Math.floor((allowance - c.project) / c.widget));
  // dashboards of 8 widgets, spread over projects of 8 dashboards
  const perDash = c.dashboard + 8 * c.widget;
  const perProject = c.project - c.dashboard; // first dashboard is included in the project price
  let dashboards = 0;
  let left = allowance;
  while (left >= perDash + (dashboards % 8 === 0 ? perProject : 0)) {
    left -= perDash + (dashboards % 8 === 0 ? perProject : 0);
    dashboards++;
  }
  return { widgetsInOne, dashboards };
}

function RedeemCard() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!code.trim()) return setError('Enter the code printed in your kit box.');
    setBusy(true);
    setError('');
    try {
      const r = await userApi.redeemKit(code.trim());
      setTokenState(r.tokens);
      setCode('');
      toast(r.upgraded ? `Kit activated — welcome to ${PLAN_LABELS[r.tokens.plan]}!` : `Kit activated — ${formatTokens(r.tokens.plans.PREMIUM)} tokens added`, 'success');
    } catch (err) {
      setError(err instanceof ApiError && err.fieldErrors.code ? `${err.message} ${err.fieldErrors.code}` : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel-card cut-frame redeem-card">
      <div className="kicker kicker-accent">// ACTIVATE A KIT</div>
      <h2 className="panel-card-title">Bought a Kokoon kit?</h2>
      <p className="muted small">Your kit box has an activation code like <code>KOKO-XXXX-XXXX-XXXX</code>. Enter it to switch this account to Premium. Already Premium? Another kit adds another full allowance.</p>
      <form className="redeem-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="Kit code" htmlFor="kit-code" error={error}>
          <input id="kit-code" className="input mono" value={code} placeholder="KOKO-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} maxLength={40}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }} />
        </Field>
        <Button variant="primary" icon="LuKeyRound" disabled={busy} onClick={() => void submit()}>{busy ? 'Activating…' : 'Activate'}</Button>
      </form>
    </section>
  );
}

export function PlanPage() {
  const b = useTokenBudget();
  const projects = useStudio((s) => s.projects);
  const dashboards = useStudio((s) => s.dashboards);
  useEffect(() => { void refreshTokens(); }, []);
  const c = b.costs;
  const free = capacity(b.plans.FREE, c);
  const premium = capacity(b.plans.PREMIUM, c);
  const plus = capacity(b.plans.PLUS, c);
  const perProject = projects
    .map((p) => {
      const ds = dashboards.filter((d) => d.projectId === p.id);
      const widgets = ds.reduce((n, d) => n + chargedWidgets(d.widgets.length, d.freeWidgets), 0);
      const tokens = (p.sample ? 0 : c.project) + Math.max(0, ds.length - 1) * c.dashboard + widgets * c.widget;
      return { p, tokens, dashboards: ds.length, widgets: ds.reduce((n, d) => n + d.widgets.length, 0) };
    })
    .sort((a, z) => z.tokens - a.tokens);

  return (
    <main className="page" id="main">
      <PageHeader kicker="ACCOUNT" title="Plan" serif="& tokens">
        Tokens are your build budget. Projects, dashboards and widgets use tokens; deleting them gives the tokens straight back. Variables, devices and live data are always free.
      </PageHeader>

      <div className="plan-top">
        <section className="panel-card cut-frame plan-current">
          <div className="panel-card-head">
            <div>
              <div className="kicker kicker-accent">// YOUR PLAN</div>
              <h2 className="panel-card-title">{PLAN_LABELS[b.plan]} <PlanBadge plan={b.plan} /></h2>
            </div>
            <div className="plan-big"><strong>{formatTokens(b.available)}</strong><span>tokens left</span></div>
          </div>
          <TokenMeter />
          <dl className="kv">
            <div><dt>Plan allowance</dt><dd>{formatTokens(b.allowance - b.bonusTokens)}</dd></div>
            {b.bonusTokens > 0 && <div><dt>Bonus tokens</dt><dd>+{formatTokens(b.bonusTokens)}</dd></div>}
            <div><dt>Projects</dt><dd>{b.breakdown.projects.count} · {formatTokens(b.breakdown.projects.tokens)}</dd></div>
            <div><dt>Extra dashboards</dt><dd>{b.breakdown.dashboards.count} · {formatTokens(b.breakdown.dashboards.tokens)}</dd></div>
            <div><dt>Widgets</dt><dd>{b.breakdown.widgets.count} · {formatTokens(b.breakdown.widgets.tokens)}</dd></div>
            {b.breakdown.widgets.free > 0 && <div><dt>Free sample widgets</dt><dd>{b.breakdown.widgets.free} · 0</dd></div>}
          </dl>
        </section>
        <RedeemCard />
      </div>

      <section className="plan-compare">
        <article className={cn('plan-card cut-card', b.plan === 'FREE' && 'is-current')}>
          <div className="plan-card-head"><PlanBadge plan="FREE" />{b.plan === 'FREE' && <Badge tone="accent">CURRENT</Badge>}</div>
          <h3>{formatTokens(b.plans.FREE)} <small>tokens</small></h3>
          <p className="muted small">Every account. Explore the sample projects and build your first dashboard.</p>
          <ul className="plan-list">
            <li><Icon name="LuCheck" size={14} /> 1 project with up to {free.widgetsInOne} elements</li>
            <li><Icon name="LuCheck" size={14} /> All sample projects (free)</li>
            <li><Icon name="LuCheck" size={14} /> Live data, simulated devices, MQTT console</li>
          </ul>
        </article>
        <article className={cn('plan-card cut-card', b.plan === 'PLUS' && 'is-current')}>
          <div className="plan-card-head"><PlanBadge plan="PLUS" />{b.plan === 'PLUS' ? <Badge tone="accent">CURRENT</Badge> : <Badge tone="info">BUY ONLINE</Badge>}</div>
          <h3>{formatTokens(b.plans.PLUS)} <small>tokens</small></h3>
          <p className="muted small">A one-time token pack — no kit needed. Pay with UPI, card or net banking.</p>
          <ul className="plan-list">
            <li><Icon name="LuCheck" size={14} /> About {plus.dashboards} dashboards of 8 widgets</li>
            <li><Icon name="LuCheck" size={14} /> Tokens never expire</li>
            <li><Icon name="LuCheck" size={14} /> Buy again for another {formatTokens(b.plans.PLUS)}</li>
          </ul>
          <Link to="/payments" className="btn btn-primary btn-md">Buy {formatTokens(b.plans.PLUS)} tokens</Link>
        </article>
        <article className={cn('plan-card cut-frame-dark', b.plan === 'PREMIUM' && 'is-current')}>
          <div className="plan-card-head"><PlanBadge plan="PREMIUM" />{b.plan === 'PREMIUM' && <Badge tone="lime">CURRENT</Badge>}</div>
          <h3>{formatTokens(b.plans.PREMIUM)} <small>tokens</small></h3>
          <p className="small plan-card-sub">Included with a Kokoon hardware kit — activate it with the code in the box.</p>
          <ul className="plan-list">
            <li><Icon name="LuCheck" size={14} /> {premium.dashboards}+ dashboards of 8 widgets each</li>
            <li><Icon name="LuCheck" size={14} /> Many projects for every kit experiment</li>
            <li><Icon name="LuCheck" size={14} /> Each extra kit adds another {formatTokens(b.plans.PREMIUM)}</li>
          </ul>
        </article>
      </section>

      <section className="plan-costs">
        <article className="plan-card cut-card">
          <div className="kicker kicker-accent">// WHAT THINGS COST</div>
          <table className="table compact cost-table">
            <tbody>
              <tr><td>New project <span className="muted">(incl. first dashboard)</span></td><td>{formatTokens(c.project)}</td></tr>
              <tr><td>Each extra dashboard</td><td>{formatTokens(c.dashboard)}</td></tr>
              <tr><td>Each widget / element</td><td>{formatTokens(c.widget)}</td></tr>
              <tr><td>Variables, devices, live data</td><td>free</td></tr>
              <tr><td>Sample projects &amp; their widgets</td><td>free</td></tr>
            </tbody>
          </table>
          <p className="muted small">Deleting refunds the same amount. Going over a lowered budget never deletes your work — you just can’t add more until you’re back under it.</p>
        </article>
      </section>

      <section className="panel-card cut-card">
        <div className="kicker kicker-accent">// TOKENS BY PROJECT</div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Project</th><th>Dashboards</th><th>Widgets</th><th>Tokens</th></tr></thead>
            <tbody>
              {perProject.map(({ p, tokens, dashboards: dn, widgets }) => (
                <tr key={p.id}>
                  <td><Link to={`/projects/${p.id}`}>{p.name}</Link> {p.sample && <Badge tone="info">SAMPLE · FREE</Badge>}</td>
                  <td>{dn}</td>
                  <td>{widgets}</td>
                  <td><strong>{formatTokens(tokens)}</strong></td>
                </tr>
              ))}
              {!perProject.length && <tr><td colSpan={4} className="muted">No projects yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
