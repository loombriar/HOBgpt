import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { ArrowLeft, Heart, Ruler, Share2, ShoppingBag, Sparkles } from '@/lib/icons';
import { Link, useParams } from 'react-router-dom';
import { getFieldNumber, getFieldValue, getTitle, type GenesisNode } from '@/lib/genesis-data';
import HouseShell from '@/components/HouseShell';
import InquiryForm from '@/components/InquiryForm';
import ProductInquiryForm from '@/components/ProductInquiryForm';
import CollectorNotes from '@/components/CollectorNotes';
import { getCatalogProducts, getSavedProductIds, getPersistentFavoriteIds, getProductImages, getProductVisual, money, setPersistentFavorite, slugify } from '@/lib/marketplace';
import { trackCommerceEvent } from '@/lib/analytics';

export default function ProductPage() {
  const auth = useAuth();
  const { productId } = useParams();
  const [product, setProduct] = useState<GenesisNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [inCart, setInCart] = useState(false);
  const [catalog, setCatalog] = useState<GenesisNode[]>([]);

  useEffect(() => {
    setActiveImageIndex(0);
    setLoading(true);
    void getCatalogProducts(auth.isAuthenticated)
      .then((items) => {
        setCatalog(items);
        setProduct(items.find((item) => item.id === productId || slugify(getTitle(item, 'Name') ?? '') === productId) ?? null);
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [productId, auth.isAuthenticated]);

  const resolvedProductId = product?.id;

  useEffect(() => {
    if (!resolvedProductId) return;
    setSaved(getSavedProductIds().includes(resolvedProductId));
    void getPersistentFavoriteIds(auth.user?.access_token).then(ids=>setSaved(ids.includes(resolvedProductId))).catch(()=>{});
    const refreshSaved = () => setSaved(getSavedProductIds().includes(resolvedProductId));
    window.addEventListener('house-of-briar-saved-products', refreshSaved);
    return () => window.removeEventListener('house-of-briar-saved-products', refreshSaved);
  }, [resolvedProductId, auth.user?.access_token]);

  useEffect(() => {
    const refreshCart = () => {
      try {
        const value = JSON.parse(window.localStorage.getItem('house-of-briar:cart') ?? '[]');
        setInCart(Array.isArray(value) && Boolean(resolvedProductId) && value.includes(resolvedProductId));
      } catch { setInCart(false); }
    };
    refreshCart();
    window.addEventListener('house-of-briar-cart', refreshCart);
    return () => window.removeEventListener('house-of-briar-cart', refreshCart);
  }, [resolvedProductId]);

  if (loading) {
    return <HouseShell><section className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:px-8"><div className="aspect-[4/5] animate-pulse rounded-[2rem] bg-muted" /><div className="space-y-5 py-8"><div className="h-4 w-28 animate-pulse rounded-full bg-muted" /><div className="h-16 w-4/5 animate-pulse rounded-2xl bg-muted" /><div className="h-5 w-1/3 animate-pulse rounded-full bg-muted" /><div className="h-24 w-full animate-pulse rounded-2xl bg-muted" /><div className="h-12 w-full animate-pulse rounded-full bg-muted" /></div></section></HouseShell>;
  }

  if (!product) {
    return <HouseShell><div className="mx-auto max-w-3xl px-4 py-24 text-center"><p className="font-serif text-3xl">This piece is still finding its way here.</p><Link to="/shop" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">Back to collection</Link></div></HouseShell>;
  }

  const name = getTitle(product, 'Name') ?? 'Untitled piece';
  const designer = getFieldValue(product, '@desig', 'Designer') ?? 'Independent designer';
  const designerId = getFieldValue(product, '@desid', 'Designer ID') ?? '';
  const availability = getFieldValue(product, '@statx', 'Status') ?? 'Available';
  const isAvailable = availability === 'Available';
  const description = getFieldValue(product, '@descr', 'Description') ?? 'A one-of-a-kind piece made with intention.';
  const category = getFieldValue(product, '@categ', 'Category') ?? 'One-of-a-kind';
  const size = getFieldValue(product, '@sizex', 'Size') ?? 'Made to order';
  const tags = getFieldValue(product, '@tagsx', 'Tags') ?? 'Made with intention';
  const images = getProductImages(getFieldValue(product, '@image', 'Image URL'), getFieldValue(product, '@gally', 'Gallery URLs'));
  const primaryImage = images[activeImageIndex] ?? images[0];
  const hasGallery = images.length > 1;
  const price = getFieldNumber(product, '@price', 'Price') ?? 0;
  const seoTitle = getFieldValue(product, '@seotl', 'SEO Title') || `${name} by ${designer}`;
  const seoDescription = getFieldValue(product, '@seods', 'SEO Description') || description;
  const shareImage = getFieldValue(product, '@share', 'Share Image') || primaryImage || '';
  const shippingCostCents = Number(getFieldValue(product, '@shipc', 'Shipping Cost') || NaN);
  const freeShippingThresholdCents = Number(getFieldValue(product, '@shipf', 'Free Shipping Threshold') || NaN);
  const handlingMin = Number(getFieldValue(product, '@handl', 'Handling Min') || NaN);
  const handlingMax = Number(getFieldValue(product, '@handx', 'Handling Max') || NaN);
  const internationalShipping = getFieldValue(product, '@intl', 'International Shipping') === 'yes';

  useEffect(() => {
    trackCommerceEvent({ event: 'view_product', listingId: product.id, listingName: name, designer, value: price, currency: 'USD' });
    try { const old=JSON.parse(window.localStorage.getItem('house-of-briar:recently-viewed')??'[]'); const ids=Array.isArray(old)?old.filter((id):id is string=>typeof id==='string'&&id!==product.id):[]; window.localStorage.setItem('house-of-briar:recently-viewed',JSON.stringify([product.id,...ids].slice(0,12))); } catch {}
    document.title = `${seoTitle} | House of Briar`;
    const setMeta=(selector:string,attribute:string,value:string)=>document.querySelector(selector)?.setAttribute(attribute,value);
    setMeta('meta[name="description"]','content',seoDescription.slice(0,180));
    setMeta('meta[property="og:title"]','content',seoTitle);
    setMeta('meta[property="og:description"]','content',seoDescription.slice(0,180));
    setMeta('meta[property="og:url"]','content',window.location.href);
    if(shareImage)setMeta('meta[property="og:image"]','content',shareImage);
    setMeta('meta[name="twitter:title"]','content',seoTitle);
    setMeta('meta[name="twitter:description"]','content',seoDescription.slice(0,180));
    if(shareImage)setMeta('meta[name="twitter:image"]','content',shareImage);
    return () => { document.title = 'House of Briar'; };
  }, [product.id, name, designer, price, seoTitle, seoDescription, shareImage]);

  const productTags = tags.toLowerCase().split(/[,|]/).map(v=>v.trim()).filter(Boolean);
  const recommendations = catalog.filter(item=>item.id!==product.id && (getFieldValue(item,'@statx','Status')??'Available')==='Available').map(item=>{
    const itemTags=(getFieldValue(item,'@tagsx','Tags')??'').toLowerCase().split(/[,|]/).map(v=>v.trim()).filter(Boolean);
    const itemCategory=getFieldValue(item,'@categ','Category')??'';
    const itemStyle=getFieldValue(item,'@style','Style')??'';
    const style=getFieldValue(product,'@style','Style')??'';
    const sharedTags=itemTags.filter(t=>productTags.includes(t)).length;
    const score=sharedTags*4+(itemCategory===category?3:0)+(style&&itemStyle===style?3:0)+(getFieldValue(item,'@desig','Designer')===designer?1:0);
    return {item,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,4).map(x=>x.item);
  let recentIds:string[]=[];
  try { recentIds=JSON.parse(window.localStorage.getItem('house-of-briar:recently-viewed')??'[]'); if(!Array.isArray(recentIds))recentIds=[]; } catch {}
  const recentlyViewed=recentIds.filter(id=>id!==product.id).map(id=>catalog.find(item=>item.id===id)).filter((item):item is GenesisNode=>Boolean(item)).slice(0,4);
  const RecommendationCard=({item}:{item:GenesisNode})=>{const itemName=getTitle(item,'Name')??'Untitled piece';const itemImage=getProductImages(getFieldValue(item,'@image','Image URL'),getFieldValue(item,'@gally','Gallery URLs'))[0];return <Link to={`/shop/${item.id}`} className="group block"><div className="aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-muted">{itemImage?<img src={itemImage} alt={itemName} className="size-full object-cover transition duration-300 group-hover:scale-105"/>:null}</div><p className="mt-3 font-serif text-xl">{itemName}</p><p className="mt-1 text-sm text-muted-foreground">{money.format(getFieldNumber(item,'@price','Price')??0)}</p></Link>};

  const addToCart = () => {
    const raw = window.localStorage.getItem('house-of-briar:cart');
    const items: string[] = raw ? JSON.parse(raw) : [];
    if (!items.includes(product.id)) items.push(product.id);
    window.localStorage.setItem('house-of-briar:cart', JSON.stringify(items));
    setInCart(true);
    window.dispatchEvent(new Event('house-of-briar-cart'));
    trackCommerceEvent({ event: 'add_to_cart', listingId: product.id, listingName: name, designer, value: price, currency: 'USD', itemCount: items.length });
  };

  const shareListing = async () => {
    const url=window.location.href;
    try { if(navigator.share) await navigator.share({title:name,text:`${name} by ${designer} on House of Briar`,url}); else { await navigator.clipboard.writeText(url); window.alert('Listing link copied.'); } } catch (error) { if((error as Error)?.name!=='AbortError') window.alert('Copy this listing URL from your browser to share it.'); }
  };

  const toggleSaved = () => {
    const next=!saved;
    setSaved(next);
    trackCommerceEvent({ event: next ? 'add_to_wishlist' : 'remove_from_wishlist', listingId: product.id, listingName: name, designer, value: price, currency: 'USD' });
    void setPersistentFavorite(product.id,next,auth.user?.access_token).catch(()=>setSaved(!next));
  };

  return <HouseShell>
    <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.05fr_.95fr] lg:px-8">
      <div>
        <div className={`relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-gradient-to-br ${getProductVisual(name)} p-3 shadow-2xl sm:p-7`}>
          {primaryImage ? <img src={primaryImage} alt={`${name} by ${designer}`} className="size-full rounded-[1.5rem] object-cover" /> : <div className="flex h-full items-end rounded-[1.5rem] border border-primary-foreground/20 bg-background/10 p-6 backdrop-blur-sm"><span className="rounded-full border border-primary-foreground/20 bg-background/15 px-3 py-1 text-xs uppercase tracking-[0.18em] text-primary-foreground">{category}</span></div>}
          <div className="absolute left-7 top-7 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-background/20 px-3 py-2 text-xs uppercase tracking-[0.16em] text-primary-foreground backdrop-blur"><Sparkles size={14} /> One of one</div>
        </div>
        {hasGallery && <div className="mt-3 grid grid-cols-3 gap-3">{images.map((image, index) => <button key={image} type="button" onClick={() => setActiveImageIndex(index)} aria-label={`Show ${name} photo ${index + 1}`} aria-pressed={activeImageIndex === index} className="min-h-11 min-w-11 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><img src={image} alt={`${name} view ${index + 1}`} className={`aspect-square w-full rounded-xl border object-cover ${activeImageIndex === index ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`} /></button>)}</div>}
      </div>
      <div className="flex flex-col justify-center">
        <Link to="/shop" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"><ArrowLeft size={16} /> Back to collection</Link>
        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.24em] text-primary">{designerId ? <Link to={`/designers/${encodeURIComponent(designerId)}`} className="hover:underline">{designer}</Link> : designer}</p>
        <h1 className="mt-3 font-serif text-5xl leading-none sm:text-6xl">{name}</h1>
        <div className="mt-6 flex flex-wrap items-center gap-4"><span className="text-2xl font-semibold tabular-nums">{money.format(price)}</span><span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm text-accent-foreground"><Ruler size={15} /> {size}</span></div>
        <p className="mt-7 max-w-xl text-base leading-8 text-muted-foreground">{description}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">{inCart ? <Link to="/cart" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"><ShoppingBag size={17} /> In your bag · View bag</Link> : <button type="button" onClick={addToCart} disabled={!isAvailable} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"><ShoppingBag size={17} /> {isAvailable ? 'Add one-of-one piece' : 'Currently unavailable'}</button>}<button type="button" onClick={toggleSaved} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border px-6 text-sm font-medium transition hover:border-primary hover:text-primary ${saved ? 'text-primary' : ''}`}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save piece'}</button><button type="button" onClick={()=>void shareListing()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border px-6 text-sm font-medium transition hover:border-primary hover:text-primary"><Share2 size={17}/> Share</button></div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{isAvailable ? 'This is a one-of-one piece. Adding it to your bag does not reserve it; availability is confirmed when secure checkout begins.' : 'This piece is no longer available for checkout.'}</p><div className="mt-8 rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2 text-sm font-semibold"><ShoppingBag size={16}/> Shipping &amp; delivery</div><p className="mt-3 text-sm leading-6 text-muted-foreground">{Number.isFinite(shippingCostCents)?shippingCostCents===0?'Free shipping for this piece':`Shipping: ${money.format(shippingCostCents/100)}`:'Exact shipping options and cost are shown before payment.'}{Number.isFinite(freeShippingThresholdCents)&&freeShippingThresholdCents>0?` Free shipping applies when the qualifying order reaches ${money.format(freeShippingThresholdCents/100)}.`:''}</p>{Number.isFinite(handlingMin)&&<p className="mt-2 text-sm text-muted-foreground">Designer handling time: {handlingMin}{Number.isFinite(handlingMax)&&handlingMax!==handlingMin?`–${handlingMax}`:''} business day{handlingMax===1?'':'s'} before carrier transit.</p>}<p className="mt-2 text-xs text-muted-foreground">{internationalShipping?'International delivery is available for this piece; destination duties or import charges may apply.':'International delivery is not currently offered for this piece.'}</p><a href="/shipping.html" className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">Full shipping policy</a></div><dl className="mt-12 grid grid-cols-2 gap-5 border-t border-border pt-6 text-sm"><div><dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Category</dt><dd className="mt-2">{category}</dd></div><div><dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Availability</dt><dd className="mt-2 text-primary">{availability}</dd></div><div className="col-span-2"><dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Tags</dt><dd className="mt-2 leading-6">{tags}</dd></div></dl>
      </div>
    </section>
    {(recommendations.length>0||recentlyViewed.length>0)&&<section className="border-t border-border"><div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">{recommendations.length>0&&<div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Complete the story</p><h2 className="mt-3 font-serif text-4xl">Pieces that belong nearby.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Chosen from shared style, category, and collection details rather than a generic product list.</p><div className="mt-7 grid gap-5 grid-cols-2 lg:grid-cols-4">{recommendations.map(item=><RecommendationCard key={item.id} item={item}/>)}</div></div>}{recentlyViewed.length>0&&<div className={recommendations.length?'mt-14':''}><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Recently wandered</p><h2 className="mt-3 font-serif text-3xl">Pieces you passed along the way.</h2><div className="mt-7 grid gap-5 grid-cols-2 lg:grid-cols-4">{recentlyViewed.map(item=><RecommendationCard key={item.id} item={item}/>)}</div></div>}</div></section>}
    <section className="border-t border-border"><div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8"><ProductInquiryForm productId={product.id} productName={name} designerName={designer}/></div></section>\n    <section className="border-t border-border"><div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8"><CollectorNotes listingId={product.id}/></div></section>\n    <section className="border-t border-border bg-accent/20"><div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[.8fr_1.2fr] lg:px-8"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Made for your measurements</p><h2 className="mt-3 font-serif text-4xl">Request custom sizing.</h2><p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">Send your measurements and an item-specific customization request directly to the designer. This is a structured request, not an open conversation.</p></div><InquiryForm productName={name} productId={product.id} designerName={designer} /></div></section>
  </HouseShell>;
}
