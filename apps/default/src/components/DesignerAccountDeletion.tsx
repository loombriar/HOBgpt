import {useState,type FormEvent} from 'react';

export default function DesignerAccountDeletion({admin=false}:{admin?:boolean}){
 const [email,setEmail]=useState(''),[confirmation,setConfirmation]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function submit(event:FormEvent){
  event.preventDefault();
  if(!window.confirm(`Permanently delete ${admin?email:'your designer account'}? This cannot be undone.`))return;
  await request(admin?'/api/admin/designers/account':'/api/my/designer-account','DELETE',{email,confirmation});
 }
 async function request(url:string,method:string,body:Record<string,string>){
  setBusy(true);setMessage('');
  try{const response=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error?.message||'Account action failed.');
   if(data.deleted&&!admin){window.location.replace('/');return;}
   setMessage(data.deleted?'Designer account permanently deleted.':'Designer suspended and hidden from the public directory.');setConfirmation('');
  }catch(error){setMessage(error instanceof Error?error.message:'Account action failed.');}finally{setBusy(false);}
 }
 return <section className={admin?"my-6 rounded-3xl border border-border bg-card p-6":"mt-4 rounded-xl border border-destructive/25 bg-background p-4 sm:p-5"} aria-label={admin?'Designer account controls':'Permanently delete designer account'}><h2 className={admin?"font-serif text-2xl":"font-serif text-lg"}>{admin?'Designer account controls':'Delete designer account'}</h2><p className="mt-3 text-sm text-muted-foreground">Empty accounts can be permanently deleted. Listings, connected payouts, linked sign-in providers, and shared records require review first. Deletion cannot be undone.{!admin&&' For security, sign in with a fresh email code within the last 15 minutes.'}</p><form onSubmit={submit} className="mt-4 space-y-3">{admin&&<label className="block text-sm">Exact designer account email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 block min-h-11 w-full rounded-xl border border-border bg-background px-3"/></label>}<label className="block text-sm">Type DELETE to confirm<input required pattern="DELETE" autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)} className="mt-2 block min-h-11 w-full rounded-xl border border-border bg-background px-3"/></label><button disabled={busy} className="min-h-11 rounded-full border border-destructive px-5 text-sm text-destructive disabled:opacity-50">Delete designer account permanently</button>{admin&&<button type="button" disabled={busy||!email.trim()} onClick={()=>{if(window.confirm(`Suspend ${email} and hide the public profile?`))void request('/api/admin/designers/suspend','POST',{email});}} className="ml-3 min-h-11 rounded-full border border-border px-5 text-sm disabled:opacity-50">Suspend and hide profile</button>}</form>{message&&<p role="status" className="mt-3 text-sm">{message}</p>}<a href="mailto:thee.house.of.briar@gmail.com" className="mt-4 inline-block text-sm underline">Request account deletion review</a></section>;
}
