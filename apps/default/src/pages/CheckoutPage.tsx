import ShippingSummary from '@/components/ShippingSummary';
import { useShippingQuote } from '@/lib/shipping';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { ArrowLeft, ArrowRight, BadgeCheck, CreditCard, LockKeyhole, ShieldCheck, Truck } from '@/lib/icons';
import { Link, useSearchParams } from 'react-router-dom';
import HouseShell from '@/components/HouseShell';
import { getFieldNumber, getFieldValue, getTitle, type GenesisNode } from '@/lib/genesis-data';
import { getCatalogProducts, money } from '@/lib/marketplace';
import { cancelCheckoutOrder, createCheckoutSession, verifyCheckoutSession, type CheckoutItem } from '@/lib/stripe';
import { trackCommerceEvent } from '@/lib/analytics';

type SnapshotItem = { id: string; name: string; amount: number; quantity: number };
type CheckoutSnapshot = { ids: string[]; items: SnapshotItem[]; subtotal: number };

const CART_KEY = 'house-of-briar:cart';
const PENDING_KEY = 'house-of-briar:checkout-pending';

function readCartIds(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(CART_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function readSnapshot(): CheckoutSnapshot | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? 'null') as CheckoutSnapshot | null;
    return value && Array.isArray(value.ids) && Array.isArray(value.items) ? value : null;
  } catch {
    return null;
  }
}

