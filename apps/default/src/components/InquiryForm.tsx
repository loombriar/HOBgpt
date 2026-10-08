import { useEffect, useState } from 'react';
import { loadMeasurementProfiles, type MeasurementProfile } from '@/components/MeasurementProfiles';
import { Send } from '@/lib/icons';

type InquiryFormProps = {
  productName: string;
  productId?: string;
  designerName?: string;
};

export default function InquiryForm({ productName, productId = '', designerName = 'the designer' }: InquiryFormProps) {
  const [bust, setBust] = useState('');
  const [waist, setWaist] = useState('');
  const [hips, setHips] = useState('');
  const [height, setHeight] = useState('');
  const [request, setRequest] = useState('');
  const [profiles,setProfiles]=useState<MeasurementProfile[]>([]);
  useEffect(()=>{const refresh=()=>setProfiles(loadMeasurementProfiles());refresh();window.addEventListener('house-of-briar-measurements',refresh);return()=>window.removeEventListener('house-of-briar-measurements',refresh);},[]);
  const applyProfile=(id:string)=>{const p=profiles.find(row=>row.id===id);if(!p)return;setBust(p.bust);setWaist(p.waist);setHips(p.hips);setHeight(p.height);if(p.notes&&!request)setRequest(p.notes);};
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const measurements: Record<string, number> = {};
      for (const [key, raw] of Object.entries({ bust, waist, hips, height })) {
        if (!raw.trim()) continue;
        if (!/^\d+(?:\.\d{1,2})?$/.test(raw.trim()) || Number(raw) <= 0 || Number(raw) > 150) throw new Error('Enter positive measurements up to 150 inches with at most two decimal places.');
        measurements[key] = Number(raw);
      }
      if (!Object.keys(measurements).length) throw new Error('Enter at least one measurement in inches.');
      const response = await fetch(`/api/listings/${encodeURIComponent(productId)}/inquiries`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ measurements, message: request.trim() }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to your Visitor’s Suite or Designer’s Room to send measurements.' : payload.error?.message || 'Your request could not be sent.');
      setStatus('sent');
      setBust('');
      setWaist('');
      setHips('');
      setHeight('');
      setRequest('');
    } catch (reason) {
      setStatus('error');
      setError(reason instanceof Error ? reason.message : 'The note could not be sent. Please try again.');
    }
  };

  if (status === 'sent') {
    return <div className="rounded-2xl border border-primary/30 bg-accent/40 p-6" role="status"><p className="font-serif text-2xl">Your sizing request was sent.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{designerName} received your measurements and item-specific request for {productName}. This submission does not open a direct chat.</p><button type="button" onClick={() => setStatus('idle')} className="mt-5 min-h-11 rounded-full border border-border px-5 text-sm font-medium transition hover:border-primary hover:text-primary">Update request</button></div>;
  }

  return <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
    <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Request custom sizing</p><h2 className="mt-2 font-serif text-3xl">Send measurements to the designer.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Submit measurements and a request for this specific item. This form does not open a buyer–seller chat.</p></div>
    <p className="text-sm text-muted-foreground">Sign in to your Visitor’s Suite or Designer’s Room to send this request. Enter at least one measurement.</p>
    {profiles.length>0&&<label className="block space-y-2 text-sm font-medium"><span>Autofill saved measurements</span><select defaultValue="" onChange={e=>applyProfile(e.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3"><option value="" disabled>Choose a Visitor’s Suite profile</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}
    <fieldset><legend className="text-sm font-medium">Measurements <span className="font-normal text-muted-foreground">(inches)</span></legend><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label className="text-xs text-muted-foreground">Bust<input inputMode="decimal" value={bust} onChange={(e)=>setBust(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" /></label>
      <label className="text-xs text-muted-foreground">Waist<input inputMode="decimal" value={waist} onChange={(e)=>setWaist(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" /></label>
      <label className="text-xs text-muted-foreground">Hips<input inputMode="decimal" value={hips} onChange={(e)=>setHips(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" /></label>
      <label className="text-xs text-muted-foreground">Height<input inputMode="decimal" value={height} onChange={(e)=>setHeight(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" /></label>
    </div></fieldset>
    <label className="block space-y-2 text-sm font-medium"><span>Item-specific request</span><textarea maxLength={500} rows={4} value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Example: Please make this style to my measurements with a slightly longer skirt." className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /><span className="block text-xs font-normal text-muted-foreground">For sizing or customization of {productName} only. No open conversation is created.</span></label>
    {status === 'error' && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <button type="submit" disabled={status === 'sending'} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">{status === 'sending' ? 'Sending request…' : 'Send sizing request'}{status !== 'sending' && <Send size={16} />}</button>
  </form>;
}
