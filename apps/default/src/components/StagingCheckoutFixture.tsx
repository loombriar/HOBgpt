import {useEffect,useState} from 'react';

export default function StagingCheckoutFixture({onCreated}:{onCreated:()=>void}) {
  const [enabled,setEnabled]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{let active=true;void fetch('/api/admin/staging/checkout-fixture',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(p=>{if(active)setEnabled(p?.enabled===true);}).catch(()=>{});return()=>{active=false;};},[]);
  if(!enabled)return null;
  const prepare=async()=>{
    setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/admin/staging/checkout-fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmTestOnly:confirmed})});
      const result=await response.json();
      if(!response.ok)throw new Error(result?.error?.message||'Test listing could not be prepared.');
      setMessage(result.reused?'Existing test listing retained. Review its inventory and status before testing.':'Test listing created for $5. Review and approve it below before testing checkout.');
      onCreated();
    }catch(error){setMessage(error instanceof Error?error.message:'Test listing could not be prepared.');}
    finally{setBusy(false);}
  };
  return <section className="mt-6 rounded-3xl border border-border bg-card p-6" aria-labelledby="staging-checkout-heading">
    <h2 id="staging-checkout-heading" className="font-serif text-2xl">Staging checkout test</h2>
    <p className="mt-2 text-sm text-muted-foreground">Prepare one clearly labeled $5 test listing under the existing test seller. Previous orders and supplier drafts stay intact. Approval still requires the seller’s current terms and Stripe verification.</p>
    <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>This is a disposable staging test. No physical item will ship and only Stripe test payments may be used.</label>
    <button type="button" disabled={!confirmed||busy} onClick={()=>void prepare()} className="mt-4 min-h-11 rounded-full border border-border px-5 text-sm disabled:opacity-50">{busy?'Preparing…':'Prepare staging test listing'}</button>
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
