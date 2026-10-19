import taxonomy from '../../../../shared/taxonomy.json';
import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Link, useSearchParams } from 'react-router-dom';
import { Heart, Search, SlidersHorizontal } from '@/lib/icons';
import { getFieldNumber, getFieldValue, getTitle, type GenesisNode } from '@/lib/genesis-data';
import HouseShell from '@/components/HouseShell';
import VisualSearch from '@/components/VisualSearch';
import { MARKET_STYLES, getCatalogProducts, getSavedProductIds, getPersistentFavoriteIds, isPublicProduct, getProductImages, getProductVisual, money, setPersistentFavorite } from '@/lib/marketplace';
import { trackCommerceEvent } from '@/lib/analytics';

const GARMENT_SUBCATEGORIES=taxonomy.clothingTypes.map(item=>item.value);
const ACCESSORY_SUBCATEGORIES=taxonomy.accessoryTypes.map(item=>item.value);
const TYPE_LABELS=Object.fromEntries([...taxonomy.clothingTypes,...taxonomy.accessoryTypes,...taxonomy.patternTypes].map(item=>[item.value,item.label]));
const CATEGORY_LABELS:Record<string,string>={apparel:'Clothing',accessories:'Accessories',patterns:'Sewing Patterns'};
const categoryMatches=(group:string,value:string,garment:string)=>group==='All pieces'||(group==='apparel'?['apparel','menswear','womenswear','unisex','costumes'].includes(value.toLowerCase())||GARMENT_SUBCATEGORIES.includes(garment):value.toLowerCase()===group.toLowerCase());

const LIKED_PRODUCTS_KEY = 'house-of-briar:liked-products';
const PRICE_RANGES = [
  { value: 'all-prices', label: 'All prices' },
  { value: 'under-200', label: 'Under $200' },
  { value: '200-299', label: '$200 - $299' },
  { value: '300-499', label: '$300 - $499' },
  { value: '500-plus', label: '$500 and above' },
] as const;

