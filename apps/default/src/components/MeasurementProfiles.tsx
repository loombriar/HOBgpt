import { useEffect, useState } from 'react';

export type MeasurementProfile={id:string;label:string;bust:string;waist:string;hips:string;height:string;notes:string};
export const MEASUREMENT_PROFILES_KEY='house-of-briar:measurement-profiles';
let sessionProfiles:MeasurementProfile[]=[];
export function loadMeasurementProfiles(){return sessionProfiles.map(p=>({...p}));}
export function clearLegacyMeasurementProfiles(){try{localStorage.removeItem(MEASUREMENT_PROFILES_KEY);}catch{/* unavailable */}}
const notify=(profiles:MeasurementProfile[])=>{sessionProfiles=profiles;window.dispatchEvent(new Event('house-of-briar-measurements'));};
const blank=()=>({label:'',bust:'',waist:'',hips:'',height:'',notes:''});
const errorMessage=(body:any,fallback:string)=>body?.error?.message||fallback;
export default function MeasurementProfiles(){
 const [profiles,setProfiles]=useState<MeasurementProfile[]>([]);
 const [draft,setDraft]=useState(blank);
 const [status,setStatus]=useState('Loading saved profiles…');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  clearLegacyMeasurementProfiles();
  let active=true;
  fetch('/api/customer/measurements',{credentials:'same-origin',cache:'no-store'}).then(async response=>{
   const body=await response.json();
   if(!response.ok)throw new Error(response.status===401?'Sign in to your customer account to save measurements.':errorMessage(body,'Unable to load measurements.'));
   if(active){setProfiles(body.profiles);notify(body.profiles);setStatus('');}
  }).catch(error=>{if(active){notify([]);setProfiles([]);setStatus(error.message);}});
  return()=>{active=false;notify([]);};
 },[]);
 const save=async()=>{
  if(!draft.label.trim()||busy)return;
  setBusy(true);setStatus('');
  try{
   const response=await fetch('/api/customer/measurements',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
   const body=await response.json();if(!response.ok)throw new Error(errorMessage(body,'Could not save profile.'));
   const next=[...profiles,body.profile];setProfiles(next);notify(next);setDraft(blank());
  }catch(error){setStatus(error instanceof Error?error.message:'Could not save profile.');}finally{setBusy(false);}
 };
 const remove=async(id:string)=>{
  if(busy)return;setBusy(true);setStatus('');
  try{
   const response=await fetch('/api/customer/measurements/'+encodeURIComponent(id),{method:'DELETE',credentials:'same-origin'});
   const body=await response.json();if(!response.ok)throw new Error(errorMessage(body,'Could not delete profile.'));
   const next=profiles.filter(p=>p.id!==id);setProfiles(next);notify(next);
  }catch(error){setStatus(error instanceof Error?error.message:'Could not delete profile.');}finally{setBusy(false);}
 };
 return <section className="mb-8 rounded-3xl border border-border bg-card p-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Visitor’s Suite</p><h2 className="mt-2 font-serif text-3xl">Saved measurements</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in to store up to 20 measurement profiles securely in your account. Profiles can be deleted here and are shared with a designer only when you submit a specific request. Do not save measurements for someone else without their permission.</p>{status&&<p role="status" className="mt-3 text-sm text-muted-foreground">{status}</p>}<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input aria-label="Profile name" placeholder="Profile name" value={draft.label} onChange={e=>setDraft({...draft,label:e.target.value})} className="min-h-11 rounded-xl border border-border bg-background px-3"/>{(['bust','waist','hips','height'] as const).map(k=><input key={k} aria-label={k} placeholder={k[0].toUpperCase()+k.slice(1)+' (in)'} inputMode="decimal" value={draft[k]} onChange={e=>setDraft({...draft,[k]:e.target.value})} className="min-h-11 rounded-xl border border-border bg-background px-3"/>)}<textarea aria-label="Fit notes" placeholder="Optional fit notes" value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} className="rounded-xl border border-border bg-background px-3 py-3 sm:col-span-2"/><button type="button" disabled={busy} onClick={save} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">Save measurement profile</button></div>{profiles.length>0&&<div className="mt-6 grid gap-3 sm:grid-cols-2">{profiles.map(p=><div key={p.id} className="rounded-2xl border border-border p-4"><div className="flex justify-between gap-3"><div><p className="font-medium">{p.label}</p><p className="mt-1 text-xs text-muted-foreground">Bust {p.bust||'—'} · Waist {p.waist||'—'} · Hips {p.hips||'—'} · Height {p.height||'—'}</p>{p.notes&&<p className="mt-2 text-xs text-muted-foreground">{p.notes}</p>}</div><button type="button" disabled={busy} onClick={()=>remove(p.id)} className="text-xs text-destructive">Remove</button></div></div>)}</div>}</section>;
}
