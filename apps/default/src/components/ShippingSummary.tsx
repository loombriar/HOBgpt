import { dispatchEstimate, shippingMoney, type ShippingQuote } from '@/lib/shipping';
export default function ShippingSummary({quote,error=''}:{quote:ShippingQuote|null;error?:string}) {
  return <section aria-live="polite" className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
    <h3 className="font-semibold">US delivery</h3>
    {error ? <p role="alert">{error}</p> : !quote ? <p>Checking your order…</p> : <>
      <p>Pieces and gift wrapping after designer discounts: {shippingMoney(quote.merchandiseCents)}</p>
      {quote.designers.map(designer=><p key={designer.designerId}>{designer.designerName}: {designer.shippingReady ? designer.shippingCents===0?'Free US delivery':shippingMoney(designer.shippingCents) : 'Shipping price not set — checkout unavailable'}</p>)}
      {quote.items.map(item=><p key={item.id} className="text-xs text-muted-foreground">{item.title}: {dispatchEstimate(item.handlingDaysMin,item.handlingDaysMax)}</p>)}
      {quote.shippingReady && quote.totalBeforeTaxCents!=null && <p className="font-semibold">Total before tax: {shippingMoney(quote.totalBeforeTaxCents)}</p>}
    </>}
    <p className="text-xs text-muted-foreground">Tax calculation is not enabled in this checkout. Designers ship separately. Preparation time excludes carrier transit; delivery dates are not guaranteed.</p>
    <a href="/shipping.html" className="underline">Shipping &amp; delivery details</a>
  </section>;
}
