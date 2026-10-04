import { useState } from 'react';
import { Send } from '@/lib/icons';
import { submitForm } from '@/lib/genesis-flows';
import { PRODUCT_INQUIRY_FLOW_ID } from '@/lib/marketplace';

type InquiryFormProps = {
  productName: string;
  productId?: string;
  designerName?: string;
};

export default function InquiryForm({ productName, productId = '', designerName = 'the designer' }: InquiryFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [bust, setBust] = useState('');
  const [waist, setWaist] = useState('');
  const [hips, setHips] = useState('');
  const [height, setHeight] = useState('');
  const [request, setRequest] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('sending');
    setError('');
    try {
      await submitForm(PRODUCT_INQUIRY_FLOW_ID, { name, email, product: productName, productId, designer: designerName, bust, waist, hips, height, request, requestType: 'custom-sizing' });
      setStatus('sent');
      setName('');
      setEmail('');
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
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-2 text-sm font-medium"><span>Your name</span><input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
      <label className="space-y-2 text-sm font-medium"><span>Email address</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
    </div>
    <fieldset><legend className="text-sm font-medium">Measurements <span className="font-normal text-muted-foreground">(inches)</span></legend><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label className="text-xs text-muted-foreground">Bust<input required inputMode="decimal" value={bust} onChange={(e)=>setBust(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" /></label>
      <label className="text-xs text-muted-foreground">Waist<input required inputMode="decimal" value={waist} onChange={(e)=>setWaist(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" /></label>
      <label className="text-xs text-muted-foreground">Hips<input required inputMode="decimal" value={hips} onChange={(e)=>setHips(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" /></label>
      <label className="text-xs text-muted-foreground">Height<input required inputMode="decimal" value={height} onChange={(e)=>setHeight(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" /></label>
    </div></fieldset>
    <label className="block space-y-2 text-sm font-medium"><span>Item-specific request</span><textarea required maxLength={800} rows={4} value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Example: Please make this style to my measurements with a slightly longer skirt." className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /><span className="block text-xs font-normal text-muted-foreground">For sizing or customization of {productName} only. No open conversation is created.</span></label>
    {status === 'error' && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <button type="submit" disabled={status === 'sending'} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">{status === 'sending' ? 'Sending request…' : 'Send sizing request'}{status !== 'sending' && <Send size={16} />}</button>
  </form>;
}
