import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from 'react-oidc-context';
import { Link } from 'react-router-dom';
import { ArrowLeft, LogIn, Pencil, Plus, Save, Trash2 } from '@/lib/icons';
import HouseShell from '@/components/HouseShell';
import StudioPhotoPicker, { releaseStudioPhotoPreviews, type StudioPhoto } from '@/components/StudioPhotoPicker';
import { MARKET_CATEGORIES } from '@/lib/marketplace';

type StudioListing = { id:string; title:string; description:string; price:number; category:string; status:string; moderationStatus:string; moderationReason?:string|null; images:Array<{id:string;url:string}> };
type SellerOrder = {
  id: string; fulfillmentStatus: string; payoutStatus: string; earningsCents: number;
  trackingCarrier?: string; trackingNumber?: string; trackingStatus?: string;
  items: Array<{ title: string; quantity: number; earningsCents: number }>;
};
const DEFAULT_CATEGORY = MARKET_CATEGORIES[0];

function StudioContent() {
  const auth = useAuth();
  const designerEmail = auth.user?.profile.email ?? '';
  const [products, setProducts] = useState<StudioListing[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);
  const [photos, setPhotos] = useState<StudioPhoto[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [orderMessage, setOrderMessage] = useState('');
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, { carrier: string; trackingNumber: string }>>({});
  const [payoutStatus, setPayoutStatus] = useState<{ connected: boolean; onboardingComplete: boolean; payoutsEnabled: boolean } | null>(null);
  const [payoutMessage, setPayoutMessage] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [studioAccess, setStudioAccess] = useState<'checking' | 'designer' | 'signup'>('checking');
  const [rulesAccepted,setRulesAccepted]=useState<Record<string,boolean>>({});

  const sellerToken = auth.user?.access_token ?? '';
  const refreshOrders = async () => {
    if (!sellerToken) return;
    try {
      const response = await fetch('/api/my/orders', { headers: { Authorization: `Bearer ${sellerToken}` } });
      if (!response.ok) throw new Error('Orders could not be loaded.');
      const data = await response.json();
      setOrders(data.orders ?? []);
    } catch (error) { setOrderMessage(error instanceof Error ? error.message : 'Orders could not be loaded.'); }
  };

  const refreshPayoutStatus = async () => {
    if (!sellerToken) return;
    try {
      const response = await fetch('/api/my/stripe-status', { headers: { Authorization: `Bearer ${sellerToken}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'Payout status could not be loaded.');
      setPayoutStatus(data);
      setPayoutMessage('');
    } catch (error) { setPayoutMessage(error instanceof Error ? error.message : 'Payout status could not be loaded.'); }
  };

  const startPayoutSetup = async () => {
    if (!sellerToken) return;
    setPayoutLoading(true);
    setPayoutMessage('');
    try {
      const response = await fetch('/api/my/stripe-onboarding', { method: 'POST', headers: { Authorization: `Bearer ${sellerToken}`, 'Content-Type': 'application/json' }, body: '{}' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'Payout setup could not be started.');
      if (!data.onboardingUrl) throw new Error('Stripe did not return an onboarding link.');
      window.location.assign(data.onboardingUrl);
    } catch (error) { setPayoutMessage(error instanceof Error ? error.message : 'Payout setup could not be started.'); setPayoutLoading(false); }
  };

  const refreshProducts = async () => {
    if (!sellerToken) return;
    try {
      const response = await fetch('/api/my/listings', { headers: { Authorization: `Bearer ${sellerToken}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'Your listings could not be loaded.');
      setProducts(data.items ?? []);
      setLoadError('');
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Your listings could not be loaded.'); }
  };

  useEffect(() => {
    if (!auth.isAuthenticated || !sellerToken) { setStudioAccess('checking'); return; }
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/my/designer-profile', { headers: { Authorization: `Bearer ${sellerToken}` } });
        if (!active) return;
        if (response.ok) {
          setStudioAccess('designer');
          void refreshProducts();
          void refreshOrders();
          void refreshPayoutStatus();
          return;
        }
        if (response.status === 403 || response.status === 404) { setStudioAccess('signup'); return; }
        setStudioAccess('signup');
      } catch { if (active) setStudioAccess('signup'); }
    })();
    return () => { active = false; };
  }, [auth.isAuthenticated, sellerToken]);

  const resetListingForm = () => {
    releaseStudioPhotoPreviews(photos); setName(''); setPrice(''); setDescription(''); setCategory(DEFAULT_CATEGORY); setPhotos([]); setEditingId(null);
  };

  const beginEdit = (product: StudioListing) => {
    releaseStudioPhotoPreviews(photos); setEditingId(product.id); setName(product.title); setPrice(String(product.price)); setDescription(product.description); setCategory(product.category);
    setPhotos((product.images ?? []).map((image,index)=>({key:`saved-${image.id}`,name:`Photo ${index+1}`,url:image.url,previewUrl:image.url})));
    setMessage(product.moderationReason ? `Changes requested: ${product.moderationReason}` : 'Editing this listing.');
  };

  if (!auth.isAuthenticated) {
    return <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 text-center"><LogIn className="mx-auto text-primary" size={28} /><h1 className="mt-5 font-serif text-4xl">Your studio is yours to shape.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Sign in to manage your private listings. Each designer sees only records owned by their account.</p><button type="button" onClick={() => void auth.signinRedirect()} className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground">Sign in or create account</button></div>;
  }

  if (auth.isAuthenticated && studioAccess === 'checking') {
    return <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 text-center"><h1 className="font-serif text-4xl">Opening your account…</h1><p className="mt-3 text-sm text-muted-foreground">Checking for your House of Briar designer profile.</p></div>;
  }

  if (auth.isAuthenticated && studioAccess === 'signup') {
    return <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 text-center"><h1 className="font-serif text-4xl">Become a House of Briar designer.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">All independent designers are welcome. Complete Designer Sign Up to create your studio, then return here with the same verified email.</p><Link to="/sell" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground">Designer Sign Up</Link><button type="button" onClick={() => void auth.signoutRedirect()} className="ml-3 mt-7 min-h-12 rounded-full border border-border px-5 text-sm text-muted-foreground">Sign out</button></div>;
  }

  const saveListing = async (event: FormEvent) => {
    event.preventDefault(); setMessage('');
    if (!sellerToken || !name.trim() || !price.trim()) { setMessage('Add a name and price before saving.'); return; }
    setIsSaving(true);
    try {
      const response=await fetch(editingId?`/api/listings/${editingId}`:'/api/listings',{method:editingId?'PUT':'POST',headers:{Authorization:`Bearer ${sellerToken}`,'Content-Type':'application/json'},body:JSON.stringify({title:name.trim(),price:Number(price),category,description:description.trim()})});
      const data=await response.json().catch(()=>({})); if(!response.ok)throw new Error(data?.error?.message||'Your listing could not be saved.');
      const listingId=data.item.id;
      for(const photo of photos){if(!photo.file)continue;const body=new FormData();body.append('image',photo.file);body.append('clientImageKey',`studio-${listingId}-${photo.key}`);const upload=await fetch(`/api/listings/${listingId}/images`,{method:'POST',headers:{Authorization:`Bearer ${sellerToken}`,'Idempotency-Key':`studio-${listingId}-${photo.key}`},body});const uploaded=await upload.json().catch(()=>({}));if(!upload.ok)throw new Error(uploaded?.error?.message||'A listing image could not be uploaded.');}
      await refreshProducts(); resetListingForm(); setMessage('Draft saved. Submit it for review when it is ready.');
    } catch(error){setMessage(error instanceof Error?error.message:'Your listing could not be saved.');} finally{setIsSaving(false);}
  };

  const submitForReview = async (product: StudioListing) => {
    setMessage('');
    try { const response=await fetch(`/api/listings/${product.id}/submit`,{method:'POST',headers:{Authorization:`Bearer ${sellerToken}`,'Content-Type':'application/json'},body:JSON.stringify({marketplaceRulesAccepted:rulesAccepted[product.id]===true})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error?.message||'This listing could not be submitted.');await refreshProducts();setMessage(data.item.status==='published'?'Listing published.':'Listing submitted for review.'); }
    catch(error){setMessage(error instanceof Error?error.message:'This listing could not be submitted.');}
  };

  const submitTracking = async (orderId: string) => {
    const draft = trackingDrafts[orderId];
    if (!draft?.carrier.trim() || !draft?.trackingNumber.trim()) { setOrderMessage('Add the carrier and tracking number first.'); return; }
    setOrderMessage('Checking tracking with the carrier…');
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/tracking`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sellerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 202) throw new Error(data?.error?.message || 'Tracking could not be saved.');
      setOrderMessage(response.status === 202 ? 'Tracking saved. Payout remains held until the carrier verifies it.' : 'Tracking verified. Your payout is being released.');
      await refreshOrders();
    } catch (error) { setOrderMessage(error instanceof Error ? error.message : 'Tracking could not be saved.'); }
  };

  const isEditing = editingId !== null;
  return <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8"><div className="flex flex-col justify-between gap-5 border-b border-border pb-8 md:flex-row md:items-end"><div><Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"><ArrowLeft size={16} /> Home</Link><p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-primary">Designer Studio</p><h1 className="mt-3 font-serif text-5xl">Make your corner of the briar.</h1><p className="mt-3 text-sm text-muted-foreground">Signed in as {designerEmail}</p></div><button type="button" onClick={() => void auth.signoutRedirect()} className="min-h-11 rounded-full border border-border px-4 text-sm text-muted-foreground">Sign out</button></div>{loadError&&<p role="alert" className="mt-5 text-sm text-destructive">{loadError}</p>}<div className="mt-10 grid gap-8 lg:grid-cols-[.8fr_1.2fr]"><form onSubmit={(event)=>void saveListing(event)} className="rounded-3xl border border-border bg-card p-6"><h2 className="font-serif text-2xl">{editingId?'Edit listing':'Create listing'}</h2><div className="mt-6 space-y-5"><label className="block text-sm font-medium">Piece name<input value={name} onChange={e=>setName(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"/></label><label className="block text-sm font-medium">Price<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"/></label><label className="block text-sm font-medium">Category<select value={category} onChange={e=>setCategory(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3">{MARKET_CATEGORIES.map(item=><option key={item}>{item}</option>)}</select></label><StudioPhotoPicker photos={photos} setPhotos={setPhotos}/><label className="block text-sm font-medium">Description<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3"/></label></div>{message&&<p role="status" className="mt-4 text-sm text-primary">{message}</p>}<div className="mt-6 flex gap-3"><button type="submit" disabled={isSaving} className="min-h-12 flex-1 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"><Save size={17} className="mr-2 inline"/>{isSaving?'Saving…':'Save draft'}</button>{editingId&&<button type="button" onClick={resetListingForm} className="min-h-12 rounded-full border border-border px-4 text-sm">Cancel</button>}</div></form><section className="rounded-3xl border border-border bg-card p-6"><h2 className="font-serif text-2xl">Your listings</h2><p className="mt-1 text-sm text-muted-foreground">Drafts stay private. Submit finished pieces for marketplace review.</p><div className="mt-6 divide-y divide-border">{products.map(product=><div key={product.id} className="py-5"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="font-medium">{product.title}</p><p className="mt-1 text-sm text-muted-foreground">${product.price.toFixed(2)} · {product.category} · {product.status.replaceAll('_',' ')}</p><p className="mt-1 text-xs uppercase tracking-wide text-primary">Moderation: {product.moderationStatus}</p>{product.moderationReason&&<p className="mt-2 text-sm text-destructive">Changes requested: {product.moderationReason}</p>}</div><div className="flex flex-wrap gap-2">{['draft','rejected'].includes(product.status)&&<div className="w-full sm:w-auto"><label className="mb-2 flex max-w-md items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={rulesAccepted[product.id]??false} onChange={e=>setRulesAccepted(v=>({...v,[product.id]:e.target.checked}))} className="mt-0.5"/>I confirm this listing is my original or independently designed work and does not contain prohibited, counterfeit, stolen, dangerous, illegal, or rights-infringing items.</label><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>beginEdit(product)} className="min-h-11 rounded-full border border-border px-4 text-xs"><Pencil size={14} className="mr-1 inline"/>Edit</button><button type="button" disabled={!rulesAccepted[product.id]} onClick={()=>void submitForReview(product)} className="min-h-11 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">Submit for review</button></div></div>}</div></div></div>)}</div><div className="mt-6 rounded-2xl bg-accent/50 p-4 text-sm text-muted-foreground"><strong className="text-foreground">Payouts:</strong> {payoutStatus?.payoutsEnabled?'Your Stripe payouts are ready.':payoutStatus?.connected?'Finish Stripe verification before payouts can be released.':'Set up Stripe payouts to receive your designer earnings.'}{payoutMessage&&<span className="mt-2 block text-primary">{payoutMessage}</span>}{!payoutStatus?.payoutsEnabled&&<button type="button" onClick={()=>void startPayoutSetup()} disabled={payoutLoading} className="mt-4 min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">{payoutLoading?'Opening Stripe…':payoutStatus?.connected?'Continue payout setup':'Set up payouts'}</button>}</div></section></div>
  <section className="mt-8 rounded-3xl border border-border bg-card p-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Orders & payouts</p><h2 className="mt-2 font-serif text-3xl">Sold pieces</h2><p className="mt-2 text-sm text-muted-foreground">Your earnings stay held until shipment tracking is verified.</p></div><span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-primary">{orders.length} orders</span></div>
    {orderMessage && <p role="status" className="mt-5 rounded-2xl bg-accent/50 px-4 py-3 text-sm text-primary">{orderMessage}</p>}
    <div className="mt-6 space-y-4">{orders.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No paid orders yet.</p> : orders.map((order) => <article key={order.id} className="rounded-2xl border border-border p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Order {order.id.slice(0, 8)}</p><h3 className="mt-1 font-serif text-xl">{order.items.map((item) => item.title).join(', ')}</h3><p className="mt-1 text-sm text-muted-foreground">{order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)</p></div><div className="sm:text-right"><p className="font-semibold">${(order.earningsCents / 100).toFixed(2)} earnings</p><p className="mt-1 text-xs uppercase tracking-wide text-primary">{order.fulfillmentStatus.replaceAll('_', ' ')}</p></div></div>
      {order.trackingNumber ? <div className="mt-4 rounded-xl bg-accent/40 p-3 text-sm"><strong>{order.trackingCarrier}</strong> · {order.trackingNumber}<span className="ml-2 text-muted-foreground">({order.trackingStatus || 'checking'})</span></div> : <div className="mt-4 grid gap-3 sm:grid-cols-[.7fr_1.3fr_auto]"><input aria-label="Shipping carrier" placeholder="USPS, UPS, FedEx…" value={trackingDrafts[order.id]?.carrier ?? ''} onChange={(e) => setTrackingDrafts((d) => ({...d,[order.id]:{carrier:e.target.value,trackingNumber:d[order.id]?.trackingNumber ?? ''}}))} className="min-h-11 rounded-xl border border-border bg-background px-3"/><input aria-label="Tracking number" placeholder="Tracking number" value={trackingDrafts[order.id]?.trackingNumber ?? ''} onChange={(e) => setTrackingDrafts((d) => ({...d,[order.id]:{carrier:d[order.id]?.carrier ?? '',trackingNumber:e.target.value}}))} className="min-h-11 rounded-xl border border-border bg-background px-3"/><button type="button" onClick={() => void submitTracking(order.id)} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">Add tracking</button></div>}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm"><span className="text-muted-foreground">Payout</span><span className="font-medium">{order.payoutStatus === 'paid' ? 'Released' : 'Held pending verified shipment'}</span></div>
    </article>)}</div>
  </section></div>;
}

export default function AccountPage() {
  return <HouseShell><StudioContent /></HouseShell>;
}
