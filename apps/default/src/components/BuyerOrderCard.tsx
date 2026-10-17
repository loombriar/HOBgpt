import {Link} from 'react-router-dom';
import CustomerShipmentStatus from './CustomerShipmentStatus';
import {dispatchEstimate} from '@/lib/shipping';

export type BuyerOrder = {id:string;status:string;currency?:string;subtotalCents:number;createdAt:string;refundStatus?:string|null;items:Array<{listingId:string;title:string;designerName:string;designerId:string;designerUrl:string;lineTotalCents:number;quantity:number;handlingDaysMin?:number|null;handlingDaysMax?:number|null;trackingCarrier?:string|null;trackingNumber?:string|null;trackingStatus?:string|null}>};
const money=(cents:number,currency='usd')=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(cents/100);
export default function BuyerOrderCard({order,onHelp}:{order:BuyerOrder;onHelp?:()=>void}) {
  const reference=order.id.slice(-8).toUpperCase();
  const refunded=order.refundStatus==='succeeded';
  const paymentLabel=refunded?'Refunded':order.refundStatus==='partial'?'Partially refunded':['pending','requires_action'].includes(order.refundStatus||'')?'Refund in progress':order.refundStatus==='failed'?'Refund needs attention':order.status==='paid'?'Payment confirmed':order.status.replaceAll('_',' ');
  return <article aria-label={`Order ${reference}`} className="rounded-2xl border border-border p-4 text-left sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Order {reference}</h3><p className="mt-1 text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()} · {paymentLabel}</p></div><p className="font-semibold tabular-nums">{money(order.subtotalCents,order.currency)}</p></header>
    <div className="mt-4 space-y-3">{order.items.map((item,index)=><section key={`${item.listingId}-${index}`} className="rounded-xl bg-accent/40 p-4"><div className="flex flex-wrap justify-between gap-2"><Link to={`/shop/${encodeURIComponent(item.listingId)}`} className="font-medium hover:underline">{item.title}</Link><p className="text-sm tabular-nums">{money(item.lineTotalCents,order.currency)}</p></div><p className="mt-1 text-xs text-muted-foreground">Made by <Link to={item.designerUrl||`/designers/${encodeURIComponent(item.designerId)}`} className="font-medium underline underline-offset-2">{item.designerName}</Link> · Quantity {item.quantity}</p>
      <p className="mt-3 text-sm"><strong>Preparation:</strong> {item.handlingDaysMin==null&&item.handlingDaysMax==null?'No processing estimate was saved with this order. Contact House support for timing.':dispatchEstimate(item.handlingDaysMin??null,item.handlingDaysMax??null)}</p>
      <p className="mt-1 text-xs text-muted-foreground">Preparation happens before carrier transit. This is not a guaranteed delivery date.</p>
      {refunded?<p className="mt-3 text-sm font-medium">Customer refund confirmed. Contact support about any shipment already in progress.</p>:<CustomerShipmentStatus carrier={item.trackingCarrier} number={item.trackingNumber} status={item.trackingStatus} paid={order.status==='paid'}/>}
    </section>)}</div>
    <footer className="mt-4 border-t border-border pt-3">{onHelp?<button type="button" onClick={onHelp} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">Get help with this order</button>:<a href={`mailto:thee.house.of.briar@gmail.com?subject=${encodeURIComponent(`Help with House of Briar order ${order.id}`)}`} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">Get help with this order</a>}<p className="text-xs text-muted-foreground">Questions about delivery, returns or refunds? Include this order reference when contacting House support.</p></footer>
  </article>;
}
