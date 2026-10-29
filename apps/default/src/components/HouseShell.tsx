import HouseFooter from '@/components/HouseFooter';
import { readCartIds } from '@/lib/cart-storage';
import { clearHouseCartOnSignOut } from '@/lib/cart-signout';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Moon, Sun } from '@/lib/icons';
import { useTheme } from 'next-themes';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

function SignupBanner(){
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer);},[]);
 const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'long',day:'numeric',year:'numeric'}).format(now);
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York'}).format(now);
 return <div role="region" aria-label="House signup announcement" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-accent/30 px-2 py-1 text-center text-[11px] leading-4"><time dateTime={day}>{date}</time><span className="font-semibold">We’re in our signup era.</span></div>;
}

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
 return <details ref={ref} className="relative house-seamstress-menu" onToggle={event=>{const menu=event.currentTarget;if(menu.open)menu.closest('nav')?.querySelectorAll('details').forEach(other=>{if(other!==menu)other.open=false;});}} onKeyDown={event=>{if(event.key==='Escape'&&ref.current){ref.current.open=false;ref.current.querySelector('summary')?.focus();}}}><summary className="flex min-h-10 cursor-pointer items-center">{label} ▾</summary><div className="house-seamstress-menu-panel absolute right-0 top-full z-50 grid w-64 gap-1 rounded-xl border border-border bg-background p-3 shadow-lg" onClick={event=>{if((event.target as HTMLElement).closest('a')&&ref.current)ref.current.open=false;}}>{children}</div></details>;
}

export default function HouseShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  const [searchOpen,setSearchOpen] = useState(false);
  const [supportBottom,setSupportBottom] = useState(20);
  useEffect(()=>{
    const footer=document.querySelector('.house-react-footer');if(!footer)return;
    const observer=new IntersectionObserver(([entry])=>setSupportBottom(entry.isIntersecting?Math.max(20,window.innerHeight-entry.boundingClientRect.top+12):20),{threshold:Array.from({length:21},(_,i)=>i/20)});
    observer.observe(footer);return()=>observer.disconnect();
  },[location.pathname]);
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
        <SignupBanner/>
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-1 px-2 py-2 sm:gap-4 sm:px-6">
          <a href="/" aria-label="House of Briar home" className="shrink-0"><img src="/house-monogram-v2.webp" alt="" width="48" height="48" className="h-10 w-10 rounded-full sm:h-12 sm:w-12"/></a><ThemeButton/>
          <button type="button" aria-label="Open shop search" aria-expanded={searchOpen} aria-controls="house-nav-search" onClick={()=>setSearchOpen(v=>!v)} className="mr-auto flex min-h-11 min-w-11 items-center justify-center rounded border border-border min-[1101px]:hidden">⌕</button>
          <form action="/shop" method="get" role="search" aria-label="Search the shop" className="mr-auto hidden w-64 min-w-0 items-center overflow-hidden rounded-full border border-border bg-card min-[1101px]:flex"><input type="search" name="q" aria-label="Search pieces, designers or materials" placeholder="Search the runway…" className="min-h-11 min-w-0 w-full border-0 bg-transparent px-4"/><button type="submit" className="min-h-11 border-l border-border px-3">Search</button></form>
          <nav aria-label="Primary navigation" className="order-last flex w-full items-center justify-center gap-6 text-xs min-[901px]:order-none min-[901px]:w-auto sm:text-sm">
            <NavigationMenu label="Shop the Runway"><p className="p-2 font-semibold">We’re still moving in.</p><a href="/?visitors=signup">Create your room</a><a href="/?visitors=signup#measurement-profile-name">Save your measurements</a><a href="/design-projects.html#creator-room">Create an outfit</a><a href="/join.html">{auth.isAuthenticated?'My dashboard':'Sign in / Join'}</a></NavigationMenu>
            <NavigationMenu label="Go Backstage"><a href="/creative-house.html">Enter Backstage</a><a href="/designers/room">Sign in as designer</a><a href="/?visitors=signup&creative=model">Sign in as model</a><a href="/?visitors=signup&creative=photographer">Sign in as photographer</a><a href="/?visitors=signup&creative=dj">Sign in as DJ</a>{auth.isAuthenticated&&<button type="button" aria-label="Sign out of House of Briar" onClick={()=>{clearHouseCartOnSignOut();void auth.signoutRedirect();}} className="min-h-11 text-left">Sign out</button>}</NavigationMenu>
          </nav>
          <a href={auth.isAuthenticated?'/account#messages':'/join.html'} aria-label={`Mailbox${designerUnread?`, ${designerUnread} unread`:''}`} className="flex min-h-11 min-w-11 items-center justify-center rounded border border-border">✉{designerUnread>0&&<span>{designerUnread}</span>}</a>
          <Link to="/cart" aria-label={`Cart with ${cartCount} items`} className="flex min-h-11 min-w-11 items-center justify-center rounded border border-border"><img src="/suitcase-cart-v1.svg" alt="" className="h-7 w-7"/></Link>
        </div>
        {searchOpen&&<form id="house-nav-search" action="/shop" method="get" role="search" aria-label="Search the shop" className="flex gap-2 border-t border-border bg-background p-3 min-[1101px]:hidden" onKeyDown={event=>{if(event.key==='Escape')setSearchOpen(false);}}><input autoFocus type="search" name="q" aria-label="Search pieces, designers or materials" placeholder="Search pieces, designers…" className="min-h-11 min-w-0 flex-1 rounded border border-border bg-card px-3"/><button type="submit" className="min-h-11 rounded border border-border px-4">Search</button></form>}

      </header>
      <main id="house-main" className="house-main" style={{ paddingTop: headerHeight + 12 }}>{children}</main>
      <HouseFooter />
      <div style={{bottom:supportBottom}} className="house-support-widget fixed right-5 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3">
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

