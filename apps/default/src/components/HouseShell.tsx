import { readCartIds } from '@/lib/cart-storage';
import { clearHouseCartOnSignOut } from '@/lib/cart-signout';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Moon, Sun } from '@/lib/icons';
import { useTheme } from 'next-themes';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

function HeartMailboxIcon() { return (<svg className="hob-mailbox-icon" viewBox="0 0 64 56" width="38" height="34" aria-hidden="true"><path d="M12 43V23a17 17 0 0 1 34 0v20H12Z" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeWidth="2.5"/><path d="M12 43h42V25c0-10-7-19-17-19M20 43v10m21-10v10M47 22V8h10v9H47" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path className="hob-mailbox-heart" d="M29 24c-7-8-16 3 0 13 16-10 7-21 0-13Z" fill="currentColor"/></svg>); }

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(()=>{if(resolvedTheme==='dark'||resolvedTheme==='light')document.documentElement.dataset.hobTheme=resolvedTheme;},[resolvedTheme]);
  if (!mounted) return <span className="min-h-11 min-w-11" aria-hidden="true" />;
  const dark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      aria-label={dark ? 'Use light theme' : 'Use dark theme'}
      onClick={() => { const next = dark ? 'light' : 'dark'; setTheme(next); try { localStorage.setItem('house-of-briar-theme', next); } catch {} }}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-primary hover:text-primary"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

