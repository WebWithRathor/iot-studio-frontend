import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { PlanBadge } from '../components/tokens';
import { Badge, Button, EmptyState, Field, PageHeader, Switch, Tabs } from '../components/ui';
import { formatTokens } from '../lib/tokens';
import { errorMessage } from '../services/api/client';
import { adminApi, type KitCode, type ManagedUser } from '../services/api/endpoints';
import { refreshConfig, useAuth, useHasPermission, useTokensEnabled } from '../state/auth';
import { refreshTokens } from '../state/studio';
import { toast } from '../state/ui';
import { PLAN_LABELS, type Plan } from '../types/models';
import { timeAgo } from '../utils';

function UserRow({ u, onSaved }: { u: ManagedUser; onSaved: (u: ManagedUser) => void }) {
  const me = useAuth((s) => s.user?.id);
  const [plan, setPlan] = useState<Plan>(u.plan);
  const [bonus, setBonus] = useState(String(u.bonusTokens));
  const [busy, setBusy] = useState(false);
  const bonusN = Number(bonus);
  const valid = Number.isInteger(bonusN) && bonusN >= 0 && bonusN <= 10_000_000;
  const dirty = plan !== u.plan || (valid && bonusN !== u.bonusTokens);
  const save = async () => {
    setBusy(true);
    try {
      const saved = await adminApi.changePlan(u.id, { plan, bonusTokens: bonusN });
      onSaved(saved);
      if (u.id === me) void refreshTokens();
      toast(`${u.name}: ${PLAN_LABELS[saved.plan]} · ${formatTokens(saved.tokenAllowance)} tokens`, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <tr>
      <td>
        <strong>{u.name}</strong> {u.lmsUserId && <Badge tone="info" title={`Linked to Kokoon LMS user ${u.lmsUserId}${u.source === 'lms' ? ' — created by signing in from the LMS' : ''}`}>LMS</Badge>}
        <div className="muted small">{u.email}</div>
      </td>
      <td><Badge tone={u.role === 'USER' ? 'neutral' : 'accent'}>{u.role.replace('_', ' ')}</Badge></td>
      <td>
        <select className="input input-inline" aria-label={`Plan for ${u.name}`} value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
          <option value="FREE">Free</option>
          <option value="PLUS">Plus</option>
          <option value="PREMIUM">Premium</option>
        </select>
      </td>
      <td>
        <input className="input input-inline admin-bonus" type="number" min={0} step={500} aria-label={`Bonus tokens for ${u.name}`} value={bonus} onChange={(e) => setBonus(e.target.value)} />
      </td>
      <td>{formatTokens(u.tokenAllowance)}</td>
      <td>{u.projectCount ?? '—'}</td>
      <td><Button size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty || !valid || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Button></td>
    </tr>
  );
}

function UsersTab() {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState('');
  const load = (query = q) => {
    setError('');
    adminApi.users({ q: query || undefined, pageSize: 50 }).then((p) => setUsers(p.items)).catch((err) => setError(errorMessage(err)));
  };
  useEffect(() => load(''), []);
  return (
    <section className="panel-card cut-card">
      <form className="admin-search" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <Icon name="LuSearch" size={15} />
        <input className="input-bare" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        <Button size="sm" onClick={() => load()}>Search</Button>
      </form>
      {error && <p className="field-error">{error}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>User</th><th>Role</th><th>Plan</th><th>Bonus tokens</th><th>Allowance</th><th>Projects</th><th /></tr></thead>
          <tbody>
            {users?.map((u) => <UserRow key={`${u.id}:${u.updatedAt}`} u={u} onSaved={(s) => setUsers((list) => list?.map((x) => (x.id === s.id ? { ...x, ...s } : x)) ?? null)} />)}
            {users && !users.length && <tr><td colSpan={7} className="muted">No users match.</td></tr>}
            {!users && !error && <tr><td colSpan={7} className="muted">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small">Plan changes apply immediately and are written to the audit log. Lowering a budget never deletes a user’s work.</p>
    </section>
  );
}

function KitCodesTab() {
  const [count, setCount] = useState('5');
  const [plan, setPlan] = useState<Plan>('PREMIUM');
  const [bonus, setBonus] = useState('0');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string[]>([]);
  const [codes, setCodes] = useState<KitCode[] | null>(null);
  const load = () => adminApi.kitCodes({ pageSize: 50 }).then((p) => setCodes(p.items)).catch((err) => toast(errorMessage(err), 'error'));
  useEffect(() => { void load(); }, []);
  const generate = async () => {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 100) return toast('Generate between 1 and 100 codes at a time.', 'error');
    setBusy(true);
    try {
      const r = await adminApi.generateKitCodes({ count: n, plan, bonusTokens: Math.max(0, Math.floor(Number(bonus) || 0)), note: note.trim() });
      setFresh(r.codes);
      void load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="admin-kits">
      <section className="panel-card cut-frame">
        <div className="kicker kicker-accent">// GENERATE KIT CODES</div>
        <p className="muted small">One code per kit box. A customer redeems it on <strong>Plan &amp; tokens</strong>. Codes are stored hashed — copy them now, they are shown only once.</p>
        <div className="form-row admin-kit-form">
          <Field label="How many" htmlFor="kc-count"><input id="kc-count" className="input" type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} /></Field>
          <Field label="Plan" htmlFor="kc-plan">
            <select id="kc-plan" className="input" value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
              <option value="PREMIUM">Premium</option>
              <option value="PLUS">Plus</option>
              <option value="FREE">Free (bonus tokens only)</option>
            </select>
          </Field>
          <Field label="Bonus tokens" htmlFor="kc-bonus" hint="On top of the plan"><input id="kc-bonus" className="input" type="number" min={0} step={500} value={bonus} onChange={(e) => setBonus(e.target.value)} /></Field>
          <Field label="Note" htmlFor="kc-note" hint="e.g. batch / order"><input id="kc-note" className="input" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <Button variant="primary" icon="LuTicket" disabled={busy} onClick={() => void generate()}>{busy ? 'Generating…' : 'Generate codes'}</Button>
        {fresh.length > 0 && (
          <div className="kit-fresh" role="status">
            <div className="kit-fresh-head">
              <strong>{fresh.length} new code{fresh.length === 1 ? '' : 's'}</strong>
              <Button size="sm" icon="LuCopy" onClick={() => void navigator.clipboard?.writeText(fresh.join('\n')).then(() => toast('Codes copied', 'success'), () => toast('Copy failed — select the codes and copy them manually.', 'error'))}>Copy all</Button>
            </div>
            <pre className="kit-fresh-list">{fresh.join('\n')}</pre>
          </div>
        )}
      </section>
      <section className="panel-card cut-card">
        <div className="kicker kicker-accent">// ISSUED CODES</div>
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Code</th><th>Plan</th><th>Bonus</th><th>Note</th><th>Created</th><th>Status</th></tr></thead>
            <tbody>
              {codes?.map((k) => (
                <tr key={k.id}>
                  <td><code>{k.code}</code></td>
                  <td><PlanBadge plan={k.plan} /></td>
                  <td>{k.bonusTokens ? `+${formatTokens(k.bonusTokens)}` : '—'}</td>
                  <td>{k.note || '—'}</td>
                  <td>{timeAgo(k.createdAt, Date.now())}</td>
                  <td>{k.redeemedAt ? <Badge tone="ok">REDEEMED {timeAgo(k.redeemedAt, Date.now()).toUpperCase()}</Badge> : <Badge>UNUSED</Badge>}</td>
                </tr>
              ))}
              {codes && !codes.length && <tr><td colSpan={6} className="muted">No codes issued yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** The switches: one click, applies to everyone. */
function SettingsCard() {
  const on = useTokensEnabled();
  const [busy, setBusy] = useState(false);
  const flip = async (next: boolean) => {
    setBusy(true);
    try {
      await adminApi.updateSettings({ tokensEnabled: next });
      await refreshConfig();
      toast(next ? 'Tokens are on: plans, costs and kit codes are back for everyone.' : 'Tokens are off: nothing is charged and students see no token elements.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel-card cut-frame admin-settings">
      <div className="kicker kicker-accent">// SWITCHES</div>
      <div className="admin-switch-row">
        <div>
          <strong>Token system</strong>
          <p className="muted small">Plans, token costs, kit codes and the Plan page. Off: nothing is charged and no token elements are shown. Students pick it up on their next page load.</p>
        </div>
        <Switch checked={on} label={busy ? 'Saving…' : on ? 'On' : 'Off'} onChange={(b) => void flip(b)} />
      </div>
    </section>
  );
}

export function AdminPage() {
  const allowed = useHasPermission('plans:manage');
  const [tab, setTab] = useState<'users' | 'kits'>('users');
  if (!allowed) {
    return (
      <main className="page" id="main">
        <EmptyState icon="LuLock" title="Administrators only">Plans and kit codes are managed by Kokoon administrators.</EmptyState>
      </main>
    );
  }
  return (
    <main className="page" id="main">
      <PageHeader kicker="ADMINISTRATION" title="Plans" serif="& kit codes">
        Give customers Premium, grant bonus tokens, and generate the activation codes that ship in kit boxes.
      </PageHeader>
      <SettingsCard />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'users', label: 'Users & plans' }, { value: 'kits', label: 'Kit codes' }]} />
      {tab === 'users' ? <UsersTab /> : <KitCodesTab />}
    </main>
  );
}
