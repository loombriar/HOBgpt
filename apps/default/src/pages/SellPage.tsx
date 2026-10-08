import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from '@/lib/icons';
import HouseShell from '@/components/HouseShell';
import { MARKET_CATEGORIES } from '@/lib/marketplace';

export default function SellPage() {
  const [form,setForm]=useState({email:'',displayName:'',brandName:'',categories:[] as string[],sellerTermsAccepted:false,sellerTermsVersion:'2026-10-06'});
  const [message,setMessage]=useState('');
  const [signupId,setSignupId]=useState('');
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
      setSignupId(data.signup.id);
      setMessage('Designer sign up complete. Sign in with this email to open your Designer Studio and set up payouts.');
    }catch(error){
      setMessage(error instanceof Error?error.message:'Your designer sign up could not be completed.');
    }finally{
      setLoading(false);
    }
  };

  const field='mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

  return <HouseShell>
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft size={16}/> Home</Link>
      <section className="relative mt-10 overflow-hidden rounded-[2rem] border border-primary/20 bg-card px-6 py-12 shadow-sm sm:px-12 sm:py-16" aria-labelledby="founding-designer-heading">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">An invitation to independent fashion makers</p>
          <h1 id="founding-designer-heading" className="mt-5 font-serif text-5xl leading-tight sm:text-6xl">Become a Founding Designer.</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">Your work deserves more than a listing. Join House of Briar, a marketplace made to celebrate original clothing, accessories, and the people who create them.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#designer-signup" className="inline-flex min-h-12 items-center rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground">Join the House →</a>
            <a href="#how-it-works" className="inline-flex min-h-12 items-center rounded-full border border-border px-7 text-sm font-semibold hover:border-primary">How it works</a>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">Free to sign up · No portfolio or approval process · Original work welcome</p>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="designer-benefits-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Why make a home here?</p>
        <h2 id="designer-benefits-heading" className="mt-3 font-serif text-4xl">A place for the maker behind the piece.</h2>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          <article className="rounded-3xl border border-border bg-card p-6"><p className="font-serif text-4xl text-primary">90% / 10%</p><h3 className="mt-3 font-semibold">Your craft, your earnings</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Designers receive 90% of each sale; House of Briar retains a 10% marketplace fee. Review the seller terms for full payment details.</p></article>
          <article className="rounded-3xl border border-border bg-card p-6"><p className="font-serif text-4xl text-primary">Your story</p><h3 className="mt-3 font-semibold">A storefront with personality</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Create a designer presence where shoppers can discover your original pieces and get to know the creative mind behind them.</p></article>
          <article className="rounded-3xl border border-border bg-card p-6"><p className="font-serif text-4xl text-primary">The first 25</p><h3 className="mt-3 font-semibold">Founding Designer recognition</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">The first 25 eligible designers to join receive a permanent Founding Designer badge. Availability depends on the number already registered.</p></article>
        </div>
      </section>

      <section id="how-it-works" className="mt-14 rounded-3xl border border-border bg-card p-6 sm:p-9" aria-labelledby="designer-steps-heading">
        <h2 id="designer-steps-heading" className="font-serif text-4xl">Your place in the House, in three steps.</h2>
        <ol className="mt-6 grid gap-6 md:grid-cols-3">
          <li><span className="text-sm font-semibold text-primary">01 · Introduce yourself</span><p className="mt-2 text-sm leading-6 text-muted-foreground">Enter your name, brand, email, and the kinds of pieces you create.</p></li>
          <li><span className="text-sm font-semibold text-primary">02 · Open your studio</span><p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in with your email and complete your designer profile and payout setup.</p></li>
          <li><span className="text-sm font-semibold text-primary">03 · Share your work</span><p className="mt-2 text-sm leading-6 text-muted-foreground">Add original designs and start building your corner of the House.</p></li>
        </ol>
      </section>

      <section id="designer-signup" className="mx-auto mt-14 max-w-3xl scroll-mt-24" aria-labelledby="designer-signup-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Your invitation starts here</p>
        <h2 id="designer-signup-heading" className="mt-3 font-serif text-4xl">Ready to join the House?</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">There is no application or approval process. Create your designer profile below, then sign in to your studio when you are ready.</p>
      {signupId ? <section className="mt-10 rounded-3xl border border-primary/20 bg-primary/5 p-7">
        <h2 className="font-serif text-3xl">Welcome to House of Briar.</h2>
        <p role="status" className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
        <p className="mt-4 text-xs text-muted-foreground">Designer sign-up reference: {signupId}</p>
        <Link to="/account" className="mt-6 inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold hover:border-primary hover:text-primary">Go to your account</Link>
      </section> : <form onSubmit={(e)=>void submit(e)} className="mt-10 space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
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
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={form.sellerTermsAccepted} onChange={e=>setForm({...form,sellerTermsAccepted:e.target.checked})}/><span>I have read and agree to the <a href="/rules#seller-terms" target="_blank" rel="noopener noreferrer" className="underline">House of Briar Seller Terms</a> (version {form.sellerTermsVersion}).</span></label>
        {message&&<p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</p>}
        <button disabled={loading||form.categories.length===0} type="submit" className="min-h-12 rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground disabled:opacity-50">{loading?'Joining…':'Join the Designer List'}</button>
        <p className="text-xs leading-5 text-muted-foreground">No application. No portfolio required. Your designer profile is created when you sign up.</p>
      </form>}
      </section>
    </main>
  </HouseShell>;
}
