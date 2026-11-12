import { dispatchEstimate, shippingMoney, type ShippingQuote } from '@/lib/shipping';
export default function ShippingSummary({quote,error='',digitalOnly=false,digitalItemIds=[]}:{quote:ShippingQuote|null;error?:string;digitalOnly?:boolean;digitalItemIds?:string[]}) {
  return <section aria-live="polite" className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
    <h3 className="font-semibold">{digitalOnly ? 'Digital delivery' : 'US delivery'}</h3>
    {error ? <p role="alert">{error}</p> : !quote ? <p>Checking your order…</p> : <>
      <p>Pieces and gift wrapping after designer discounts: {shippingMoney(quote.merchandiseCents)}</p>
      {!digitalOnly && quote.designers.map(designer=><p key={designer.designerId}>{designer.designerName}: {designer.shippingReady ? designer.shippingCents===0?'Free US delivery':shippingMoney(designer.shippingCents) : 'Shipping price not set — checkout unavailable'}</p>)}
      {quote.items.filter(item => !digitalItemIds.includes(item.id)).map(item=><p key={item.id} className="text-xs text-muted-foreground">{item.title}: {dispatchEstimate(item.handlingDaysMin,item.handlingDaysMax)}</p>)}
      {quote.shippingReady && quote.totalBeforeTaxCents!=null && <p className="font-semibold">Total before tax: {shippingMoney(quote.totalBeforeTaxCents)}</p>}
    </>}
    <p className="text-xs text-muted-foreground">Tax calculation is not enabled in this checkout. {digitalOnly ? 'Downloads become available after payment is verified. No shipping is required.' : 'Designers ship physical items separately. Preparation time excludes carrier transit; delivery dates are not guaranteed.'}</p>
    <a href="/shipping.html" className="underline">Shipping &amp; delivery details</a>
  </section>;
}