const SEARCH_SYNONYMS: Record<string, string[]> = {
  scissors: ['shears','sheers','snips'], shears: ['scissors','sheers','snips'], antique: ['vintage','heritage','old'], vintage: ['antique','heritage'],
  bag: ['purse','handbag','tote','suitcase'], purse: ['bag','handbag'], jewelry: ['jewellery','accessory','accessories'], jewellery: ['jewelry','accessory'],
  floral: ['flower','flowers','botanical'], flower: ['floral','botanical'], woodland: ['forest','moss','cottagecore'], forest: ['woodland','moss'],
  scent: ['fragrance','perfume','aroma'], fragrance: ['scent','perfume','aroma'], pina: ['pineapple'], colada: ['coconut','tropical'],
  purple: ['violet','lavender','plum'], green: ['moss','sage','emerald'], handmade: ['handcrafted','artisan'], handcrafted: ['handmade','artisan'],
};
const normalizeSearch=(value:string)=>value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const editDistance=(a:string,b:string)=>{const dp=Array.from({length:a.length+1},(_,i)=>i);for(let j=1;j<=b.length;j++){let prev=dp[0];dp[0]=j;for(let i=1;i<=a.length;i++){const hold=dp[i];dp[i]=Math.min(dp[i]+1,dp[i-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=hold;}}return dp[a.length];};
function searchMatches(query:string, fields:string[]) {
  const q=normalizeSearch(query); if(!q)return true;
  const hay=normalizeSearch(fields.join(' ')); const words=Array.from(new Set(hay.split(' ').filter(Boolean)));
  return q.split(' ').filter(Boolean).every(token=>{
    const variants=[token,...(SEARCH_SYNONYMS[token]??[])];
    return variants.some(v=>hay.includes(v)||words.some(w=>w.startsWith(v)||v.startsWith(w)||(v.length>=4&&w.length>=4&&editDistance(v,w)<=Math.max(1,Math.floor(Math.min(v.length,w.length)/5)))));
  });
}

function matchesPriceRange(price: number, range: string) {
  if (range === 'under-200') return price < 200;
  if (range === '200-299') return price >= 200 && price < 300;
  if (range === '300-499') return price >= 300 && price < 500;
  if (range === '500-plus') return price >= 500;
  return true;
}

function getLikedProductIds() {
  const raw = window.localStorage.getItem(LIKED_PRODUCTS_KEY);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function setLikedProductIds(ids: string[]) {
  window.localStorage.setItem(LIKED_PRODUCTS_KEY, JSON.stringify(Array.from(new Set(ids))));
}

type ProductCardProps = {
  product: GenesisNode;
  onLike: (productId: string) => void;
  liked: boolean;
  saved: boolean;
  onSave: (productId: string) => void;
};

function ProductCard({ product, onLike, liked, saved, onSave }: ProductCardProps) {
  const name = getTitle(product, 'Name') ?? 'Untitled piece';
  const price = getFieldNumber(product, '@price', 'Price') ?? 0;
  const category = getFieldValue(product, '@categ', 'Category') ?? 'One-of-a-kind';
  const designer = getFieldValue(product, '@desig', 'Designer') ?? 'Independent designer';
  const designerId = getFieldValue(product, '@desid', 'Designer ID') ?? '';
  const status = getFieldValue(product, '@statx', 'Status') ?? 'Available';
  const stockLabel = status === 'Sold Out' ? 'Sold' : status === 'Temporarily Unavailable' ? 'Unavailable' : '';
  const likes = (getFieldNumber(product, '@likes', 'Likes') ?? 0) + (liked ? 1 : 0);
  const images = getProductImages(getFieldValue(product, '@image', 'Image URL'), getFieldValue(product, '@gally', 'Gallery URLs'));
  const primaryImage = images[0];
  const hasMultipleImages = images.length > 1;
  return (
    <article className="house-product-card group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <Link to={`/shop/${product.id}`} aria-label={`View ${name} photos and details`} className={`house-card-photo relative flex aspect-[4/5] items-end overflow-hidden bg-gradient-to-br ${getProductVisual(name)} p-5`}>
        {primaryImage ? <img src={primaryImage} alt={`${name} by ${designer}`} loading="lazy" decoding="async" className="absolute inset-0 size-full object-contain transition duration-500 group-hover:scale-105" /> : <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_25%_25%,hsl(var(--primary-foreground)/.4),transparent_34%),linear-gradient(135deg,transparent_55%,hsl(var(--background)/.22))]" aria-hidden="true" />}
        {hasMultipleImages && <span className="house-card-photo-count">{images.length} photos</span>}
        {stockLabel && <span className="house-card-stock">{stockLabel}</span>}

      </Link>
      <div className="house-card-info space-y-3 p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-serif text-xl font-semibold"><Link to={`/shop/${product.id}`} className="hover:underline">{name}</Link></h2><p className="mt-1 text-sm text-muted-foreground">by {designerId ? <Link to={`/designers/${encodeURIComponent(designerId)}`} onClick={(event) => event.stopPropagation()} className="hover:text-primary hover:underline">{designer}</Link> : designer}</p></div></div>
        <p className="house-card-price text-base font-semibold tabular-nums">{money.format(price)}</p>
        <p className="house-card-size text-sm text-muted-foreground">{getFieldValue(product, '@sizex', 'Size') ?? 'See measurements'}</p>
        <p className="house-card-type text-xs text-muted-foreground">{CATEGORY_LABELS[category] || category}</p>
        <div className="house-card-actions flex items-center justify-between border-t border-border pt-3"><div className="flex items-center gap-1"><button type="button" aria-label={`${saved ? 'Remove' : 'Save'} ${name}`} onClick={() => onSave(product.id)} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs transition hover:bg-accent hover:text-primary ${saved ? 'text-primary' : 'text-muted-foreground'}`}><Heart size={15} fill={saved ? 'currentColor' : 'none'} />{saved ? 'Saved' : 'Save'}</button><button type="button" aria-label={`${liked ? 'Unlike' : 'Like'} ${name}`} onClick={() => onLike(product.id)} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs transition hover:bg-accent hover:text-primary ${liked ? 'text-primary' : 'text-muted-foreground'}`}><Heart size={15} fill={liked ? 'currentColor' : 'none'} />{likes}</button></div></div>
      </div>
    </article>
  );
}

export default function ShopPage() {
  const auth = useAuth();
  const [products, setProducts] = useState<GenesisNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All pieces');
  const [priceRange, setPriceRange] = useState('all-prices');
  const [sort, setSort] = useState('newest');
  const [style, setStyle] = useState('All styles');
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const savedOnly = searchParams.get('saved') === 'true' || searchParams.get('liked') === 'true';
  const subcategory=searchParams.get('subcategory')??'All subcategories';
  const subcategories=category==='patterns'?taxonomy.patternTypes.map(x=>x.value):category==='accessories'?ACCESSORY_SUBCATEGORIES:category==='All pieces'?[...GARMENT_SUBCATEGORIES,...ACCESSORY_SUBCATEGORIES,...taxonomy.patternTypes.map(x=>x.value)]:GARMENT_SUBCATEGORIES;
  const designerFilter = searchParams.get('designer') ?? 'All designers';
  useEffect(() => { setQuery(searchParams.get('q') ?? ''); setCategory(searchParams.get('category') ?? 'All pieces'); setPriceRange(searchParams.get('price') ?? 'all-prices'); setSort(searchParams.get('sort') ?? 'newest'); setStyle(searchParams.get('style') ?? 'All styles'); }, [searchParams]);
  const updateFilter = (key: string, value: string, defaultValue: string) => { const next = new URLSearchParams(searchParams); if (!value || value === defaultValue) next.delete(key); else next.set(key, value); setSearchParams(next, { replace: true }); };
  useEffect(() => { void getCatalogProducts(auth.isAuthenticated).then(items => { setProducts(items); setCatalogError(''); }).catch(() => { setProducts([]); setCatalogError('The collection could not load. Please try again.'); }).finally(() => setLoading(false)); setSavedIds(getSavedProductIds()); setLikedIds(getLikedProductIds()); void getPersistentFavoriteIds(auth.user?.access_token).then(setSavedIds).catch(()=>{}); }, [auth.isAuthenticated, auth.user?.access_token]);
  useEffect(() => {
    const refreshSaved = () => setSavedIds(getSavedProductIds());
    window.addEventListener('house-of-briar-saved-products', refreshSaved);
    return () => window.removeEventListener('house-of-briar-saved-products', refreshSaved);
  }, []);
  const categories = ['All pieces', ...taxonomy.departments.map(item=>item.value)];
  const presentation=searchParams.get('presentation')||'all', pattern=searchParams.get('pattern')||'all', availability=searchParams.get('availability')||'all';
  const availabilityMatches=(item:GenesisNode,value:string)=>value==='all'||(value==='Made in Multiple'?['Made in Multiple','Limited Quantity','Made to Order'].includes(getFieldValue(item,'@ptype','Production Type')||''):getFieldValue(item,'@ptype','Production Type')===value);
  const count=(field:string,value:string)=>products.filter(item=>(getFieldValue(item,field,'')||'')===value).length;

  const visible = products.filter((product) => {
    if ((!isPublicProduct(product) && getFieldValue(product,'@statx','Status') !== 'Sold Out') || (savedOnly && !savedIds.includes(product.id))) return false;
    const name = getTitle(product, 'Name') ?? '';
    const tags = getFieldValue(product, '@tagsx', 'Tags') ?? '';
    const productDesigner = getFieldValue(product, '@desig', 'Designer') ?? 'Independent designer';
    const price = getFieldNumber(product, '@price', 'Price') ?? 0;
    const description = getFieldValue(product, '@descr', 'Description') ?? ''; const material = getFieldValue(product, '@mater', 'Material') ?? ''; const productStyleForSearch = getFieldValue(product, '@style', 'Style') ?? ''; const productCategoryForSearch = getFieldValue(product, '@categ', 'Category') ?? ''; const matchesQuery = searchMatches(query, [name, tags, productDesigner, description, material, productStyleForSearch, productCategoryForSearch]);
    const matchesCategory = categoryMatches(category,getFieldValue(product,'@categ','Category')??'',productStyleForSearch);
    const matchesSubcategory=subcategory==='All subcategories'||productStyleForSearch===subcategory;
    const matchesDesigner = designerFilter === 'All designers' || productDesigner === designerFilter;
    const productStyle = getFieldValue(product, '@style', 'Style') ?? '';
    const matchesStyle = style === 'All styles' || (getFieldValue(product,'@aesth','Aesthetic')||productStyle) === style;
    const matchesPrice = matchesPriceRange(price, priceRange);
    return matchesQuery && matchesCategory && matchesSubcategory && matchesDesigner && matchesStyle && matchesPrice && (presentation==='all'||getFieldValue(product,'@presn','Presentation')===presentation) && (pattern==='all'||getFieldValue(product,'@patrn','Pattern')===pattern) && availabilityMatches(product,availability);
  }).sort((a, b) => { const aPrice=getFieldNumber(a,'@price','Price')??0; const bPrice=getFieldNumber(b,'@price','Price')??0; const aName=getTitle(a,'Name')??''; const bName=getTitle(b,'Name')??''; if(sort==='price-low')return aPrice-bPrice; if(sort==='price-high')return bPrice-aPrice; if(sort==='name')return aName.localeCompare(bName); return 0; });
  const handleSave = (productId: string) => {
    const shouldSave=!savedIds.includes(productId);
    const previous=savedIds;
    setSavedIds(shouldSave?[...savedIds,productId]:savedIds.filter(id=>id!==productId));
    void setPersistentFavorite(productId,shouldSave,auth.user?.access_token).catch(()=>setSavedIds(previous));
  };
  const handleLike = (productId: string) => {
    const next = likedIds.includes(productId) ? likedIds.filter((id) => id !== productId) : [...likedIds, productId];
    setLikedIds(next);
    setLikedProductIds(next);
  };
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const timer = window.setTimeout(() => trackCommerceEvent({ event: 'search', query: trimmed, resultCount: visible.length }), 700);
    return () => window.clearTimeout(timer);
  }, [query, visible.length]);

    if (loading) return <HouseShell><section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><div className="space-y-4 border-b border-border pb-10"><div className="h-4 w-28 animate-pulse rounded-full bg-muted" /><div className="h-14 w-3/4 animate-pulse rounded-2xl bg-muted" /><div className="h-5 w-full max-w-xl animate-pulse rounded-full bg-muted" /></div><div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="aspect-[4/5] animate-pulse rounded-2xl bg-muted" />)}</div></section></HouseShell>;
  const hasCatalogPieces = products.some(product => isPublicProduct(product) || getFieldValue(product, '@statx', 'Status') === 'Sold Out');
  const foundingCollection = !savedOnly && !searchParams.toString() && visible.length > 0 && visible.length <= 4;
  const noCatalogPieces = !catalogError && !savedOnly && !hasCatalogPieces;
  const invitation = <aside className="my-10 rounded-3xl border border-border bg-card px-6 py-9 text-center shadow-sm sm:px-12" aria-labelledby="house-invitation-title"><p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">An invitation from the House</p><h2 id="house-invitation-title" className="mt-3 font-serif text-3xl sm:text-4xl">The House is getting dressed</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">Our first pieces are only the beginning. We're welcoming independent designers to bring their own vision to the House.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link to="/sell" className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground">Join as a designer</Link><a href="/#journal" className="inline-flex min-h-12 items-center justify-center rounded-full border border-border px-6 text-sm font-semibold hover:bg-accent">Get notified when pieces arrive</a></div></aside>;
  const activeFilters = [category !== 'All pieces', subcategory !== 'All subcategories', priceRange !== 'all-prices', style !== 'All styles', designerFilter !== 'All designers',presentation!=='all',pattern!=='all',availability!=='all'].filter(Boolean).length;
  return <HouseShell>
    <section className="house-shop mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="house-shop-heading">
        <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">Independent by design</p>
          <h1 className="mt-3 font-serif text-5xl leading-tight sm:text-6xl">{savedOnly ? 'Your saved pieces.' : 'Find your next favorite.'}</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">Original clothing. Independent designers. A little more you.</p>
        </div>
        <Link to={savedOnly ? '/shop' : '/shop?saved=true'} className="house-outline-link"><Heart size={16}/>{savedOnly ? 'Browse all pieces' : 'Saved pieces'}</Link>
      </div>
      <div className="house-shop-note"><span>Free US delivery</span><span>Guest checkout welcome</span><a href="/shipping.html">Shipping &amp; returns ↗</a></div>
      {foundingCollection && <div className="mt-9"><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">The first chapter</p><h2 className="mt-2 font-serif text-3xl sm:text-4xl">The Founder's Collection</h2><p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">Meet the original pieces that began House of Briar. A small, considered collection while our community of designers grows.</p></div>}
      {!noCatalogPieces && <div className="house-shop-toolbar">
        <label className="house-search-field"><span className="sr-only">Search pieces</span><Search size={18}/>
          <input value={query} onChange={event => { setQuery(event.target.value); updateFilter('q', event.target.value, ''); }} placeholder="Search pieces, designers, materials…" />
        </label>
        <details className="house-shop-filters min-w-0"><summary>Browse pieces · {CATEGORY_LABELS[category] || category}</summary><div className="house-filter-options">
        <label className="house-filter-label" htmlFor="category-filter">Department
          <select id="category-filter" value={category} onChange={event => { const next=new URLSearchParams(searchParams);next.delete('subcategory');if(event.target.value==='All pieces')next.delete('category');else next.set('category',event.target.value);setSearchParams(next,{replace:true}); }}>{categories.map(item => <option key={item} value={item}>{CATEGORY_LABELS[item]||item} ({products.filter(p=>categoryMatches(item,getFieldValue(p,'@categ','Category')||'',getFieldValue(p,'@style','Style')||'')).length})</option>)}</select>
        </label>
        <label className="house-filter-label" htmlFor="subcategory-filter">Clothing / accessory type<select id="subcategory-filter" value={subcategory} onChange={event=>updateFilter('subcategory',event.target.value,'All subcategories')}><option>All subcategories</option>{subcategories.map(item=><option key={item} value={item}>{TYPE_LABELS[item]||item} ({count('@style',item)})</option>)}</select></label>
        </div></details>
        <label className="house-filter-label" htmlFor="sort-filter">Sort by
          <select aria-label="Sort by" id="sort-filter" value={sort} onChange={event => { setSort(event.target.value); updateFilter('sort', event.target.value, 'newest'); }}><option value="newest">Newest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name: A to Z</option></select>
        </label>
      </div>}
      {!noCatalogPieces && <details className="house-shop-filters" open={activeFilters > 0 || undefined}>
        <summary><SlidersHorizontal size={16}/> More filters {activeFilters > 0 && `(${activeFilters} active)`}</summary>
        <div className="house-filter-options">

          <label className="house-filter-label" htmlFor="presentation-filter">Presentation<select id="presentation-filter" value={presentation} onChange={e=>updateFilter('presentation',e.target.value,'all')}><option value="all">All presentations</option>{taxonomy.presentation.map(item=><option key={item.value} value={item.value}>{item.label} ({count('@presn',item.value)})</option>)}</select></label>
          <label className="house-filter-label" htmlFor="pattern-filter">Print / Pattern<select id="pattern-filter" value={pattern} onChange={e=>updateFilter('pattern',e.target.value,'all')}><option value="all">All prints</option>{taxonomy.patterns.filter(item=>count('@patrn',item)>0||item===pattern).map(item=><option key={item} value={item}>{item} ({count('@patrn',item)})</option>)}</select></label>
          <label className="house-filter-label" htmlFor="availability-filter">Availability<select id="availability-filter" value={availability} onChange={e=>updateFilter('availability',e.target.value,'all')}><option value="all">All availability</option>{taxonomy.availability.map(item=><option key={item.value} value={item.value}>{item.label} ({products.filter(p=>availabilityMatches(p,item.value)).length})</option>)}</select></label>
          <label className="house-filter-label" htmlFor="price-filter">Price range<select id="price-filter" value={priceRange} onChange={event => { setPriceRange(event.target.value); updateFilter('price', event.target.value, 'all-prices'); }}>{PRICE_RANGES.map(range => <option key={range.value} value={range.value}>{range.label}</option>)}</select></label>
          <label className="house-filter-label" htmlFor="style-filter">Aesthetic<select id="style-filter" value={style} onChange={event => { setStyle(event.target.value); updateFilter('style', event.target.value, 'All styles'); }}><option>All styles</option>{taxonomy.aesthetics.filter(item=>count('@aesth',item)>0||item===style).map(item => <option key={item} value={item}>{item} ({count('@aesth',item)})</option>)}</select></label>
        </div>
      </details>}
      {!noCatalogPieces && <div className="house-results-line"><p role="status">{visible.length} {visible.length === 1 ? 'piece' : 'pieces'}{savedOnly ? ' saved' : ' to discover'}</p>{(activeFilters > 0 || query) && <button type="button" onClick={() => { const next = new URLSearchParams(); if (savedOnly) next.set('saved', 'true'); setSearchParams(next); }}>Clear search &amp; filters</button>}</div>}
      {!noCatalogPieces && <div className="house-shop-grid">{visible.map(product => <ProductCard key={product.id} product={product} onLike={handleLike} liked={likedIds.includes(product.id)} saved={savedIds.includes(product.id)} onSave={handleSave}/>)}</div>}
      {catalogError && <div role="alert" className="house-shop-empty"><p>{catalogError}</p><button type="button" className="house-outline-link mt-4" onClick={() => window.location.reload()}>Try again</button></div>}
      {!catalogError && visible.length === 0 && !noCatalogPieces && <div className="house-shop-empty"><Heart size={28}/><h2 className="mt-4 font-serif text-3xl">{savedOnly ? 'Keep your favorites close.' : 'No pieces found just yet.'}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{savedOnly ? 'Tap Save on a piece you love. You can come back to it here.' : 'Try another search or clear your filters to see the full collection.'}</p><Link to="/shop" onClick={() => setSearchParams(new URLSearchParams())} className="house-outline-link mt-6">Browse all pieces</Link></div>}
      {(foundingCollection || noCatalogPieces) && invitation}
      {!noCatalogPieces && <details className="house-photo-search" open={window.location.hash === '#visual-search-title' || undefined}><summary>Have a style in mind? Search with a photo ↗</summary><VisualSearch token={auth.user?.access_token || ''}/></details>}
    </section>
  </HouseShell>;
}