export default function HouseShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  const [helpOpen,setHelpOpen] = useState(false);
  const [helpQuestion,setHelpQuestion] = useState('');
  useEffect(()=>setHelpOpen(false),[location.pathname,location.hash]);

  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(124);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => setHeaderHeight(Math.ceil(header.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
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
  useEffect(() => {
    const refresh = () => {
      setCartCount(readCartIds().length);
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

      <a href="#house-main" className="house-skip-link">Skip to content</a>
      <header ref={headerRef} className="house-compact-header fixed inset-x-0 top-0 z-[9999] border-b border-border/70 bg-background shadow-sm" aria-label="Persistent House of Briar navigation">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
          <a href="/" className="shrink-0 font-serif text-2xl tracking-[.08em]" aria-label="House of Briar home">HOUSE <span className="text-base italic tracking-normal">of</span> BRIAR</a>
          <nav className="house-compact-links flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:text-sm" aria-label="Primary navigation">
            <NavLink to="/shop" className="inline-flex min-h-10 items-center hover:underline">Shop</NavLink>
            <a href={auth.isAuthenticated && isDesigner ? '/account' : '/designers/room'} className="inline-flex min-h-10 items-center hover:underline">{auth.isAuthenticated && isDesigner ? 'Designer dashboard' : 'Designer sign in'}</a>
            <NavLink to="/designers" className="inline-flex min-h-10 items-center hover:underline">Designers</NavLink>
            <a href="/creative-house.html" className="inline-flex min-h-10 items-center hover:underline">The Creative House</a>
            <Link to="/shop?saved=true" className="inline-flex min-h-10 items-center hover:underline">Saved pieces</Link><ThemeButton /><Link to="/account" className="inline-flex min-h-10 items-center hover:underline">My account</Link>
            <Link to="/cart" aria-label={`Cart with ${cartCount} items`} className="relative inline-flex min-h-10 items-center gap-1 border border-border px-2 hover:border-primary">
              <img src="/suitcase-cart-v1.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
              <span>Cart{cartCount > 0 ? ` (${cartCount})` : ''}</span>
            </Link>
            {auth.isAuthenticated && isDesigner && <div className="relative">
              <button type="button" aria-label={`Designer notifications, ${designerUnread} unread, ${designerSales} sales`} aria-expanded={alertsOpen} onClick={() => setAlertsOpen(open => !open)} className={`hob-mailbox ${designerUnread>0?'has-unread':''}`}><HeartMailboxIcon />{designerUnread > 0 && <span className="hob-mailbox-count">{designerUnread>99?'99+':designerUnread}</span>}</button>
              {alertsOpen && <div className="absolute right-0 top-full z-[10000] mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 text-foreground shadow-xl">
                <strong className="block font-serif text-lg">Designer sales & updates</strong>
                <p className="mt-1 text-sm">{designerSales} orders · {designerUnread} unread</p>
                <Link to="/account#orders" onClick={() => setAlertsOpen(false)} className="mt-3 block border border-border px-4 py-2 text-center text-sm">View sales & shipping</Link>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{designerAlerts.slice(0, 5).map(item => <div key={item.id} className="border border-border p-3 text-sm"><strong>{item.title}</strong><p>{item.body}</p>{!item.readAt && <button type="button" onClick={() => void readDesignerAlert(item.id)} className="mt-2 underline">Mark read</button>}</div>)}</div>
              </div>}
            </div>}
          </nav>
        </div>
      </header>
      {auth.isAuthenticated && <button type="button" aria-label="Sign out of House of Briar" onClick={() => { clearHouseCartOnSignOut(); void auth.signoutRedirect(); }} className="fixed right-2 z-[10001] inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-[#6e4b20] bg-[#f4d992] px-4 py-2 text-sm font-bold text-[#18231f] shadow-xl hover:bg-[#fff0b9] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 sm:right-4" style={{ top: 'max(8px, env(safe-area-inset-top, 0px))' }}>Sign out</button>}
      <main id="house-main" className="house-main" style={{ paddingTop: headerHeight + 12 }}>{children}</main>
      <footer className="border-t border-border/70 bg-card/30">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.3fr_1fr] lg:px-8">
          <div>
            <p className="font-serif text-2xl">Independent fashion. Individual expression.</p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">We celebrate independent designers, slow-made pieces, and the beauty of being different.</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Explore</p>
            <div className="mt-4 flex flex-col gap-3 text-sm"><Link to="/shop" className="transition hover:text-primary">Shop the collection</Link><Link to="/account" className="transition hover:text-primary">Designer dashboard</Link><a href="/shipping.html" className="transition hover:text-primary">Shipping &amp; Delivery</a><a href="/rules" className="transition hover:text-primary">Rules &amp; Returns</a><Link to="/account#house-support" className="transition hover:text-primary">Customer support</Link><Link to="/admin" className="transition hover:text-primary">Admin dashboard</Link></div>
          </div>
        </div>
      </footer>
      <div className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3">
        {helpOpen && <section id="house-help-chat" role="dialog" aria-label="House of Briar AI support" className="w-[min(23rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl">House support assistant</h2><button type="button" aria-label="Close support chat" onClick={()=>setHelpOpen(false)} className="min-h-11 min-w-11 rounded-full border border-border">×</button></div>
          <p className="mt-2 text-sm text-muted-foreground">Ask about House policies, designer registration, shipping, or orders. AI support requires a signed-in House account and your consent. You can also email House support without an account.</p>
          <form onSubmit={event=>{event.preventDefault();if(!helpQuestion.trim())return;sessionStorage.setItem('hob-support-question',helpQuestion.trim());setHelpOpen(false);window.location.assign('/account#house-support-agent');}} className="mt-4 space-y-3">
            <label className="block text-sm">Your question<textarea value={helpQuestion} onChange={event=>setHelpQuestion(event.target.value)} required minLength={5} maxLength={1500} rows={3} className="mt-2 w-full rounded-xl border border-border bg-background p-3"/></label>
            <button type="submit" className="min-h-11 w-full rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Continue to AI support</button>
          </form>
          <Link to="/account#house-support" onClick={()=>setHelpOpen(false)} className="mt-3 block text-center text-sm underline">Contact customer support</Link>
        </section>}
        <button type="button" aria-expanded={helpOpen} aria-controls="house-help-chat" onClick={()=>setHelpOpen(open=>!open)} className="rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold shadow-lg focus-visible:outline focus-visible:outline-2">Need help?</button>
      </div>
    </div>
  );
}

