import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import HouseShell from '@/components/HouseShell';

type Designer = { id:string; displayName?:string; brandName?:string; bio?:string; portraitUrl?:string|null; categories?:string[]; productionMethod?:string; location?:string; badges?:Array<{type:string}> };
const moods = ['All styles','Romantic','Gothic','Whimsical','Minimalist','Vintage','Avant-garde','Upcycled'];
export default function DesignersPage() {
  const [designers,setDesigners]=useState<Designer[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [mood,setMood]=useState('All styles');
  const [query,setQuery]=useState('');
  useEffect(()=>{let active=true;fetch('/api/designers',{headers:{Accept:'application/json'}}).then(async response=>{if(!response.ok)throw Error('The designer directory could not load.');return response.json()}).then(data=>{if(!active)return;const list=Array.isArray(data)?data:Array.isArray(data.designers)?data.designers:[];setDesigners(list)}).catch(()=>{if(active)setError('The designer directory is temporarily unavailable.');}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
  const visible=useMemo(()=>designers.filter(d=>{const searchable=[d.brandName,d.displayName,d.bio,d.productionMethod,...(d.categories||[])].join(' ').toLowerCase();return (!query||searchable.includes(query.toLowerCase()))&&(mood==='All styles'||searchable.includes(mood.toLowerCase()));}),[designers,mood,query]);
  return <HouseShell><main className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
    <p className="text-xs font-semibold uppercase tracking-[.24em] text-primary">The people behind the pieces</p>
    <h1 className="mt-4 font-serif text-5xl sm:text-6xl">Meet the Designers</h1>
    <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">Explore independent makers and discover the stories behind their work.</p>
    <div className="mt-9 flex flex-wrap gap-3"><label className="sr-only" htmlFor="designer-search">Search designers</label><input id="designer-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search designers or styles" className="min-h-12 min-w-56 flex-1 rounded-xl border border-border bg-card px-4"/><label className="sr-only" htmlFor="designer-mood">Browse by aesthetic</label><select id="designer-mood" value={mood} onChange={e=>setMood(e.target.value)} className="min-h-12 rounded-xl border border-border bg-card px-4">{moods.map(x=><option key={x}>{x}</option>)}</select></div>
    {loading?<p className="mt-10 text-muted-foreground" role="status">Finding the designers…</p>:error?<p className="mt-10 text-muted-foreground" role="alert">{error}</p>:visible.length===0?<div className="mt-12 rounded-3xl border border-border bg-card p-10"><h2 className="font-serif text-3xl">No designers match just yet.</h2><p className="mt-3 text-muted-foreground">Try a different style, or return as the House grows.</p><Link to="/sell" className="mt-5 inline-block text-primary underline">Are you a designer? Join the House</Link></div>:<div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visible.map(d=><Link key={d.id} to={`/designers/${encodeURIComponent(d.id)}`} className="overflow-hidden rounded-3xl border border-border bg-card transition hover:border-primary"><div className="flex aspect-[4/3] items-center justify-center bg-accent/40">{d.portraitUrl?<img src={d.portraitUrl} alt="" className="h-full w-full object-cover"/>:<span className="font-serif text-5xl text-primary">HB</span>}</div><div className="p-6"><h2 className="font-serif text-2xl">{d.brandName||d.displayName||'Independent designer'}</h2>{d.badges?.some(b=>b.type==='founding_designer')&&<p className="mt-2 text-xs font-semibold text-primary">Founding Designer</p>}<p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{d.bio||'Meet the maker and explore their collection.'}</p><p className="mt-4 text-xs text-muted-foreground">{(d.categories||[]).join(' · ')}</p></div></Link>)}</div>}
  </main></HouseShell>;
}
