import ShippingSummary from '@/components/ShippingSummary';
import { useShippingQuote } from '@/lib/shipping';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { ArrowLeft, ArrowRight, ShoppingBag, Trash2 } from '@/lib/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { getFieldNumber, getFieldValue, getTitle, type GenesisNode } from '@/lib/genesis-data';
import HouseShell from '@/components/HouseShell';
import { trackCommerceEvent } from '@/lib/analytics';
import { getCatalogProducts, getProductImages, money } from '@/lib/marketplace';

function EmptyBagCrickets() {
  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => {
    if (!soundOn) return;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) { setSoundOn(false); return; }
    const context = new AudioContextClass();
    // A soft, short, synthesized chirp: no downloaded audio and no autoplay.
    const chirp = () => {
      if (context.state !== 'running') return;
      const now = context.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        const t = now + i * 0.105;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(3200, t);
        osc.frequency.exponentialRampToValueAtTime(2500, t + 0.07);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.018, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        osc.connect(gain); gain.connect(context.destination);
        osc.start(t); osc.stop(t + 0.095);
      }
    };
    void context.resume().then(chirp).catch(() => setSoundOn(false));
    const timer = window.setInterval(chirp, 2700);
    return () => {
      window.clearInterval(timer);
      void context.close();
    };
  }, [soundOn]);
  return <div className="mx-auto flex max-w-sm flex-col items-center">
    <style>{`@keyframes briarCricketHop{0%,65%,100%{transform:translateY(0) rotate(-5deg)}72%{transform:translateY(-20px) rotate(8deg)}82%{transform:translateY(0) rotate(-5deg)}}@keyframes briarCricketSway{0%,100%{transform:rotate(7deg)}50%{transform:rotate(-8deg)}}@media(prefers-reduced-motion:reduce){.briar-cricket,.briar-cricket-antenna{animation:none!important}}`}</style>
    <div className="relative flex h-44 w-64 items-center justify-center rounded-[2rem] border border-primary/20 bg-accent/30" role="img" aria-label="Two little crickets hopping in an empty shopping bag">
      <ShoppingBag size={106} strokeWidth={1.1} className="text-primary/60" aria-hidden="true"/>
      {[{left:'35%',bottom:'26%',delay:'0s',scale:1},{left:'58%',bottom:'24%',delay:'1.1s',scale:.76}].map((bug,i)=><svg key={i} className="briar-cricket absolute h-14 w-16 overflow-visible" style={{left:bug.left,bottom:bug.bottom,animation:`briarCricketHop 3s ease-in-out ${bug.delay} infinite`,scale:bug.scale}} viewBox="0 0 80 70" fill="none" aria-hidden="true">
        <path d="M27 36 10 56M43 39 56 60M25 43 15 60M43 45 52 59" stroke="#63784c" strokeWidth="3" strokeLinecap="round"/>
        <ellipse cx="35" cy="36" rx="21" ry="14" fill="#80965b" stroke="#40583b" strokeWidth="2"/>
        <path d="M27 29q11 9 27 4" stroke="#c1cc8a" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="17" cy="31" r="10" fill="#9bad6c" stroke="#40583b" strokeWidth="2"/>
        <circle cx="14" cy="28" r="2.5" fill="#263c28"/>
        <path className="briar-cricket-antenna" d="M12 22Q2 8 5 2M19 21Q24 6 35 3" stroke="#40583b" strokeWidth="2" strokeLinecap="round" style={{transformOrigin:'16px 24px',animation:'briarCricketSway 1.8s ease-in-out infinite'}}/>
      </svg>)}
      <span className="absolute right-3 top-3 text-xs text-muted-foreground">chirp… chirp…</span>
    </div>
    <button type="button" aria-pressed={soundOn} onClick={() => setSoundOn(v => !v)} className="mt-4 min-h-11 rounded-full border border-border bg-card px-5 text-sm font-medium hover:border-primary hover:text-primary">{soundOn ? 'Mute the crickets' : 'Hear the crickets'}</button>
    <p className="mt-2 text-xs text-muted-foreground">Sound plays only when you turn it on.</p>
  </div>;
}

