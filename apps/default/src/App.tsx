import { lazy, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { trackPageView } from '@/lib/analytics';
import { GenesisSection } from '@/lib/genesis';
import { GenesisAuth } from '@/lib/genesis-auth';
import AndroidBackHandler from '@/components/AndroidBackHandler';

const HomePage = lazy(() => import('@/pages/HomePage'));
const ShopPage = lazy(() => import('@/pages/ShopPage'));
const ProductPage = lazy(() => import('@/pages/ProductPage'));
const DesignerStorefrontPage = lazy(() => import('@/pages/DesignerStorefrontPage'));
const DesignersPage = lazy(() => import('@/pages/DesignersPage'));
const AccountPage = lazy(() => import('@/pages/AccountPage'));
const CartPage = lazy(() => import('@/pages/CartPage'));
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));
const SellPage = lazy(() => import('@/pages/SellPage'));
const FashionPersonalityPage = lazy(() => import('@/pages/FashionPersonalityPage'));

function Section({ name, children }: { name: string; children: ReactNode }) {
  return <GenesisSection name={name}>{children}</GenesisSection>;
}

function TrafficTracker() {
  const location = useLocation();
  useEffect(() => { trackPageView(location.pathname); }, [location.pathname]);
  return null;
}

function AppRoutes() {
  return <BrowserRouter>
    <TrafficTracker />
    <AndroidBackHandler />
    <Routes>
      <Route path="/" element={<Section name="Home"><HomePage /></Section>} />
      <Route path="/shop" element={<Section name="Shop"><ShopPage /></Section>} />
      <Route path="/shop/:productId" element={<Section name="Product"><ProductPage /></Section>} />
      <Route path="/designers" element={<Section name="Designers"><DesignersPage /></Section>} />
      <Route path="/designers/:designerId" element={<Section name="Designer storefront"><DesignerStorefrontPage /></Section>} />
      <Route path="/account" element={<Section name="Your studio"><AccountPage /></Section>} />
      <Route path="/cart" element={<Section name="Suitcase"><CartPage /></Section>} />
      <Route path="/checkout" element={<Section name="Checkout"><CheckoutPage /></Section>} />
      <Route path="/admin" element={<Section name="Admin"><AdminPage /></Section>} />
      <Route path="/fashion-personality" element={<Section name="Fashion personality"><FashionPersonalityPage /></Section>} />
      <Route path="/sell" element={<Section name="Designer sign up"><SellPage /></Section>} />
      <Route path="*" element={<main style={{ minHeight: "60vh", padding: "5rem 1.5rem", textAlign: "center" }}><h1>Page not found</h1><p>That page does not exist or may have moved.</p><a href="/shop">Explore the shop</a></main>} />
    </Routes>
  </BrowserRouter>;
}

export default function App() {
  useEffect(() => {
    document.title = 'House of Briar';
    document.documentElement.lang = 'en';

    const manifest = document.querySelector('link[rel="manifest"]') ?? document.createElement('link');
    manifest.setAttribute('rel', 'manifest');
    manifest.setAttribute('href', '/manifest.webmanifest');
    if (!manifest.parentNode) document.head.appendChild(manifest);

    const themeColor = document.querySelector('meta[name="theme-color"]') ?? document.createElement('meta');
    themeColor.setAttribute('name', 'theme-color');
    themeColor.setAttribute('content', '#c9ae72');
    if (!themeColor.parentNode) document.head.appendChild(themeColor);

    const logoUrl = '/icons/briar-icon.svg';
    const favicon = document.querySelector('link[rel="icon"]') ?? document.createElement('link');
    favicon.setAttribute('rel', 'icon');
    favicon.setAttribute('type', 'image/svg+xml');
    favicon.setAttribute('href', logoUrl);
    if (!favicon.parentNode) document.head.appendChild(favicon);

    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') ?? document.createElement('link');
    appleIcon.setAttribute('rel', 'apple-touch-icon');
    appleIcon.setAttribute('href', '/icons/briar-icon.svg');
    if (!appleIcon.parentNode) document.head.appendChild(appleIcon);
  }, []);

  return <GenesisAuth><AppRoutes /></GenesisAuth>;
}
