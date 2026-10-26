import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from '@/lib/icons';
import HouseShell from '@/components/HouseShell';
import { MARKET_CATEGORIES } from '@/lib/marketplace';

export default function SellPage() {
  const [form,setForm]=useState({email:'',displayName:'',brandName:'',categories:[] as string[],sellerTermsAccepted:false,sellerTermsVersion:'2026-10-17-live-postage'});
  const [message,setMessage]=useState('');
  const [requestId,setRequestId]=useState('');
  const [code,setCode]=useState('');
  const [loading,setLoading]=useState(false);

  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try{
      const response=await fetch('/api/designer-applications',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(form)
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data?.error?.message||'Your designer sign up could not be completed.');
      setRequestId(data.requestId);
      setMessage(data.message);
    }catch(error){
      setMessage(error instanceof Error?error.message:'Your designer sign up could not be completed.');
    }finally{
      setLoading(false);
    }
  };

  const verify=async(event:FormEvent)=>{
    event.preventDefault();setLoading(true);setMessage('');
    try{
      const response=await fetch('/api/designer/verify-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,code})});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error?.message||'Email verification failed.');
      window.location.assign('/designers/room');
    }catch(error){setMessage(error instanceof Error?error.message:'Email verification failed.');}finally{setLoading(false);}
  };

  const field='mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

  return <HouseShell>
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft size={16}/> Home</Link>
      <section className="relative mt-10 overflow-hidden rounded-[2rem] border border-primary/20 bg-card px-6 py-12 shadow-sm sm:px-12 sm:py-16" aria-labelledby="founding-designer-heading">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">An invitation to independent fashion makers</p>
          <h1 id="founding-designer-heading" className="mt-5 font-serif text-5xl leading-tight sm:text-6xl">Why sell with House of Briar?</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">Independent by design. A home for original clothing, your creative process, and the people who want to wear something made by someone—not everyone.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#designer-signup" className="inline-flex min-h-12 items-center rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground">Start your designer profile →</a>
            <a href="#how-it-works" className="inline-flex min-h-12 items-center rounded-full border border-border px-7 text-sm font-semibold hover:border-primary">How it works</a>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">Free to join · No listing fees · No portfolio required</p>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="designer-benefits-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Why make a home here?</p>
        <h2 id="designer-benefits-heading" className="mt-3 font-serif text-4xl">A place for the maker behind the piece.</h2>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          <article className="rounded-3xl border border-border bg-card p-6"><p className="font-serif text-4xl text-primary">93% / 7%</p><h3 className="mt-3 font-semibold">Your craft, your earnings</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Designers retain 93% of qualifying sales before other applicable costs; House of Briar retains a 7% marketplace fee. Verified students and recent graduates can apply for a permanent 5% school rate. Review the seller terms for full payment details.</p></article>
          <article className="rounded-3xl border border-border bg-card p-6"><p className="font-serif text-4xl text-primary">Your story</p><h3 className="mt-3 font-semibold">A storefront with personality</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Create a designer presence where shoppers can discover your original pieces and get to know the creative mind behind them.</p></article>
          <article className="rounded-3xl border border-border bg-card p-6"><p className="font-serif text-4xl text-primary">Free to begin</p><h3 className="mt-3 font-semibold">No listing fees</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Create your profile and draft your pieces at your own pace. The 7% marketplace fee applies to qualifying sales, not to uploading a listing.</p></article>
        </div>
      </section>

      <section id="how-it-works" className="mt-14 rounded-3xl border border-border bg-card p-6 sm:p-9" aria-labelledby="designer-steps-heading">
        <h2 id="designer-steps-heading" className="font-serif text-4xl">Your place in the House, in three steps.</h2>
        <ol className="mt-6 grid gap-6 md:grid-cols-3">
          <li><span className="text-sm font-semibold text-primary">01 · Introduce yourself</span><p className="mt-2 text-sm leading-6 text-muted-foreground">Create your free profile and verify your email. You do not need a portfolio or a designer application.</p></li>
          <li><span className="text-sm font-semibold text-primary">02 · Open your studio</span><p className="mt-2 text-sm leading-6 text-muted-foreground">Tell your story, connect Stripe for payouts, and draft your first piece. You can prepare drafts while payment setup is in progress.</p></li>
          <li><span className="text-sm font-semibold text-primary">03 · Share your work</span><p className="mt-2 text-sm leading-6 text-muted-foreground">Submit your finished listings for review. Approved pieces can go on sale once your selling setup is ready.</p></li>
        </ol>
      </section>

      <section className="mt-10 rounded-3xl border border-border bg-card p-6 sm:p-9" aria-labelledby="designer-delivery-heading">
        <h2 id="designer-delivery-heading" className="font-serif text-3xl">What happens when a piece sells?</h2>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div><h3 className="font-semibold">You cover postage. Customers get free US delivery.</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">Include postage, packaging, materials, and your time in your price. For eligible paid orders, a live label purchased through House is deducted from your earnings only after you confirm its cost; you can also purchase postage separately from a carrier. Live in-app labels may not yet be enabled. Add your preparation time and measurements so shoppers know what to expect.</p></div>
          <div><h3 className="font-semibold">Earnings stay held until shipment tracking is verified.</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">Connect Stripe to verify your seller details and payout account. After a sale, add tracking in your dashboard. Verified shipment tracking is required before earnings can be released; bank processing time may still apply.</p></div>
        </div>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">You retain 93% of qualifying sales before postage and other applicable costs. <a className="underline underline-offset-4" href="/rules#seller-terms">Read the full seller terms →</a> · <a className="underline" href="/founding-schools">Founding Schools Initiative →</a></p>
      </section>

      <section id="designer-signup" className="mx-auto mt-14 max-w-3xl scroll-mt-24" aria-labelledby="designer-signup-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Your invitation starts here</p>
        <h2 id="designer-signup-heading" className="mt-3 font-serif text-4xl">Designer sign up</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">Designer signup is open—no application or portfolio required. Verify your email, then open your designer room to complete your profile and create your first draft. Submit listings for review and connect Stripe to complete your selling setup. Individual listings are reviewed before appearing in the Shop.</p>
      {requestId ? <form onSubmit={e=>void verify(e)} className="mt-10 space-y-5 rounded-3xl border border-border bg-card p-6">
        <p role="status">{message}</p><label className="block text-sm font-medium">Six-digit code from your email<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} className={field}/></label>
        <button disabled={loading} className="min-h-12 rounded-full bg-primary px-6 text-primary-foreground">Verify email and open my room</button>
        <button type="button" disabled={loading} onClick={()=>{setRequestId('');setCode('');setMessage('');}} className="block text-sm underline">Use another email or request a new code</button>
      </form> : <form onSubmit={(e)=>void submit(e)} className="mt-10 space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium">Your name
            <input required maxLength={100} autoComplete="name" value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} className={field}/>
          </label>
          <label className="text-sm font-medium">Designer or brand name
            <input required maxLength={120} autoComplete="organization" value={form.brandName} onChange={e=>setForm({...form,brandName:e.target.value})} className={field}/>
          </label>
        </div>
        <label className="block text-sm font-medium">Email
          <input required type="email" autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className={field}/>
        </label>
        <fieldset>
          <legend className="text-sm font-medium">What do you create?</legend>
          <p className="mt-1 text-xs text-muted-foreground">Choose one or more.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {MARKET_CATEGORIES.map(item=><label key={item} className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm">
              <input type="checkbox" checked={form.categories.includes(item)} onChange={e=>setForm({...form,categories:e.target.checked?[...form.categories,item]:form.categories.filter(value=>value!==item)})}/>
              {item}
            </label>)}
          </div>
        </fieldset>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={form.sellerTermsAccepted} onChange={e=>setForm({...form,sellerTermsAccepted:e.target.checked})}/><span>I have read and agree to the <a href="/rules#seller-terms" target="_blank" rel="noopener noreferrer" className="underline">House of Briar Seller Terms</a>.</span></label>
        {message&&<p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</p>}
        <button disabled={loading||form.categories.length===0} type="submit" className="min-h-12 rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground disabled:opacity-50">{loading?'Joining…':'Email me a verification code'}</button>
        <p className="text-xs leading-5 text-muted-foreground">No application or portfolio required. Your designer profile is created after email verification. Students and recent graduates can separately apply for the 5% school commission through the Founding Schools Initiative; eligibility approval is required and payment processing fees are separate.</p>
      </form>}
      </section>
    </div>
  </HouseShell>;
}
