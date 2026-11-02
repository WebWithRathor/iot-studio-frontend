import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { PlanBadge, TokenMeter } from '../components/tokens';
import { Badge, Button, EmptyState, Modal, PageHeader } from '../components/ui';
import { Link } from '../lib/router';
import { formatTokens } from '../lib/tokens';
import { errorMessage } from '../services/api/client';
import { paymentApi, type CheckoutConfig, type CheckoutSession, type Payment, type Product } from '../services/api/endpoints';
import { setTokenState, useTokenBudget } from '../state/studio';
import { toast } from '../state/ui';
import { PLAN_LABELS } from '../types/models';
import { cn } from '../utils';

/**
 * Payments: buy the Plus pack (10,000 tokens).
 *   1. POST /payments/orders → server creates the order with the gateway
 *   2. checkout opens (Razorpay Checkout, or the built-in TEST checkout in development)
 *   3. the server verifies the gateway signature and only then adds the tokens
 * The browser never decides that a payment succeeded.
 */

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0 })}`;

/* ------------------------------------------------------------ Razorpay */

interface RazorpayResponse { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (evt: string, cb: (r: { error?: { description?: string } }) => void) => void };

let razorpayScript: Promise<RazorpayCtor> | null = null;
function loadRazorpay(): Promise<RazorpayCtor> {
  razorpayScript ??= new Promise((resolve, reject) => {
    const w = window as unknown as { Razorpay?: RazorpayCtor };
    if (w.Razorpay) return resolve(w.Razorpay);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error('Razorpay did not load.')));
    s.onerror = () => { razorpayScript = null; reject(new Error('Could not load the Razorpay checkout. Check your connection.')); };
    document.head.appendChild(s);
  });
  return razorpayScript;
}

function openRazorpay(session: CheckoutSession, payment: Payment): Promise<{ ok: true; tokens: Awaited<ReturnType<typeof paymentApi.verify>> } | { ok: false; reason: string }> {
  return loadRazorpay().then(
    (Razorpay) =>
      new Promise((resolve) => {
        let settled = false;
        const rz = new Razorpay({
          key: session.keyId,
          order_id: session.orderId,
          amount: session.amount,
          currency: session.currency,
          name: session.name,
          description: session.description,
          prefill: session.prefill,
          theme: { color: '#6262f5' },
          handler: async (r: RazorpayResponse) => {
            settled = true;
            try {
              const v = await paymentApi.verify({ paymentId: payment.id, providerOrderId: r.razorpay_order_id, providerPaymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
              resolve({ ok: true, tokens: v });
            } catch (err) {
              resolve({ ok: false, reason: errorMessage(err) });
            }
          },
          modal: { ondismiss: () => { if (!settled) resolve({ ok: false, reason: 'Checkout closed before paying.' }); } },
        });
        rz.on('payment.failed', (r) => { settled = true; resolve({ ok: false, reason: r.error?.description ?? 'The payment failed.' }); });
        rz.open();
      }),
  );
}

/* ------------------------------------------------------------ test checkout */

function TestCheckout({ session, payment, onDone }: { session: CheckoutSession; payment: Payment; onDone: (r: { ok: boolean; reason?: string; result?: Awaited<ReturnType<typeof paymentApi.completeMock>> }) => void }) {
  const [busy, setBusy] = useState<'success' | 'failure' | null>(null);
  const finish = async (outcome: 'success' | 'failure') => {
    setBusy(outcome);
    try {
      const r = await paymentApi.completeMock(payment.id, outcome);
      onDone(r.payment.status === 'paid' ? { ok: true, result: r } : { ok: false, reason: r.payment.failureReason ?? 'Payment declined.' });
    } catch (err) {
      onDone({ ok: false, reason: errorMessage(err) });
    }
  };
  return (
    <Modal
      open
      onClose={() => { if (!busy) { void paymentApi.cancel(payment.id, 'Checkout closed').catch(() => undefined); onDone({ ok: false, reason: 'Checkout closed before paying.' }); } }}
      kicker="TEST CHECKOUT"
      title={`Pay ${rupees(session.amount)}`}
      width={440}
      footer={
        <>
          <Button variant="danger" disabled={Boolean(busy)} onClick={() => void finish('failure')}>{busy === 'failure' ? 'Declining…' : 'Simulate failure'}</Button>
          <Button variant="primary" icon="LuCircleCheck" disabled={Boolean(busy)} onClick={() => void finish('success')}>{busy === 'success' ? 'Paying…' : `Pay ${rupees(session.amount)} (test)`}</Button>
        </>
      }
    >
      <div className="test-checkout-banner"><Icon name="LuTriangleAlert" size={14} /> Test mode — no money moves. This simulates the payment gateway for development.</div>
      <dl className="kv">
        <div><dt>Item</dt><dd>{session.description}</dd></div>
        <div><dt>Order</dt><dd><code>{session.orderId}</code></dd></div>
        <div><dt>Billed to</dt><dd>{session.prefill.name} · {session.prefill.email}</dd></div>
        <div><dt>Amount</dt><dd><strong>{rupees(session.amount)}</strong></dd></div>
      </dl>
      <p className="muted small">With real keys (<code>PAYMENT_PROVIDER=razorpay</code>) this step is the Razorpay checkout: UPI, cards, net banking and wallets.</p>
    </Modal>
  );
}

/* ------------------------------------------------------------ page */

const STATUS: Record<Payment['status'], { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  paid: { label: 'PAID', tone: 'ok' },
  created: { label: 'PENDING', tone: 'warn' },
  failed: { label: 'FAILED', tone: 'bad' },
};

export function PaymentsPage() {
  const b = useTokenBudget();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [checkout, setCheckout] = useState<CheckoutConfig | null>(null);
  const [history, setHistory] = useState<Payment[]>([]);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [testSession, setTestSession] = useState<{ session: CheckoutSession; payment: Payment } | null>(null);
  const [receipt, setReceipt] = useState<Payment | null>(null);

  const loadHistory = () => paymentApi.history().then(setHistory).catch(() => undefined);
  useEffect(() => {
    paymentApi.catalog().then((c) => { setProducts(c.products); setCheckout(c.checkout); }).catch((err) => setLoadError(errorMessage(err)));
    void loadHistory();
  }, []);

  const succeeded = (payment: Payment, tokens: Parameters<typeof setTokenState>[0]) => {
    setTokenState(tokens);
    setReceipt(payment);
    toast(`Payment received — ${formatTokens(payment.tokens)} tokens added`, 'success');
    void loadHistory();
  };

  const buy = async (p: Product) => {
    setBusy(p.id);
    try {
      const { payment, checkout: session } = await paymentApi.createOrder(p.id);
      if (session.provider === 'mock') {
        setTestSession({ session, payment });
        return;
      }
      const r = await openRazorpay(session, payment);
      if (r.ok) succeeded(r.tokens.payment, r.tokens.tokens);
      else {
        toast(r.reason, 'error');
        void loadHistory();
      }
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="page" id="main">
      <PageHeader kicker="ACCOUNT" title="Buy" serif="tokens">
        Need more room than the Free plan? Buy the Plus pack online. Already have a Kokoon kit? <Link to="/plan">Activate its code</Link> for Premium instead.
      </PageHeader>

      {checkout?.testMode && (
        <div className="test-checkout-banner is-page" role="note">
          <Icon name="LuTriangleAlert" size={15} />
          {checkout.provider === 'mock'
            ? <span><strong>Test payments.</strong> This server uses the built-in test checkout — no real money is charged. Set <code>PAYMENT_PROVIDER=razorpay</code> with your keys to accept real payments.</span>
            : <span><strong>Razorpay test mode</strong> (<code>rzp_test_</code> key). Use Razorpay’s test cards / UPI IDs; nothing is charged.</span>}
        </div>
      )}

      <div className="pay-top">
        <section className="panel-card cut-frame">
          <div className="kicker kicker-accent">// YOUR BALANCE</div>
          <h2 className="panel-card-title pay-plan">{PLAN_LABELS[b.plan]} <PlanBadge plan={b.plan} /></h2>
          <TokenMeter />
          <p className="muted small">Tokens you buy never expire. Deleting what you built gives tokens back, so a pack goes a long way.</p>
        </section>

        {loadError && <EmptyState icon="LuCircleAlert" title="Payments unavailable">{loadError}</EmptyState>}
        {products?.map((p) => {
          const upgrade = b.plan === 'FREE';
          return (
            <section key={p.id} className="panel-card cut-frame-dark pay-product">
              <div className="plan-card-head"><PlanBadge plan={p.plan} /><Badge tone="lime">ONE-TIME</Badge></div>
              <h3 className="pay-tokens">{formatTokens(p.tokens)} <small>tokens</small></h3>
              <div className="pay-price">{rupees(p.amount)} <small>incl. taxes · {p.currency}</small></div>
              <ul className="plan-list">
                <li><Icon name="LuCheck" size={14} /> {upgrade ? `Switches you to Plus: ${formatTokens(p.tokens)} tokens instead of ${formatTokens(b.plans.FREE)}` : `Adds ${formatTokens(p.tokens)} bonus tokens to your ${PLAN_LABELS[b.plan]} plan`}</li>
                <li><Icon name="LuCheck" size={14} /> About {Math.floor(p.tokens / (b.costs.dashboard + 8 * b.costs.widget))} dashboards of 8 widgets</li>
                <li><Icon name="LuCheck" size={14} /> Buy again any time for another {formatTokens(p.tokens)}</li>
              </ul>
              <Button variant="lime" size="lg" icon="LuSparkles" disabled={busy !== null || !checkout} onClick={() => void buy(p)}>
                {busy === p.id ? 'Opening checkout…' : `Buy for ${rupees(p.amount)}`}
              </Button>
              <p className="pay-secure"><Icon name="LuLock" size={12} /> {checkout?.provider === 'razorpay' ? 'Secure checkout by Razorpay — UPI, cards, net banking, wallets.' : 'Verified by the Kokoon server before tokens are added.'}</p>
            </section>
          );
        })}
      </div>

      <section className="panel-card cut-card">
        <div className="kicker kicker-accent">// PAYMENT HISTORY</div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Item</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td>{p.productName}{p.provider === 'mock' && <span className="muted small"> · test</span>}</td>
                  <td>{rupees(p.amount)}</td>
                  <td><Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>{p.failureReason && p.status === 'failed' && <div className="muted small">{p.failureReason}</div>}</td>
                  <td><code className="pay-ref">{p.providerPaymentId ?? p.providerOrderId}</code></td>
                </tr>
              ))}
              {!history.length && <tr><td colSpan={5} className="muted">No payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted small">A payment marked PENDING is waiting for the gateway’s confirmation (some UPI payments confirm after a few minutes); tokens are added automatically when it does.</p>
      </section>

      {testSession && (
        <TestCheckout
          session={testSession.session}
          payment={testSession.payment}
          onDone={(r) => {
            setTestSession(null);
            if (r.ok && r.result) succeeded(r.result.payment, r.result.tokens);
            else {
              toast(r.reason ?? 'Payment not completed.', 'error');
              void loadHistory();
            }
          }}
        />
      )}

      {receipt && (
        <Modal open onClose={() => setReceipt(null)} kicker="PAYMENT RECEIVED" title="Thank you!" width={440}
          footer={<><Link to="/payments" className="btn btn-ghost btn-md" onClick={() => setReceipt(null)}>Close</Link><Link to="/" className="btn btn-primary btn-md" onClick={() => setReceipt(null)}>Start building</Link></>}>
          <div className={cn('pay-receipt')}>
            <Icon name="LuCircleCheck" size={28} />
            <div><strong>{formatTokens(receipt.tokens)} tokens added</strong><span className="muted small">You’re on the {PLAN_LABELS[b.plan]} plan · {formatTokens(b.available)} tokens available</span></div>
          </div>
          <dl className="kv">
            <div><dt>Amount</dt><dd>{rupees(receipt.amount)}</dd></div>
            <div><dt>Reference</dt><dd><code>{receipt.providerPaymentId}</code></dd></div>
            <div><dt>Date</dt><dd>{receipt.paidAt ? new Date(receipt.paidAt).toLocaleString('en-IN') : '—'}</dd></div>
          </dl>
        </Modal>
      )}
    </main>
  );
}