export default function CheckoutPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const returnState = searchParams.get('checkout');
  const sessionId = searchParams.get('session_id');
  const canceledOrderId = searchParams.get('order_id');
  const cancelToken = searchParams.get('cancel_token');
  const [cartIds, setCartIds] = useState<string[]>(readCartIds);
  const [products, setProducts] = useState<GenesisNode[]>([]);
  const [snapshot] = useState<CheckoutSnapshot | null>(readSnapshot);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [paymentState, setPaymentState] = useState<'idle' | 'opening' | 'verifying' | 'paid' | 'cancelled' | 'failed'>(returnState === 'canceled' ? 'cancelled' : 'idle');
  const [paymentError, setPaymentError] = useState('');
  const [giftNotes,setGiftNotes]=useState<Record<string,string>>({});
  const [promoInput,setPromoInput]=useState('');
  const [promoCodes,setPromoCodes]=useState<string[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    void getCatalogProducts(auth.isAuthenticated)
      .then((rows) => { if (active) setProducts(rows); })
      .catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : 'The collection could not load.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [auth.isAuthenticated]);

  const sourceIds = returnState === 'success' && snapshot ? snapshot.ids : cartIds;
  const catalogItems = useMemo(() => {
    const selected = new Set(sourceIds);
    return products
      .filter((product) => selected.has(product.id))
      .map((product) => ({
        id: product.id,
        name: getTitle(product, 'Name') ?? 'House of Briar piece',
        amount: getFieldNumber(product, '@price', 'Price') ?? 0,
        quantity: 1,
        giftNoteAvailable: getFieldValue(product,'@giftn','Gift Note')==='yes',
        designer: getFieldValue(product, '@desig', 'Designer') ?? 'Independent designer',
      }));
  }, [products, sourceIds]);
  const items = returnState === 'success' && snapshot ? snapshot.items : catalogItems;
  const shipmentCount = new Set(catalogItems.map(item => 'designer' in item ? item.designer : 'House of Briar')).size;
  const subtotal = returnState === 'success' && snapshot ? snapshot.subtotal : catalogItems.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  const hasItems = items.length > 0;
  const {quote,error:shippingError}=useShippingQuote(sourceIds,promoCodes,returnState!=='success');
  const guestCatalog = !auth.isAuthenticated;
  const canCheckout = returnState !== 'success' && quote?.shippingReady === true && catalogItems.length === sourceIds.length && catalogItems.length > 0 && catalogItems.every((item) => item.amount > 0) && !loading;

  useEffect(() => {
    if (returnState !== 'canceled' || !canceledOrderId || !cancelToken) return;
    void cancelCheckoutOrder(canceledOrderId, cancelToken)
      .then(() => {
        window.localStorage.removeItem(PENDING_KEY);
        setPaymentState('cancelled');
        trackCommerceEvent({ event: 'checkout_abandoned', orderId: canceledOrderId, value: snapshot?.subtotal, currency: 'USD', itemCount: snapshot?.items.length });
      })
      .catch(() => setPaymentError('Your checkout was canceled. The reservation will release automatically if it could not be released immediately.'));
  }, [returnState, canceledOrderId, cancelToken]);

  useEffect(() => {
    if (returnState !== 'success') return;
    if (!sessionId) {
      setPaymentState('failed');
      setPaymentError('The payment return did not include a receipt reference, so it could not be verified.');
      return;
    }
    let active = true;
    setPaymentState('verifying');
    setPaymentError('');
    void verifyCheckoutSession(sessionId)
      .then((result) => {
        if (!active) return;
        if (!result.paid) {
          setPaymentState('failed');
          setPaymentError('Stripe has not marked this payment as paid. Your cart is unchanged.');
          return;
        }
        setPaymentState('paid');
        trackCommerceEvent({ event: 'purchase', orderId: sessionId, value: snapshot?.subtotal, currency: 'USD', itemCount: snapshot?.items.length });
        const purchasedIds = snapshot?.ids ?? [];
        const remaining = readCartIds().filter((id) => !purchasedIds.includes(id));
        window.localStorage.setItem(CART_KEY, JSON.stringify(remaining));
        window.localStorage.removeItem(PENDING_KEY);
        setCartIds(remaining);
        window.dispatchEvent(new Event('house-of-briar-cart'));
      })
      .catch((error) => {
        if (!active) return;
        setPaymentState('failed');
        setPaymentError(error instanceof Error ? error.message : 'Payment could not be verified.');
      });
    return () => { active = false; };
  }, [returnState, sessionId, snapshot]);

  const beginCheckout = async () => {
    if (!canCheckout || paymentState === 'opening' || paymentState === 'verifying' || paymentState === 'paid') return;
    setPaymentState('opening');
    setPaymentError('');
    const checkoutItems: CheckoutItem[] = catalogItems.map(({ id, name, amount, quantity }) => ({ id, name, amount, quantity,giftNote:giftNotes[id]||undefined }));
    const nextSnapshot: CheckoutSnapshot = { ids: catalogItems.map((item) => item.id), items: catalogItems, subtotal };
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(nextSnapshot));
    trackCommerceEvent({ event: 'begin_checkout', value: subtotal, currency: 'USD', itemCount: catalogItems.length });
    try {
      const url = await createCheckoutSession(checkoutItems, auth.user?.access_token ?? '', promoCodes, quote?.totalBeforeTaxCents ?? undefined);
      window.location.assign(url);
    } catch (error) {
      window.localStorage.removeItem(PENDING_KEY);
      setPaymentState('failed');
      setPaymentError(error instanceof Error ? error.message : 'Secure checkout could not start.');
    }
  };

  const paymentComplete = paymentState === 'paid';
  const emptyBag = !loading && !loadError && !hasItems && !paymentComplete && returnState !== 'success';

  return <HouseShell>
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <Link to="/cart" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"><ArrowLeft size={16} /> Back to cart</Link>
      <div className="mt-7 border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">House of Briar checkout</p>
        <h1 className="mt-3 font-serif text-3xl leading-tight sm:text-5xl">A thoughtful final step.</h1>
        <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" aria-label="Checkout steps">
          <span className="rounded-full bg-accent px-4 py-2 text-accent-foreground">01 · Bag</span>
          <span className="rounded-full border border-border px-4 py-2">02 · Delivery</span>
          <span className="rounded-full border border-border px-4 py-2">03 · Payment</span>
        </div>
      </div>

      {returnState === 'success' && paymentState === 'verifying' && <p role="status" className="mt-8 rounded-2xl border border-border bg-card p-5 text-sm">Verifying your payment with Stripe. Please keep this page open.</p>}
      {returnState === 'success' && paymentState === 'failed' && <div role="alert" className="mt-8 rounded-2xl border border-destructive/30 bg-card p-5 text-sm"><p className="font-semibold">Payment confirmation is not available yet.</p><p className="mt-2 text-muted-foreground">{paymentError} Do not start another payment until you check your receipt or contact support.</p><Link to="/cart" className="mt-3 inline-flex min-h-11 items-center underline">Return to cart</Link></div>}
      {loading && !paymentComplete && <div className="mt-8 grid gap-4 md:grid-cols-[1.3fr_0.7fr]"><div className="h-56 animate-pulse rounded-3xl bg-muted" /><div className="h-56 animate-pulse rounded-3xl bg-muted" /></div>}
      {!loading && loadError && !paymentComplete && <div role="alert" className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">{loadError} <button type="button" onClick={() => window.location.reload()} className="ml-2 underline underline-offset-4">Retry</button></div>}
      {emptyBag && <div className="mt-8 rounded-3xl border border-border bg-card p-8 text-center sm:p-12"><p className="font-serif text-3xl">Your cart is waiting for a piece.</p><Link to="/shop" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">Explore the collection <ArrowRight size={16} /></Link></div>}

      {paymentComplete && <section role="status" className="mt-8 rounded-3xl border border-primary/30 bg-card p-8 text-center"><BadgeCheck size={36} className="mx-auto text-primary"/><h2 className="mt-4 font-serif text-3xl">Order confirmed</h2><p className="mt-3 text-sm text-muted-foreground">Stripe verified your payment. Your cart has been updated.</p><p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted-foreground">Each designer prepares and ships their pieces separately. Processing time is listed on each piece; carrier transit time comes afterward.</p><div className="mt-4 flex flex-wrap justify-center gap-4"><Link to="/account" className="inline-flex min-h-11 items-center text-sm underline">My account &amp; orders</Link><a href="mailto:houseofbriar26@gmail.com" className="inline-flex min-h-11 items-center text-sm underline">Get help with this order</a></div><p className="mt-2 text-xs text-muted-foreground">Guest shopper? Keep your payment receipt and contact support if you need help with your order.</p><p className="mt-2 text-xs text-muted-foreground">Receipt reference: {sessionId?.slice(-8).toUpperCase()}</p><Link to="/shop" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">Continue shopping</Link></section>}
      {!loading && !loadError && hasItems && !paymentComplete && <div className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-card p-5 sm:p-7" aria-labelledby="delivery-heading">
            <div className="flex items-start gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"><Truck size={19} /></span><div><h2 id="delivery-heading" className="font-serif text-2xl">Delivery, your way</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">This order contains {shipmentCount} {shipmentCount===1?'designer shipment':'designer shipments'}. Each designer fulfills separately, so packages and delivery dates can differ. Stripe collects your delivery address, which is shared with the designers fulfilling your order. Card details stay with Stripe.</p></div></div>
            <div className="mt-6 rounded-2xl border border-border p-4"><p className="font-medium">Separate fulfillment by designer</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Shipping charges and lead times belong to each seller shipment—not to the cart as a whole. House of Briar keeps the payment combined while tracking fulfillment and payouts per designer.</p></div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">Delivery is currently available to US addresses. Preparation time and carrier transit are separate; we do not promise an exact delivery date.</p>
          </section>
          <section className="rounded-3xl border border-border bg-card p-5 sm:p-7" aria-labelledby="payment-heading">
            <div className="flex items-start gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"><CreditCard size={19} /></span><div><h2 id="payment-heading" className="font-serif text-2xl">Payment that feels right</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Pay securely by card or bank through Stripe.</p></div></div>
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted-foreground"><span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2"><ShieldCheck size={16} /> Protected by Stripe</span><span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2"><LockKeyhole size={16} /> Card details never touch this app</span></div>
          </section>
        </div>

        <aside className="h-fit rounded-3xl border border-border bg-card p-5 sm:p-7" aria-labelledby="summary-heading">
          {paymentComplete ? <div className="py-3 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"><BadgeCheck size={28} /></span><h2 id="summary-heading" className="mt-4 font-serif text-3xl">Order confirmed</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Stripe confirmed your payment. Your cart has been cleared on this device.</p><p className="mt-3 text-xs text-muted-foreground">Receipt reference: {sessionId?.slice(-8).toUpperCase()}</p><Link to="/shop" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">Continue shopping</Link></div> : <>
            <h2 id="summary-heading" className="font-serif text-2xl">Your order</h2><section className="mt-4 space-y-3" aria-label="Gift notes">{catalogItems.filter(item=>item.giftNoteAvailable).map(item=><label key={item.id} className="block text-sm">Free gift note · {item.name}<textarea maxLength={500} value={giftNotes[item.id]||''} onChange={e=>setGiftNotes(notes=>({...notes,[item.id]:e.target.value}))} placeholder="Optional message for the gift recipient" className="mt-2 block w-full rounded-xl border border-border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"/><span className="text-xs text-muted-foreground">Up to 500 characters. Shared with this piece’s designer for packing.</span></label>)}</section>
            <div className="mt-5 divide-y divide-border">{items.map((item) => <div key={item.id} className="flex items-start justify-between gap-4 py-4"><div className="min-w-0"><p className="truncate text-sm">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">One of one · Qty 1</p></div><p className="shrink-0 text-sm font-medium tabular-nums">{money.format(item.amount * item.quantity)}</p></div>)}</div>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-5"><span className="text-sm text-muted-foreground">Item subtotal</span><span className="text-sm tabular-nums">{money.format(subtotal)}</span></div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-4"><span className="text-sm font-medium">Items total</span><span className="text-xl font-semibold tabular-nums">{money.format(subtotal)}</span></div>
            <ShippingSummary quote={quote} error={shippingError}/>
            <div className="mt-5 border-t border-border pt-5"><label htmlFor="seller-promo" className="text-sm font-medium">Designer promo code</label><div className="mt-2 flex gap-2"><input id="seller-promo" value={promoInput} onChange={e=>setPromoInput(e.target.value.toUpperCase())} placeholder="Enter code" className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"/><button type="button" onClick={()=>{const code=promoInput.trim().toUpperCase();if(code&&!promoCodes.includes(code))setPromoCodes(v=>[...v,code]);setPromoInput('');}} className="min-h-11 shrink-0 rounded-xl border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Apply</button></div>{promoCodes.length>0&&<div className="mt-2 flex flex-wrap gap-2">{promoCodes.map(code=><button type="button" key={code} onClick={()=>setPromoCodes(v=>v.filter(x=>x!==code))} aria-label={`Remove promo code ${code}`} className="min-h-11 rounded-full bg-accent px-4 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{code} ×</button>)}</div>}<p className="mt-2 text-xs leading-5 text-muted-foreground">A designer code applies only to eligible pieces from that designer. The server recalculates every discount before payment.</p></div>
            {paymentState === 'cancelled' && <p role="status" className="mt-4 rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">Checkout was canceled. Your cart is still here.</p>}
            {(paymentState === 'failed' || paymentError) && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{paymentError}</p>}
            {guestCatalog && <p role="status" className="mt-4 text-sm leading-6 text-muted-foreground">Guest checkout uses the public catalog prices, which may not reflect recent changes. Please review the total in Stripe before paying.</p>}
            <button type="button" onClick={() => void beginCheckout()} disabled={!canCheckout || paymentState === 'opening' || paymentState === 'verifying'} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">{paymentState === 'opening' ? 'Opening secure checkout…' : 'Continue to secure checkout'} <ArrowRight size={16} /></button>
            <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">By continuing, you’ll enter a secure Stripe checkout. Any available discounts are shown and applied in secure checkout.</p>
          </>}
        </aside>
      </div>}
    </section>
  </HouseShell>;
}
