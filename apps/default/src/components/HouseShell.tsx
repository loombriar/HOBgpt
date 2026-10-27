import AcceptedPayments from '@/components/AcceptedPayments';
import { readCartIds } from '@/lib/cart-storage';
import { clearHouseCartOnSignOut } from '@/lib/cart-signout';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Moon, Sun } from '@/lib/icons';
import { useTheme } from 'next-themes';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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

function NavigationMenu({label,children}:{label:string;children:React.ReactNode}){
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const close=(event:MouseEvent)=>{if(ref.current&&!ref.current.contains(event.target as Node))ref.current.open=false;};document.addEventListener('click',close);return()=>document.removeEventListener('click',close);},[]);
 return <details ref={ref} className="relative house-seamstress-menu" onToggle={event=>{const menu=event.currentTarget;if(menu.open)menu.closest('nav')?.querySelectorAll('details').forEach(other=>{if(other!==menu)other.open=false;});}} onKeyDown={event=>{if(event.key==='Escape'&&ref.current){ref.current.open=false;ref.current.querySelector('summary')?.focus();}}}><summary className="flex min-h-10 cursor-pointer items-center">{label} ▾</summary><div className="house-seamstress-menu-panel absolute left-0 top-full z-50 grid w-64 gap-1 rounded-xl border border-border bg-background p-3 shadow-lg" onClick={event=>{if((event.target as HTMLElement).closest('a')&&ref.current)ref.current.open=false;}}>{children}</div></details>;
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
  const [designerUnread,setDesignerUnread]=useState(0);
  useEffect(()=>{
    if(!auth.isAuthenticated){setDesignerUnread(0);return;}
    let active=true;
    const refresh=async()=>{
      if(document.visibilityState==='hidden')return;
      try{
        const notifications=await fetch('/api/my/designer-notifications',{credentials:'same-origin'});
        if(!active)return;
        if(notifications.ok){
          const data=await notifications.json();
          if(!active)return;
          setDesignerUnread(data.unread??0);
        }
      }catch{}
    };
    void refresh();
    const timer=window.setInterval(()=>void refresh(),30000);
    document.addEventListener('visibilitychange',refresh);
    return()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[auth.isAuthenticated]);
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
          <a href="/" className="shrink-0 font-serif text-2xl tracking-[.08em]" aria-label="House of Briar home"><img src="/house-monogram-v2.webp" alt="" aria-hidden="true" width="64" height="64" className="mr-2 inline-block h-16 w-16 rounded-full" />HOUSE <span className="text-base italic tracking-normal">of</span> BRIAR</a>
          <a href="/join.html" className="house-join-button inline-flex min-h-11 items-center rounded-lg border-2 border-primary px-4 font-semibold">{auth.isAuthenticated?'My dashboard':'Sign in / Join'}</a>
          <form action="/shop" method="get" role="search" aria-label="Search the shop" className="house-sticky-search flex w-full items-center gap-2">
            <input type="search" name="q" aria-label="Search pieces, designers or materials" placeholder="Search pieces, designers…" defaultValue={new URLSearchParams(location.search).get('q') || ''} key={location.search} className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-base text-foreground" />
            <button type="submit" className="min-h-11 rounded-md border border-border bg-card px-4 text-sm text-foreground">Search</button>
          </form>
          <nav className="house-compact-links flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:text-sm" aria-label="Primary navigation">
            <NavLink to="/shop" className="inline-flex min-h-10 items-center hover:underline">Shop</NavLink>
            <NavigationMenu label="Designers"><a href="/designers/room">Designer dashboard</a><a href="/account#designer-notifications">Designer notifications{designerUnread>0?` (${designerUnread} unread)`:''}</a><NavLink to="/designers">Meet the designers</NavLink></NavigationMenu>
            <NavigationMenu label="Seamstresses"><a href="/sewing-services.html#offer-services">Seamstress dashboard</a><a href="/sewing-services.html#service-inbox">Seamstress notifications</a><a href="/design-projects.html#maker-board">Find designs to make</a></NavigationMenu>
            <NavigationMenu label="Creative House"><a href="/creative-house.html">Explore the Creative House</a><a href="/?visitors=signup&creative=model">Model sign in / signup</a><a href="/?visitors=signup&creative=photographer">Photographer sign in / signup</a><a href="/designers/room#designer-signup">Designer signup</a><a href="/?visitors=signup&creative=dj">DJ sign in / signup</a><a href="/?visitors=signup&creative=venue">Venue sign in / signup</a><a href="/creative-house.html#opportunities">Open calls &amp; collaborations</a><a href="/creative-house.html#post-event">Post an event</a></NavigationMenu>
            <Link to="/shop?saved=true" className="inline-flex min-h-10 items-center hover:underline">Saved pieces</Link><ThemeButton />
            <Link to="/cart" aria-label={`Cart with ${cartCount} items`} className="relative inline-flex min-h-10 items-center gap-1 border border-border px-2 hover:border-primary">
              <img src="/suitcase-cart-v1.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
              <span>Cart{cartCount > 0 ? ` (${cartCount})` : ''}</span>
            </Link>
            {auth.isAuthenticated && <button type="button" aria-label="Sign out of House of Briar" onClick={() => { clearHouseCartOnSignOut(); void auth.signoutRedirect(); }} className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg border-2 border-[#6e4b20] bg-[#f4d992] px-4 py-2 text-sm font-bold text-[#18231f] hover:bg-[#fff0b9] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2">Sign out</button>}
          </nav>
        </div>
      </header>
      <main id="house-main" className="house-main" style={{ paddingTop: headerHeight + 12 }}>{children}</main>
      <footer className="border-t border-border/70 bg-card/30">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.3fr_1fr] lg:px-8">
          <div>
            <img src="/house-logo-v2.webp" width="176" height="176" alt="House of Briar" className="mb-5 h-44 w-44 rounded-full"/><p className="font-serif text-2xl">Independent fashion. Individual expression.</p><AcceptedPayments/>
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

