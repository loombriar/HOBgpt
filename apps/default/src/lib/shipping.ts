import { useEffect, useState } from 'react';
export type ShippingQuote = { shippingReady: boolean; shippingCents: number | null; merchandiseCents: number; totalBeforeTaxCents: number | null; discountCents: number; designers: Array<{designerId:string;designerName:string;shippingCents:number;shippingReady:boolean}>; items:Array<{id:string;title:string;handlingDaysMin:number|null;handlingDaysMax:number|null}> };
export const shippingMoney = (cents:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(cents/100);
export function dispatchEstimate(min:number|null,max:number|null) {
  if(min==null && max==null) return 'Preparation time not provided; ask the designer before ordering.';
  if(min==null) return `Up to ${max} business days of preparation before shipment.`;
  if(max==null) return `At least ${min} business days of preparation before shipment.`;
  return `${min}${max!==min?`–${max}`:''} business days of preparation before shipment.`;
}
export function useShippingQuote(ids:string[], promoCodes:string[] = [], enabled=true) {
  const key=JSON.stringify({items:ids.map(id=>({id,quantity:1})),promoCodes});
  const [state,setState]=useState<{key:string;quote:ShippingQuote|null;error:string}>({key:'',quote:null,error:''});
  useEffect(()=>{
    const controller=new AbortController();
    setState({key,quote:null,error:''});
    if(enabled && ids.length) void fetch('/api/checkout/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:key,signal:controller.signal}).then(async response=>{
      const body=await response.json();if(!response.ok)throw new Error(body.error?.message || 'Shipping could not load.');
      if(!controller.signal.aborted)setState({key,quote:body,error:''});
    }).catch(error=>{if(!controller.signal.aborted)setState({key,quote:null,error:error.message});});
    return ()=>controller.abort();
  },[key,enabled]);
  return state.key===key ? state : {key,quote:null,error:''};
}
