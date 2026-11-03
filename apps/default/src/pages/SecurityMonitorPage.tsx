import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import HouseShell from '@/components/HouseShell';

type Summary = {windowHours:number;adminRequests:number;deniedAdminRequests:number;adminServerErrors:number};
export default function SecurityMonitorPage() {
  const [identity,setIdentity]=useState('');
  const [summary,setSummary]=useState<Summary|null>(null);
  const [token,setToken]=useState('');
  const [code,setCode]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const refresh=async()=>{
    const session=await fetch('/api/admin/session',{credentials:'same-origin',cache:'no-store'});
    if(!session.ok){setIdentity('');setSummary(null);return;}
    const data=await session.json();
    if(data.admin?.role!=='security_monitor'){setIdentity('');setSummary(null);setError('This page is reserved for security monitor accounts.');return;}
    setIdentity(String(data.admin.label||'Security monitor'));
    const response=await fetch('/api/admin/security-summary',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok){setSummary(null);throw new Error('Security summary is unavailable.');}
    setSummary(await response.json());
  };
  useEffect(()=>{void refresh().catch(()=>setError('Could not load security summary.'));},[]);
  const login=async(event:FormEvent)=>{
    event.preventDefault();setBusy(true);setError('');
    try{
      const response=await fetch('/api/admin/session',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{Authorization:'Bearer '+token,'X-Admin-TOTP':code}});
      setToken('');setCode('');
      if(!response.ok)throw new Error('Sign in failed. Verify your credentials and authenticator code.');
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Sign in failed.');}
    finally{setBusy(false);}
  };
  const signOut=async()=>{
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/admin/session',{method:'DELETE',credentials:'same-origin'});
      if(!response.ok)throw new Error('Sign out failed.');
      setIdentity('');setSummary(null);
    }catch(e){setError(e instanceof Error?e.message:'Sign out failed.');}
    finally{setBusy(false);}
  };
  return <HouseShell><main className="mx-auto max-w-4xl px-5 py-12">
    <Link to="/" className="text-sm underline">House of Briar</Link>
    <p className="mt-8 text-xs font-semibold uppercase tracking-[.2em] text-primary">Restricted staff access</p>
    <h1 className="mt-2 font-serif text-4xl">Security Monitor</h1>
    <p className="mt-3 text-sm text-muted-foreground">Read-only administrator activity summary. This is not a comprehensive intrusion detection system.</p>
    {error&&<p role="alert" className="mt-5 rounded-xl border border-destructive/40 p-4 text-sm">{error}</p>}
    {!identity?<form onSubmit={login} className="mt-8 max-w-md space-y-4 rounded-2xl border border-border bg-card p-6">
      <label className="block text-sm">Assigned security token<input type="password" autoComplete="off" required value={token} onChange={e=>setToken(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"/></label>
      <label className="block text-sm">Authenticator code (if required)<input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"/></label>
      <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-primary px-6 text-primary-foreground">{busy?'Signing in…':'Sign in'}</button>
    </form>:<div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Signed in as <strong>{identity}</strong></p><div className="flex gap-3"><button disabled={busy} onClick={()=>void refresh().catch(()=>setError('Could not refresh security summary.'))} className="rounded-full border border-border px-4 py-2 text-sm">Refresh</button><button disabled={busy} onClick={()=>void signOut()} className="rounded-full border border-border px-4 py-2 text-sm">Sign out</button></div></div>
      {summary&&<><h2 className="mt-9 font-serif text-2xl">Last {summary.windowHours} hours</h2><div className="mt-4 grid gap-4 sm:grid-cols-3">{[
        ['Admin requests',summary.adminRequests],['Denied admin requests',summary.deniedAdminRequests],['Admin server errors',summary.adminServerErrors]
      ].map(([label,value])=><article key={String(label)} className="rounded-2xl border border-border bg-card p-5"><p className="text-3xl font-semibold tabular-nums">{value}</p><p className="mt-2 text-sm text-muted-foreground">{label}</p></article>)}</div><p className="mt-5 text-sm text-muted-foreground">Counts include recorded authenticated administrator requests only. A zero count does not prove that no security incident occurred. Contact the owner to investigate unexpected activity.</p></>}
    </div>}
  </main></HouseShell>;
}
