import { clearHouseCartOnSignOut } from '@/lib/cart-signout';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Bell, Heart, Menu as MenuIcon, Moon, ShoppingBag, Sun, X as CloseIcon } from '@/lib/icons';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { FloatingAgentChat } from '@/components/blocks/agent-chat/FloatingAgentChat';
import { HOUSE_OF_BRIAR_AGENT_ID, HOUSE_OF_BRIAR_PUBLIC_AGENT_ID } from '@/lib/marketplace';
import { createDonationSession } from '@/lib/stripe';

function DonationCard() {
  const [amount, setAmount] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const donate = async () => {
    setLoading(true);
    setError('');
    try {
      const url = await createDonationSession(amount);
      window.location.assign(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Stripe could not start the donation.');
      setLoading(false);
    }
  };

  return <div className="rounded-2xl border border-border bg-background/60 p-5">
    <p className="font-serif text-xl">Keep the briar growing</p>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">Your donation supports the independent marketplace and the people making it by hand.</p>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Donation amount">
      {[10, 25, 50].map((value) => <button key={value} type="button" onClick={() => setAmount(value)} className={`min-h-11 rounded-full border px-4 text-sm transition ${amount === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary hover:text-primary'}`}>${value}</button>)}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <button type="button" onClick={() => void donate()} disabled={loading} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">{loading ? 'Opening Stripe…' : `Donate ${moneyLabel(amount)}`}</button>
  </div>;
}

function moneyLabel(amount: number) {
  return `$${amount}`;
}

function ThemeButton() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="min-h-11 min-w-11" aria-hidden="true" />;
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      aria-label={dark ? 'Use light theme' : 'Use dark theme'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-primary hover:text-primary"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

export default function HouseShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [cartCount, setCartCount] = useState(0);
  const [designerAlerts,setDesignerAlerts]=useState<{id:string;title:string;body:string;readAt?:string|null;orderId?:string|null}[]>([]);
  const [designerUnread,setDesignerUnread]=useState(0);
  const [designerSales,setDesignerSales]=useState(0);
  const [isDesigner,setIsDesigner]=useState(false);
  const [alertsOpen,setAlertsOpen]=useState(false);
  useEffect(()=>{
    if(!auth.isAuthenticated){setIsDesigner(false);setDesignerUnread(0);setDesignerSales(0);return;}
    let active=true;
    const refresh=async()=>{
      if(document.visibilityState==='hidden')return;
      try{
        const [notifications,orders]=await Promise.all([
          fetch('/api/my/designer-notifications',{credentials:'same-origin'}),
          fetch('/api/my/orders',{credentials:'same-origin'})
        ]);
        if(!active)return;
        if(notifications.ok){
          const data=await notifications.json();
          if(!active)return;
          setIsDesigner(true);setDesignerAlerts(data.items??[]);setDesignerUnread(data.unread??0);
        }
        if(orders.ok){const data=await orders.json();if(active){setIsDesigner(true);setDesignerSales((data.orders??[]).length);}}
      }catch{}
    };
    void refresh();
    const timer=window.setInterval(()=>void refresh(),30000);
    document.addEventListener('visibilitychange',refresh);
    return()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[auth.isAuthenticated]);
  const readDesignerAlert=async(id:string)=>{
    try{const response=await fetch(`/api/my/designer-notifications/${encodeURIComponent(id)}/read`,{method:'PATCH',credentials:'same-origin'});if(response.ok){setDesignerAlerts(items=>items.map(item=>item.id===id?{...item,readAt:new Date().toISOString()}:item));setDesignerUnread(count=>Math.max(0,count-1));}}catch{}
  };
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openMobileMenu, setOpenMobileMenu] = useState<string | null>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpenMenu(null); setOpenMobileMenu(null); setMobileNavOpen(false); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => {
    const refresh = () => {
      const stored = window.localStorage.getItem('house-of-briar:cart');
      setCartCount(stored ? JSON.parse(stored).length : 0);
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('house-of-briar-cart', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('house-of-briar-cart', refresh);
    };
  }, []);

  return (
    <div className="fashion-app min-h-screen bg-background text-foreground">

      <header className="sticky top-0 isolate z-[9999] overflow-visible border-b border-border/70 bg-background shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
          <Link to="/" className="group flex min-w-0 items-center gap-2 sm:gap-3" aria-label="House of Briar home">
            <span className="min-w-0 leading-none">
              <span className="block truncate font-serif text-base font-semibold tracking-wide sm:text-lg">House of Briar</span>
              <span className="mt-1 hidden whitespace-nowrap text-[8px] sm:block uppercase tracking-[0.12em] text-muted-foreground sm:text-[9px] sm:tracking-[0.16em]">Made by someone, not everyone.</span>
            </span>
          </Link>
          <nav ref={navRef} className="hidden items-center gap-5 text-sm md:flex" aria-label="Primary navigation">
            {[
              { title: 'Mess Around', items: [
                ['Find out…', '/fashion-personality'],['Find Your Fashion Personality', '/fashion-personality'],
                ['Briar Runway — Coming Soon', '/fashion-personality'],
                ['AI styling companion', '/#house-styling-title'],
                ['AI photo try-on', '/#shop'],
                ['Measurement avatar', '/account'],
                ['Heart your favorites', '/shop?liked=true'],
                ['Seasonal collections', '/#house-collections-title'],
                ['Designer stories & lookbooks', '/#house-stories-title'],
                ['Photo style search', '/shop'],
                ['House badges', '/#support']
              ] },
              { title: 'Shop', items: [
                ['Shop all pieces', '/shop'],
                ['Find your favorites', '/shop?liked=true'],
                ['Browse designers', '/designers'],
                ['Your cart', '/cart']
              ] },
              { title: 'Customers', items: [
                ['Customer account', '/account'],
                ['Saved favorites', '/shop?liked=true'],
                ['Browse the shop', '/shop'],
                ['Meet designers', '/designers']
              ] },
              { title: 'Designers', items: [
                ['Become a Founding Designer', '/sell'],
                ['Designer sign up', '/sell#designer-signup'],
                ['Designer dashboard', '/account'],
                ['Meet the designers', '/designers']
              ] }
            ].map((group) => <div key={group.title} className="relative">
              <button type="button" aria-expanded={openMenu === group.title} aria-haspopup="true" onClick={() => setOpenMenu(current => current === group.title ? null : group.title)} className="flex min-h-11 cursor-pointer items-center gap-1 whitespace-nowrap text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{group.title}<span aria-hidden="true" className={`text-xs transition-transform ${openMenu === group.title ? "rotate-180" : ""}`}>⌄</span></button>
              {openMenu === group.title && <div className="absolute left-0 top-full z-[9999] mt-1 max-h-[min(70vh,34rem)] w-64 overflow-y-auto rounded-2xl border border-border bg-background p-2 text-sm shadow-2xl">
                {group.items.map(([label, href], index) => <a key={label} href={href} onClick={() => setOpenMenu(null)} className={`block rounded-xl px-3 py-2.5 transition hover:bg-accent hover:text-foreground focus-visible:bg-accent ${index === 0 && group.title === 'Mess Around' ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{label}</a>)}
              </div>}
            </div>)}
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {auth.isAuthenticated&&isDesigner&&<div className="relative"><button type="button" aria-label={`Designer notifications, ${designerUnread} unread, ${designerSales} sales`} aria-expanded={alertsOpen} onClick={()=>setAlertsOpen(open=>!open)} className={`relative inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm font-bold transition-colors ${designerUnread>0||designerSales>0?'border-amber-500 bg-amber-300 text-amber-950':'border-border bg-card text-foreground'}`}><Bell size={19}/><span className="hidden sm:inline">Sales</span>{designerUnread>0&&<span className="rounded-full bg-amber-950 px-1.5 text-xs text-amber-50">{designerUnread}</span>}{designerUnread===0&&designerSales>0&&<span className="text-xs">{designerSales}</span>}</button>{alertsOpen&&<div className="absolute right-0 top-full z-[10000] mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl"><strong className="block font-serif text-lg">Designer sales & updates</strong><p className="mt-1 text-sm">{designerSales} paid {designerSales===1?'order':'orders'} · {designerUnread} unread</p><Link to="/account#orders" onClick={()=>setAlertsOpen(false)} className="mt-3 block rounded-full bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">View sales & shipping</Link><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{designerAlerts.slice(0,5).map(item=><div key={item.id} className={`rounded-xl border p-3 text-sm ${!item.readAt?'border-amber-400 bg-amber-100 text-amber-950':'border-border'}`}><strong>{item.title}</strong><p className="mt-1">{item.body}</p>{!item.readAt&&<button type="button" onClick={()=>void readDesignerAlert(item.id)} className="mt-2 text-xs font-semibold underline">Mark read</button>}</div>)}</div></div>}</div>}
            <Link to="/shop?liked=true" aria-label="Saved pieces" className="hidden sm:inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-primary hover:text-primary"><Heart size={17} /></Link>
            <div className="group relative"><Link to="/cart" aria-label={`Cart with ${cartCount} items. Open your cart.`} aria-describedby="suitcase-help" className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-primary hover:text-primary focus:border-primary focus:text-primary"><img src="/suitcase-cart-v1.svg" alt="" aria-hidden="true" className="size-7 object-contain" />{cartCount > 0 && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{cartCount}</span>}</Link><span id="suitcase-help" role="tooltip" className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-56 rounded-2xl border border-border bg-card p-3 text-left text-xs leading-5 text-foreground shadow-xl group-hover:block group-focus-within:block"><strong className="block font-serif text-base">Your cart</strong><span className="mt-1 block text-muted-foreground">Review your items, shipping costs and total before checkout.</span></span></div>
            {auth.isAuthenticated && <button type="button" onClick={() => { clearHouseCartOnSignOut(); void auth.signoutRedirect(); }} className="min-h-11 rounded-full border border-border bg-card px-3 text-sm">Sign out</button>}
            <span className="hidden sm:inline-flex"><ThemeButton /></span>
            <button type="button" aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileNavOpen} aria-controls="mobile-navigation" onClick={() => setMobileNavOpen((open) => !open)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-primary hover:text-primary md:hidden">
              {mobileNavOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
            </button>
          </div>
        </div>
        {mobileNavOpen && <nav id="mobile-navigation" className="border-t border-border/70 px-4 py-3 md:hidden" aria-label="Mobile navigation">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 text-sm">
            {[
              {title:'Mess Around',items:[['Find out…', '/fashion-personality'],['Find Your Fashion Personality', '/fashion-personality'],['Briar Runway — Coming Soon','/fashion-personality'],['AI styling companion','/#house-styling-title'],['AI photo try-on','/#shop'],['Measurement avatar','/account'],['Heart your favorites','/shop?liked=true'],['Seasonal collections','/#house-collections-title'],['Designer stories & lookbooks','/#house-stories-title'],['Photo style search','/shop'],['House badges','/#support']]},
              {title:'Shop',items:[['Shop all','/shop'],['Saved favorites','/shop?liked=true'],['Meet designers','/designers'],['Cart','/cart']]},
              {title:'Customers',items:[['Customer account','/account'],['Saved favorites','/shop?liked=true'],['Browse the shop','/shop']]},
              {title:'Designers',items:[['Become a Founding Designer','/sell'],['Designer sign up','/sell#designer-signup'],['Designer dashboard','/account'],['Meet designers','/designers']]}
            ].map(group=><div key={group.title} className="rounded-xl border-b border-border/50">
              <button type="button" aria-expanded={openMobileMenu === group.title} onClick={() => setOpenMobileMenu(current => current === group.title ? null : group.title)} className="flex min-h-11 w-full cursor-pointer items-center justify-between px-3 py-3 font-medium">{group.title}<span aria-hidden="true">⌄</span></button>
              {openMobileMenu === group.title && <div className="flex flex-col pb-2 pl-3">{group.items.map(([label,href],index)=><a key={label} href={href} onClick={()=>{setMobileNavOpen(false);setOpenMobileMenu(null);}} className={`rounded-lg px-3 py-2.5 hover:bg-accent ${group.title==='Mess Around'&&index===0?'font-semibold text-primary':'text-muted-foreground'}`}>{label}</a>)}</div>}
            </div>)}
            <div className="mt-2 border-t border-border/70 pt-2 sm:hidden"><ThemeButton /></div>
          </div>
        </nav>}
      </header>
      <main>{children}</main>
      <footer className="border-t border-border/70 bg-card/30">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr] lg:px-8">
          <div>
            <p className="font-serif text-2xl">Independent fashion. Individual expression.</p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">We celebrate independent designers, slow-made pieces, and the beauty of being different.</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Explore</p>
            <div className="mt-4 flex flex-col gap-3 text-sm"><Link to="/shop" className="transition hover:text-primary">Shop the collection</Link><Link to="/designers" className="transition hover:text-primary">Meet the designers</Link><Link to="/account" className="transition hover:text-primary">List your work</Link><a href="/shipping.html" className="transition hover:text-primary">Shipping &amp; Delivery</a><a href="/rules" className="transition hover:text-primary">Rules &amp; Returns</a><Link to="/account#house-support" className="transition hover:text-primary">Customer support</Link></div>
          </div>
          <DonationCard />
        </div>
      </footer>
      <FloatingAgentChat agentId={HOUSE_OF_BRIAR_AGENT_ID} publicAgentId={HOUSE_OF_BRIAR_PUBLIC_AGENT_ID} />
    </div>
  );
}

