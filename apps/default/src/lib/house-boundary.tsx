import { Suspense, type ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useLocation } from 'react-router-dom';

function fallback() {
  return <div role="alert" className="p-6"><h1>Something went wrong</h1><p>Please reload the page and try again.</p><a href="/">Return to House of Briar</a></div>;
}

export function HouseBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary fallbackRender={fallback}><Suspense fallback={<p role="status" className="p-6">Loading…</p>}>{children}</Suspense></ErrorBoundary>;
}

export function HouseSection({ children, name }: { children: ReactNode; name: string }) {
  const location = useLocation();
  return <ErrorBoundary fallbackRender={fallback} resetKeys={[location.pathname, location.search, name]}><Suspense fallback={<p role="status" className="p-6">Loading…</p>}>{children}</Suspense></ErrorBoundary>;
}
