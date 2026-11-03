import { formatTokens } from '../lib/tokens';
import { navigate } from '../lib/router';
import { useTokenBudget } from '../state/studio';
import { useTokensEnabled } from '../state/auth';
import { closeTokenPrompt, useUi } from '../state/ui';
import { cn } from '../utils';
import { Icon } from './Icon';
import { Button, Modal } from './ui';

/** Share of the budget used, 0–1. */
const share = (used: number, allowance: number) => (allowance > 0 && Number.isFinite(allowance) ? Math.min(1, used / allowance) : 0);
const tone = (s: number) => (s >= 1 ? 'is-out' : s >= 0.8 ? 'is-low' : '');

export function PlanBadge({ plan }: { plan: string }) {
  return (
    <span className={cn('plan-badge', plan === 'PREMIUM' && 'is-premium', plan === 'PLUS' && 'is-plus')}>
      {plan === 'PREMIUM' && <Icon name="LuCrown" size={11} />}
      {plan === 'PLUS' && <Icon name="LuSparkles" size={11} />}
      {plan === 'PREMIUM' ? 'PREMIUM' : plan === 'PLUS' ? 'PLUS' : 'FREE'}
    </span>
  );
}

/** Top-bar pill: tokens left, links to the plan page. */
export function TokenPill() {
  const b = useTokenBudget();
  const on = useTokensEnabled();
  if (!on || !b.known) return null;
  const s = share(b.used, b.allowance);
  return (
    <button type="button" className={cn('token-pill', tone(s))} onClick={() => navigate('/plan')} title={`${formatTokens(b.used)} of ${formatTokens(b.allowance)} tokens used — open Plan & tokens`}>
      <Icon name="LuCoins" size={14} />
      <span className="token-pill-num">{formatTokens(b.available)}</span>
      <span className="token-pill-unit">tokens</span>
      {b.plan === 'PREMIUM' && <Icon name="LuCrown" size={12} className="token-pill-crown" />}
    </button>
  );
}

/** Horizontal meter with used / allowance. `pending` previews a cost (e.g. hovering a component). */
export function TokenMeter({ compact, pending = 0 }: { compact?: boolean; pending?: number }) {
  const b = useTokenBudget();
  const on = useTokensEnabled();
  if (!on || !b.known) return null;
  const s = share(b.used, b.allowance);
  const p = share(Math.min(b.allowance, b.used + pending), b.allowance) - s;
  return (
    <div className={cn('token-meter', compact && 'is-compact', tone(s))} role="meter" aria-label="Tokens used" aria-valuemin={0} aria-valuemax={b.allowance} aria-valuenow={b.used}>
      <div className="token-meter-row">
        <span className="token-meter-label"><Icon name="LuCoins" size={13} /> {formatTokens(b.available)} left</span>
        <span className="token-meter-of">{formatTokens(b.used)} / {formatTokens(b.allowance)}</span>
      </div>
      <div className="token-meter-track">
        <span className="token-meter-fill" style={{ width: `${s * 100}%` }} />
        {p > 0 && <span className="token-meter-pending" style={{ left: `${s * 100}%`, width: `${p * 100}%` }} />}
      </div>
    </div>
  );
}

export function CostTag({ cost, affordable = true, free }: { cost: number; affordable?: boolean; free?: boolean }) {
  return (
    <span className={cn('cost-tag', !affordable && 'is-blocked', free && 'is-free')} title={free ? 'Uses a free sample slot' : `${formatTokens(cost)} tokens`}>
      <Icon name="LuCoins" size={11} />
      {free ? 'FREE' : formatTokens(cost)}
    </span>
  );
}

/** Modal shown when an action needs more tokens than are left. Mounted once in App. */
export function TokenPromptHost() {
  const p = useUi((s) => s.tokenPrompt);
  const b = useTokenBudget();
  const on = useTokensEnabled();
  if (!p || !on) return null;
  const premium = b.plan === 'PREMIUM';
  return (
    <Modal
      open
      onClose={closeTokenPrompt}
      kicker="OUT OF TOKENS"
      title={`Not enough tokens to ${p.action}`}
      width={480}
      footer={
        <>
          <Button onClick={closeTokenPrompt}>Not now</Button>
          <Button icon={premium ? 'LuCoins' : 'LuKeyRound'} onClick={() => { closeTokenPrompt(); navigate('/plan'); }}>
            {premium ? 'See my tokens' : 'I have a kit code'}
          </Button>
          <Button variant="primary" icon="LuSparkles" onClick={() => { closeTokenPrompt(); navigate('/payments'); }}>
            Buy {formatTokens(b.plans.PLUS)} tokens
          </Button>
        </>
      }
    >
      <p className="modal-text">
        {p.message ?? <>This needs <strong>{formatTokens(p.needed)} tokens</strong> and you have <strong>{formatTokens(p.available)}</strong> left.</>}
      </p>
      <TokenMeter pending={p.needed} />
      <p className="muted small">
        {premium
          ? 'Delete widgets, dashboards or projects you no longer need — their tokens come straight back. Each extra kit adds another allowance.'
          : `You have ${formatTokens(b.allowance)} tokens on the ${b.plan === 'PLUS' ? 'Plus' : 'Free'} plan. Buy the Plus pack for ${formatTokens(b.plans.PLUS)} tokens, activate the code from your Kokoon kit for ${formatTokens(b.plans.PREMIUM)} (30+ dashboards), or delete something to get its tokens back.`}
      </p>
    </Modal>
  );
}
