export type CommerceEventName =
  | 'view_product'
  | 'search'
  | 'add_to_wishlist'
  | 'remove_from_wishlist'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'view_cart'
  | 'begin_checkout'
  | 'checkout_abandoned'
  | 'purchase';

export type CommerceEvent = {
  event: CommerceEventName;
  listingId?: string;
  listingName?: string;
  designer?: string;
  value?: number;
  currency?: string;
  query?: string;
  resultCount?: number;
  itemCount?: number;
  orderId?: string;
  source?: string;
};

const SESSION_KEY = 'house-of-briar:analytics-session';

function sessionId() {
  if (typeof window === 'undefined') return '';
  let id = window.sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function attribution() {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    referrer: document.referrer || undefined,
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
  };
}

/**
 * First-party, non-blocking commerce telemetry.
 * The server intentionally accepts only an allowlisted event schema and does not
 * require advertising cookies. Third-party marketing pixels should remain behind
 * the site's consent controls.
 */
export function trackCommerceEvent(event: CommerceEvent) {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify({
    ...event,
    sessionId: sessionId(),
    path: window.location.pathname,
    ...attribution(),
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/events', new Blob([payload], { type: 'application/json' }));
      return;
    }
    void fetch('/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    });
  } catch {
    // Analytics must never interrupt shopping.
  }
}
