import {useEffect, useState, type FormEvent} from 'react';

type Rate={id:string;costCents:number;carrier:string;service:string;remainingCents:number;affordable:boolean};
type Label={status:string;costCents:number;labelUrl?:string;trackingNumber?:string;carrier?:string;message?:string|null;cancelStatus?:string|null;test:boolean};
const money=(cents:number)=>`$${(cents/100).toFixed(2)}`;
export default function PostageLabel({orderId,earningsCents,onChanged}:{orderId:string;earningsCents:number;onChanged?:()=>Promise<void>}) {
  const [enabled,setEnabled]=useState(false);
  const [testMode,setTestMode]=useState(true);
  const [label,setLabel]=useState<Label|null>(null);
  const [rates,setRates]=useState<Rate[]>([]);
  const [quoteId,setQuoteId]=useState('');
  const [selected,setSelected]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [cancelConfirmed,setCancelConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const base=`/api/orders/${encodeURIComponent(orderId)}/postage`;
  useEffect(()=>{
    let active=true;
    fetch(base,{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(data=>{
      if(active&&data){setEnabled(data.enabled);setLabel(data.label);setTestMode(data.test!==false);}
    }).catch(()=>{});
    return ()=>{active=false;};
  },[base]);
  const request=async(path:string,body:unknown)=>{
    const response=await fetch(base+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();
    if(data.label)setLabel(data.label);
    if(!response.ok)throw new Error(data?.error?.message||'This label request needs review.');
    await onChanged?.();
    return data;
  };
  const getRates=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setBusy(true);setMessage('');setRates([]);setConfirmed(false);setSelected('');
    const form=new FormData(event.currentTarget);
    const from=Object.fromEntries(['name','street1','street2','city','state','zip','email','phone'].map(k=>[k,form.get(k)]));
    const parcel=Object.fromEntries(['length','width','height','weight'].map(k=>[k,form.get(k)]));
    try {const data=await request('/rates',{from,parcel});setRates(data.rates);setQuoteId(data.quoteId);}
    catch(e){setMessage(e instanceof Error?e.message:'Rates could not be loaded.');}
    finally{setBusy(false);}
  };
  const createLabel=async()=>{
    setBusy(true);setMessage('');
    try{await request('/label',{quoteId,rateId:selected,confirmDeduction:confirmed});setRates([]);}
    catch(e){setMessage(e instanceof Error?e.message:'The label needs review.');}
    finally{setBusy(false);}
  };
  const correct=async()=>{
    setBusy(true);setMessage('');
    try{const data=await request('/correct',{});setLabel(null);setRates([]);setSelected('');setQuoteId('');setConfirmed(false);setCancelConfirmed(false);setMessage(data.message);}catch(e){setMessage(e instanceof Error?e.message:'This label is still held.');}finally{setBusy(false);}
  };
  const reconcile=async()=>{
    setBusy(true);setMessage('');
    try{await request('/reconcile',{});}catch(e){setMessage(e instanceof Error?e.message:'The label could not be checked.');}finally{setBusy(false);}
  };
  const cancel=async(checkOnly=false)=>{
    setBusy(true);setMessage('');
    try{await request(checkOnly?'/cancel/status':'/cancel',{confirmCancellation:cancelConfirmed});}catch(e){setMessage(e instanceof Error?e.message:'Cancellation needs review.');}finally{setBusy(false);}
  };
  if(!enabled&&!label)return null;
  const sample=testMode;
  const choice=rates.find(r=>r.id===selected);
  return <details className="mt-4 rounded-xl border border-border p-4"><summary className="cursor-pointer font-medium">Postage &amp; print label · {sample?'test mode':'live shipping'}</summary>
    <p className="mt-3 text-sm text-muted-foreground">{sample?'Try the shipping process with a sample label. This label cannot be used for delivery. No real postage is charged or deducted, and payouts stay held.':'Buy real postage for this order. The exact label price is deducted from your designer earnings. Confirm your sender and parcel details before purchase.'}</p>
    {label?<div className="mt-4 text-sm">
      <p>{label.status==='cancelled'?sample?'Sample postage refunded':'Postage refunded':label.status==='ready'?sample?'Sample postage deduction':'Postage deduction':sample?'Reserved sample postage':'Reserved postage'}: {money(label.costCents)}</p>
      <p>{label.status==='cancelled'?sample?'Sample earnings after postage refund':'Earnings after postage refund':label.status==='ready'?sample?'Earnings after sample postage':'Earnings after postage':sample?'Sample earnings if the label succeeds':'Earnings if the label succeeds'}: {money(earningsCents-(label.status==='cancelled'?0:label.costCents))}</p>
      {label.status==='cancelled'?<p role="status" className="mt-3">Carrier refund confirmed. This label is cancelled and cannot be used.</p>:label.cancelStatus&&label.cancelStatus!=='rejected'?<><p role="status" className="mt-3">Cancellation is pending carrier confirmation. Postage is still deducted and payout remains held. Do not use this label.</p><button type="button" disabled={busy} onClick={()=>void cancel(true)} className="mt-3 min-h-11 rounded-full border border-border px-5 font-semibold">Check cancellation status</button></>:label.status==='ready'?<>
        <p className="mt-2">{label.carrier} · {label.trackingNumber}</p><a className="mt-3 inline-block rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground" href={label.labelUrl} target="_blank" rel="noopener noreferrer">{sample?'Open sample label PDF to print ↗':'Open shipping label PDF to print ↗'}</a>
        {label.cancelStatus==='rejected'?<p className="mt-3">The carrier rejected the cancellation. Postage remains deducted. Contact House support for help.</p>:<div className="mt-4 border-t border-border pt-3"><label className="flex items-start gap-2"><input type="checkbox" checked={cancelConfirmed} disabled={busy} onChange={e=>setCancelConfirmed(e.target.checked)}/><span>This label is unused. Request cancellation and credit the postage only after the carrier confirms the refund.</span></label><button type="button" disabled={busy||!cancelConfirmed} onClick={()=>void cancel()} className="mt-3 min-h-11 rounded-full border border-border px-5 font-semibold disabled:opacity-50">Cancel unused label</button></div>}
      </>:<p role="status" className="mt-2">{label.status==='processing'?'Label request is processing. Refresh this order to check its status.':'Label outcome needs review. Check its status before trying again.'}</p>}
      {label.message&&<p className="mt-2 text-muted-foreground">{label.message}</p>}
      {!['ready','cancelled'].includes(label.status)&&<button type="button" disabled={busy} onClick={()=>void reconcile()} className="mt-3 min-h-11 rounded-full border border-border px-5 font-semibold disabled:opacity-50">{busy?'Checking existing label…':'Check existing label status'}</button>}
      {label.status==='cancelled'&&<button type="button" disabled={busy} onClick={()=>void correct()} className="mt-3 min-h-11 rounded-full border border-border px-5 font-semibold disabled:opacity-50">Create a replacement label</button>}
      {label.status==='provider_error'&&<button type="button" disabled={busy} onClick={()=>void correct()} className="mt-3 min-h-11 rounded-full border border-border px-5 font-semibold disabled:opacity-50">Correct details &amp; get fresh rates</button>}
    </div>:<>
    <form className="mt-4" onSubmit={getRates} onChange={()=>{setRates([]);setConfirmed(false);setSelected('');}}>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold">Your US return address</legend>
        {(['name','street1','street2','city','state','zip','email','phone'] as const).map(key=><label key={key} className="grid gap-1 text-sm">{{name:'Sender name',street1:'Street address',street2:'Apartment / suite (optional)',city:'City',state:'State',zip:'ZIP code',email:'Sender email',phone:'Sender phone'}[key]}<input className="min-h-11 rounded-lg border border-border bg-background px-3" name={key} type={key==='email'?'email':key==='phone'?'tel':'text'} required={key!=='street2'} maxLength={150}/></label>)}
      </fieldset>
      <fieldset disabled={busy} className="mt-4 grid grid-cols-2 gap-3"><legend className="mb-3 text-sm font-semibold">Packed parcel</legend>
        {(['length','width','height','weight'] as const).map(key=><label key={key} className="grid gap-1 text-sm">{key[0].toUpperCase()+key.slice(1)} ({key==='weight'?'oz':'in'})<input className="min-h-11 rounded-lg border border-border bg-background px-3" name={key} type="number" min="0.01" step="0.01" max={key==='weight'?1120:108} required/></label>)}
      </fieldset><p className="mt-3 text-xs text-muted-foreground">Delivery address comes from this order. Sender email and phone are required by USPS and shared with the carrier. Include the packaging in the weight.</p>
      <button disabled={busy} className="mt-3 min-h-11 rounded-full border border-border px-5 text-sm font-semibold disabled:opacity-50">{busy?'Checking…':'{sample?'Compare test shipping rates':'Compare shipping rates'}'}</button>
    </form>
    {rates.length>0&&<fieldset disabled={busy} className="mt-4 space-y-3"><legend className="mb-2 text-sm font-semibold">Choose postage</legend>{rates.map(rate=><label key={rate.id} className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"><input type="radio" name={`postage-${orderId}`} checked={selected===rate.id} disabled={!rate.affordable} onChange={()=>{setSelected(rate.id);setConfirmed(false);}}/><span>{rate.carrier} · {rate.service} · {money(rate.costCents)}<span className="mt-1 block text-muted-foreground">{rate.affordable?`Earnings after ${sample?'sample ':''}postage: ${money(rate.remainingCents)}`:'Postage exceeds this order’s earnings. Choose another rate or contact support.'}</span></span></label>)}</fieldset>}
    {choice&&<div className="mt-4 text-sm"><label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/><span>I approve the {sample?'sample ':''}postage deduction of {money(choice.costCents)}. Remaining {sample?'sample ':''}earnings: {money(choice.remainingCents)}. {sample?'No real money will move.':'This purchases a real shipping label and deducts its cost from my payout.'}</span></label><button type="button" disabled={busy||!confirmed} onClick={()=>void createLabel()} className="mt-3 min-h-11 rounded-full bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50">{busy?'Creating label…':'{sample?'Confirm & create sample label':'Confirm & buy shipping label'}'}</button></div>}
    </>}{message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  </details>;
}
