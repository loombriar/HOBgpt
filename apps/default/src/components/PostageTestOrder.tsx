import {useEffect,useState} from 'react';
export default function PostageTestOrder({onCreated}:{onCreated:()=>Promise<void>}) {
  const [available,setAvailable]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let active=true;
    fetch('/api/my/postage-test-order',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(data=>{if(active)setAvailable(data?.available===true);}).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  if(!available)return null;
  const create=async()=>{
    setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/my/postage-test-order',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error?.message||'The sample order could not be created.');
      setMessage(data.message);await onCreated();
    }catch(e){setMessage(e instanceof Error?e.message:'The sample order could not be created.');}
    finally{setBusy(false);}
  };
  return <div className="mt-5 rounded-2xl border border-border bg-accent/30 p-4 text-sm"><strong>Postage practice · test site only</strong><p className="mt-2 text-muted-foreground">Create one simulated $100 order with $91 in sample earnings. No card charge, stock change, buyer email or payout. Repeating this uses the same order.</p><button type="button" disabled={busy} onClick={()=>void create()} className="mt-3 min-h-11 rounded-full border border-border px-5 font-semibold disabled:opacity-50">{busy?'Preparing sample…':'Create sample postage order'}</button>{message&&<p className="mt-3" role="status">{message}</p>}</div>;
}
