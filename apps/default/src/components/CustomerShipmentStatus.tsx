export function shipmentLabel(status?:string|null,trackingNumber?:string|null,paid=true) {
 if(!paid)return 'Payment not confirmed';
 if(status?.startsWith('test_')||/^SHIPPO_/i.test(trackingNumber||''))return 'Sample tracking · No real shipment';
 if(!trackingNumber)return 'Paid · Awaiting shipment';
 return ({delivered:'Delivered',out_for_delivery:'Out for delivery',in_transit:'Shipped · In transit',available_for_pickup:'Ready for pickup',pre_transit:'Tracking added · Awaiting carrier pickup',failure:'Delivery needs attention',return_to_sender:'Returning to sender',cancelled:'Shipment cancelled',canceled:'Shipment cancelled'} as Record<string,string>)[status||''] || 'Tracking added · Waiting for a carrier update';
}
export function carrierTrackingLink(carrier?:string|null,number?:string|null) {
 if(!number)return null;
 const name=(carrier||'').toLowerCase().replace(/[^a-z]/g,'');
 if(name==='usps')return 'https://tools.usps.com/go/TrackConfirmAction?tLabels='+encodeURIComponent(number);
 if(name==='ups')return 'https://www.ups.com/track?tracknum='+encodeURIComponent(number);
 if(name==='fedex')return 'https://www.fedex.com/en-us/tracking.html';
 return null;
}
export default function CustomerShipmentStatus({status,carrier,number,paid}:{status?:string|null;carrier?:string|null;number?:string|null;paid:boolean}) {
 const simulated=Boolean(status?.startsWith('test_')||/^SHIPPO_/i.test(number||''));
 const link=paid&&!simulated?carrierTrackingLink(carrier,number):null;
 const stage=!number?0:status==='delivered'?2:['in_transit','out_for_delivery','available_for_pickup'].includes(status||'')?1:0;
 return <div className="mt-3 text-sm">{paid&&!simulated&&!['failure','return_to_sender','cancelled','canceled'].includes(status||'')&&<ol aria-label="Shipment progress" className="mb-3 grid grid-cols-3 gap-2 text-xs">{['Awaiting shipment','Shipped','Delivered'].map((label,i)=><li key={label} aria-current={i===stage?'step':undefined} className={`border-t-2 pt-2 ${i<=stage?'border-primary font-semibold':'border-border text-muted-foreground'}`}>{label}</li>)}</ol>}<p className="font-medium">{shipmentLabel(status,number,paid)}</p>{number&&<p className="mt-1 break-all text-muted-foreground">Tracking: {carrier} {number}</p>}{link&&<a href={link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center font-medium text-primary underline">Track with {carrier}</a>}{!number&&paid&&<p className="mt-1 text-xs text-muted-foreground">We will email you when the designer adds tracking.</p>}</div>;
}
