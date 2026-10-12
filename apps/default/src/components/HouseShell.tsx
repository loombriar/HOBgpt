import { clearHouseCartOnSignOut } from '@/lib/cart-signout';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Bell, Moon, Sun } from '@/lib/icons';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { FloatingAgentChat } from '@/components/blocks/agent-chat/FloatingAgentChat';
import { HOUSE_OF_BRIAR_AGENT_ID, HOUSE_OF_BRIAR_PUBLIC_AGENT_ID } from '@/lib/marketplace';

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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
      const stored = window.localStorage.getItem('house-of-briar:cart');
      try { const items = stored ? JSON.parse(stored) : []; setCartCount(Array.isArray(items) ? items.length : 0); } catch { setCartCount(0); }
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
      <header className="house-compact-header fixed inset-x-0 top-0 z-[9999] border-b border-border/70 bg-background shadow-sm" aria-label="Persistent House of Briar navigation">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
          <a href="/" className="shrink-0 font-serif text-2xl tracking-[.08em]" aria-label="House of Briar home">HOUSE <span className="text-base italic tracking-normal">of</span> BRIAR</a>
          <nav className="house-compact-links flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:text-sm" aria-label="Primary navigation">
            <NavLink to="/shop" className="inline-flex min-h-10 items-center hover:underline">Shop</NavLink>
            <NavLink to="/designers" className="inline-flex min-h-10 items-center hover:underline">Designers</NavLink>
            <a href="/creative-house.html" className="inline-flex min-h-10 items-center hover:underline">The Creative House</a>
            <ThemeButton /><Link to="/account" className="inline-flex min-h-10 items-center hover:underline">My account</Link>
            <Link to="/cart" aria-label={`Cart with ${cartCount} items`} className="relative inline-flex min-h-10 items-center gap-1 border border-border px-2 hover:border-primary">
              <img src="/suitcase-cart-v1.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
              <span>Cart{cartCount > 0 ? ` (${cartCount})` : ''}</span>
            </Link>
            {auth.isAuthenticated && isDesigner && <div className="relative">
              <button type="button" aria-label={`Designer notifications, ${designerUnread} unread, ${designerSales} sales`} aria-expanded={alertsOpen} onClick={() => setAlertsOpen(open => !open)} className="relative inline-flex min-h-10 items-center gap-1 border border-border px-2"><Bell size={17} />{designerUnread > 0 && <span>{designerUnread}</span>}</button>
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
      <main id="house-main" className="house-main">{children}</main>
      <footer className="border-t border-border/70 bg-card/30">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.3fr_1fr] lg:px-8">
          <div>
            <p className="font-serif text-2xl">Independent fashion. Individual expression.</p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">We celebrate independent designers, slow-made pieces, and the beauty of being different.</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Explore</p>
            <div className="mt-4 flex flex-col gap-3 text-sm"><Link to="/shop" className="transition hover:text-primary">Shop the collection</Link><Link to="/designers" className="transition hover:text-primary">Meet the designers</Link><Link to="/account" className="transition hover:text-primary">List your work</Link><a href="/shipping.html" className="transition hover:text-primary">Shipping &amp; Delivery</a><a href="/rules" className="transition hover:text-primary">Rules &amp; Returns</a><Link to="/account#house-support" className="transition hover:text-primary">Customer support</Link></div>
          </div>
        </div>
      </footer>
      <FloatingAgentChat agentId={HOUSE_OF_BRIAR_AGENT_ID} publicAgentId={HOUSE_OF_BRIAR_PUBLIC_AGENT_ID} />
    </div>
  );
}

