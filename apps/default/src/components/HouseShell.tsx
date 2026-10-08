import { Link, NavLink } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Heart, Menu as MenuIcon, Moon, ShoppingBag, Sun, X as CloseIcon } from '@/lib/icons';
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) navRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(menu => { menu.open = false; });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        navRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(menu => { menu.open = false; });
        setMobileNavOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', closeMenus); document.removeEventListener('keydown', onKey); };
  }, []);
  const toggleDropdown = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open) return;
    const current = event.currentTarget;
    current.closest('nav')?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(menu => { if (menu !== current) menu.open = false; });
  };
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
              <span className="mt-1 block whitespace-nowrap text-[8px] uppercase tracking-[0.12em] text-muted-foreground sm:text-[9px] sm:tracking-[0.16em]">Made by someone, not everyone.</span>
            </span>
          </Link>
          <nav ref={navRef} className="hidden items-center gap-5 text-sm md:flex" aria-label="Primary navigation">
            {[
              { title: 'Mess Around', items: [
                ['Find out…', '/#mess-around'],
                ['Briar Runway', '/#mess-around'],
                ['AI styling companion', '/#house-styling-title'],
                ['AI photo try-on', '/#mess-around'],
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
                ['Your suitcase', '/cart']
              ] },
              { title: 'Visitors', items: [
                ['Your studio', '/account'],
                ['Saved favorites', '/shop?liked=true'],
                ['Browse the shop', '/shop'],
                ['Meet designers', '/designers']
              ] },
              { title: 'Designers', items: [
                ['Become a Founding Designer', '/sell'],
                ['Designer sign up', '/sell#designer-signup'],
                ['Designer studio', '/account'],
                ['Meet the designers', '/designers']
              ] }
            ].map((group) => <details key={group.title} onToggle={toggleDropdown} className="group relative z-[100] open:z-[200]">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 whitespace-nowrap text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">{group.title}<span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">⌄</span></summary>
              <div className="absolute left-0 top-full z-[9999] mt-1 max-h-[min(70vh,34rem)] w-64 overflow-y-auto rounded-2xl border border-border bg-background p-2 text-sm shadow-2xl">
                {group.items.map(([label, href], index) => <a key={label} href={href} onClick={() => { navRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(menu => { menu.open = false; }); }} className={`block rounded-xl px-3 py-2.5 transition hover:bg-accent hover:text-foreground focus-visible:bg-accent ${index === 0 && group.title === 'Mess Around' ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{label}</a>)}
              </div>
            </details>)}
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link to="/shop?liked=true" aria-label="Saved pieces" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-primary hover:text-primary"><Heart size={17} /></Link>
            <div className="group relative"><Link to="/cart" aria-label={`Suitcase with ${cartCount} items. Open your suitcase.`} aria-describedby="suitcase-help" className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-primary hover:text-primary focus:border-primary focus:text-primary"><img src="/suitcase-cart-v1.svg" alt="" aria-hidden="true" className="size-7 object-contain" />{cartCount > 0 && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{cartCount}</span>}</Link><span id="suitcase-help" role="tooltip" className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-56 rounded-2xl border border-border bg-card p-3 text-left text-xs leading-5 text-foreground shadow-xl group-hover:block group-focus-within:block"><strong className="block font-serif text-base">Your traveling suitcase</strong><span className="mt-1 block text-muted-foreground">Pieces you choose wait here before checkout — like treasures packed for the journey home.</span></span></div>
            {auth.isAuthenticated && <button type="button" onClick={() => void auth.signoutRedirect()} className="min-h-11 rounded-full border border-border bg-card px-3 text-sm">Sign out</button>}
            <span className="hidden sm:inline-flex"><ThemeButton /></span>
            <button type="button" aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileNavOpen} aria-controls="mobile-navigation" onClick={() => setMobileNavOpen((open) => !open)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition hover:border-primary hover:text-primary md:hidden">
              {mobileNavOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
            </button>
          </div>
        </div>
        {mobileNavOpen && <nav id="mobile-navigation" className="border-t border-border/70 px-4 py-3 md:hidden" aria-label="Mobile navigation">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 text-sm">
            {[
              {title:'Mess Around',items:[['Find out…','/#mess-around'],['Briar Runway','/#mess-around'],['AI styling companion','/#house-styling-title'],['AI photo try-on','/#mess-around'],['Measurement avatar','/account'],['Heart your favorites','/shop?liked=true'],['Seasonal collections','/#house-collections-title'],['Designer stories & lookbooks','/#house-stories-title'],['Photo style search','/shop'],['House badges','/#support']]},
              {title:'Shop',items:[['Shop all','/shop'],['Saved favorites','/shop?liked=true'],['Meet designers','/designers'],['Suitcase','/cart']]},
              {title:'Visitors',items:[['Your studio','/account'],['Saved favorites','/shop?liked=true'],['Browse the shop','/shop']]},
              {title:'Designers',items:[['Become a Founding Designer','/sell'],['Designer sign up','/sell#designer-signup'],['Designer studio','/account'],['Meet designers','/designers']]}
            ].map(group=><details key={group.title} onToggle={toggleDropdown} className="rounded-xl border-b border-border/50">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-3 font-medium [&::-webkit-details-marker]:hidden">{group.title}<span aria-hidden="true">⌄</span></summary>
              <div className="flex flex-col pb-2 pl-3">{group.items.map(([label,href],index)=><a key={label} href={href} onClick={()=>setMobileNavOpen(false)} className={`rounded-lg px-3 py-2.5 hover:bg-accent ${group.title==='Mess Around'&&index===0?'font-semibold text-primary':'text-muted-foreground'}`}>{label}</a>)}</div>
            </details>)}
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