export default function CartPage() {
  const auth = useAuth();
  const [ids, setIds] = useState<string[]>([]); const [products, setProducts] = useState<GenesisNode[]>([]); const [searchParams] = useSearchParams();
  const donationState = searchParams.get('donation');
  const [catalogLoading,setCatalogLoading]=useState(true);
  const [catalogError,setCatalogError]=useState('');
  useEffect(() => { let active = true; const raw = window.localStorage.getItem('house-of-briar:cart'); let parsed: string[] = []; try { const value = raw ? JSON.parse(raw) : []; parsed = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; } catch {} const unique = Array.from(new Set(parsed)); setIds(unique); if (unique.length !== parsed.length) window.localStorage.setItem('house-of-briar:cart', JSON.stringify(unique)); setCatalogLoading(true); setCatalogError(''); void getCatalogProducts(auth.isAuthenticated).then((rows) => { if (!active) return; setProducts(rows); // Keep saved listing IDs until the shopper removes them; partial catalogs must not erase the suitcase. }).catch(() => { if (!active) return; setCatalogError('We could not load your saved pieces. Your suitcase has not been changed. Please try again.'); }).finally(() => { if (active) setCatalogLoading(false); }); return () => { active = false; }; }, [auth.isAuthenticated]);
  const items = useMemo(() => products.filter((item) => ids.includes(item.id)).map((item) => ({ ...item, quantity: 1 })), [ids, products]);
  const {quote,error:shippingError}=useShippingQuote(ids);
  const total = items.reduce((sum, item) => sum + (getFieldNumber(item, '@price', 'Price') ?? 0), 0);
  const shipments = useMemo(() => {
    const groups = new Map<string, GenesisNode[]>();
    items.forEach(item => { const designer=getFieldValue(item,'@desig','Designer') ?? 'Independent designer'; groups.set(designer,[...(groups.get(designer)??[]),item]); });
    return [...groups.entries()];
  }, [items]);
  const saveCart = (next: string[]) => { const unique = Array.from(new Set(next)); setIds(unique); window.localStorage.setItem('house-of-briar:cart', JSON.stringify(unique)); window.dispatchEvent(new Event('house-of-briar-cart')); };
  const remove = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    trackCommerceEvent({ event: 'remove_from_cart', listingId: id, listingName: item ? getTitle(item, 'Name') ?? undefined : undefined, value: item ? getFieldNumber(item, '@price', 'Price') ?? undefined : undefined, currency: 'USD', itemCount: Math.max(0, ids.length - 1) });
    saveCart(ids.filter((entry) => entry !== id));
  };
  useEffect(() => { if (items.length) trackCommerceEvent({ event: 'view_cart', value: total, currency: 'USD', itemCount: items.length }); }, [items.length, total]);
  return <HouseShell><section className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6"><Link to="/shop" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"><ArrowLeft size={16} /> Continue shopping</Link><div className="mt-8 flex items-end justify-between gap-4 border-b border-border pb-6"><div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Your suitcase</p><h1 className="mt-3 font-serif text-5xl">Pieces waiting for you.</h1></div><ShoppingBag className="text-primary" size={28} /></div>{donationState === 'success' && <p role="status" className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">Thank you for supporting independent design. Stripe will send a receipt if your donation completed.</p>}{donationState === 'canceled' && <p role="status" className="mt-6 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Donation checkout was canceled. Your suitcase is still here when you are ready.</p>}{catalogLoading ? <div role="status" className="py-16 text-center text-sm text-muted-foreground">Opening your suitcase…</div> : catalogError ? <div role="alert" className="py-14 text-center"><p className="text-sm text-destructive">{catalogError}</p><button type="button" onClick={()=>window.location.reload()} className="mt-5 min-h-11 rounded-full border border-border px-5 text-sm font-medium">Try again</button></div> : items.length === 0 ? <div className="py-16 text-center sm:py-20"><EmptyBagCrickets/><p className="mt-5 font-serif text-3xl">Your suitcase is open and waiting.</p><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">When a piece feels meant for you, tuck it into your suitcase. It will wait here while you keep wandering, then travel with you to secure checkout.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><Link to="/shop" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">Wander the collection <ArrowRight size={16} /></Link><Link to="/shop?liked=true" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-medium transition hover:border-primary hover:text-primary">Visit saved pieces</Link></div></div> : <><div className="space-y-5 pt-6">{shipments.map(([designer,shopItems],shipmentIndex)=><section key={designer} className="overflow-hidden rounded-3xl border border-border bg-card"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-accent/30 px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Shipment {shipmentIndex+1} of {shipments.length}</p><h2 className="mt-1 font-serif text-2xl">Shipping from {designer}</h2></div><p className="text-xs text-muted-foreground">Delivery timing set by this designer</p></div><div className="divide-y divide-border px-5">{shopItems.map((item) => { const name=getTitle(item,'Name')??'Untitled piece'; const image=getProductImages(getFieldValue(item,'@image','Image URL'),getFieldValue(item,'@gally','Gallery URLs'))[0]; return <div key={item.id} className="flex items-center gap-5 py-5"><Link to={`/shop/${item.id}`} className="size-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">{image?<img src={image} alt="" className="size-full object-cover"/>:null}</Link><div className="min-w-0 flex-1"><Link to={`/shop/${item.id}`} className="block truncate font-serif text-2xl transition hover:text-primary">{name}</Link><div className="mt-2 flex flex-wrap items-center gap-3"><span className="rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground">Qty 1</span><p className="text-sm font-semibold">{money.format(getFieldNumber(item,'@price','Price')??0)}</p></div></div><button type="button" onClick={()=>remove(item.id)} aria-label={`Remove ${name} from bag`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><Trash2 size={17}/></button></div>})}</div><div className="flex items-center justify-between border-t border-border px-5 py-4 text-sm"><span className="text-muted-foreground">Shop subtotal</span><strong>{money.format(shopItems.reduce((sum,item)=>sum+(getFieldNumber(item,'@price','Price')??0),0))}</strong></div></section>)}</div><p className="mt-5 rounded-2xl bg-accent/30 px-5 py-4 text-sm leading-6 text-muted-foreground">{shipments.length} {shipments.length===1?'shipment':'shipments'} in this order. Each designer ships separately and may have a different delivery date.</p><div className="mt-8 rounded-2xl border border-border bg-card p-6"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Subtotal</span><span className="text-2xl font-semibold tabular-nums">{money.format(total)}</span></div><p className="mt-3 text-sm leading-6 text-muted-foreground">Review shipping and pay securely through Stripe. Your delivery address is shared with the designers fulfilling your order.</p><ShippingSummary quote={quote} error={shippingError}/>{quote?.shippingReady ? <Link to="/checkout" className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90">Continue to checkout <ArrowRight size={16} /></Link> : <div className="mt-6"><button type="button" disabled className="inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground opacity-50">Checkout unavailable until shipping is ready <ArrowRight size={16} /></button><p className="mt-2 text-xs text-muted-foreground" role="status">Please wait for the shipping quote or review the shipping message above.</p></div>}</div></>}</section></HouseShell>;
}
