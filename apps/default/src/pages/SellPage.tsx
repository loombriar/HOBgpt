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
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft size={16}/> Home</Link>
      <p className="mt-10 text-xs font-semibold uppercase tracking-[0.24em] text-primary">Designer sign up</p>
      <h1 className="mt-3 font-serif text-5xl">Join the House of Briar.</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">Sign up as an independent designer. There is no application or approval process—create your designer profile, then sign in to your studio when you are ready.</p>

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
    </main>
  </HouseShell>;
}
