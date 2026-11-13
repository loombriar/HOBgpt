import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import HouseShell from '@/components/HouseShell';
type School={name:string;designerCount:number};
type Designer={id:string;displayName?:string;brandName?:string;bio?:string;portraitUrl?:string|null};
export default function SchoolsPage(){
 const [params,setParams]=useSearchParams();
 const selected=params.get('school')||'';
 const [schools,setSchools]=useState<School[]>([]);
 const [designers,setDesigners]=useState<Designer[]>([]);
 const [query,setQuery]=useState('');
 const [error,setError]=useState('');
 useEffect(()=>{let live=true;fetch('/api/schools').then(r=>{if(!r.ok)throw Error('School directory unavailable');return r.json()}).then(data=>{if(live)setSchools(data.schools||[])}).catch(err=>{if(live)setError(err.message)});return()=>{live=false}},[]);
 useEffect(()=>{let live=true;setDesigners([]);if(!selected)return;fetch('/api/schools/designers?school='+encodeURIComponent(selected)).then(r=>{if(!r.ok)throw Error('School collection unavailable');return r.json()}).then(data=>{if(live)setDesigners(data.designers||[])}).catch(err=>{if(live)setError(err.message)});return()=>{live=false}},[selected]);
 return <HouseShell><main className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
 <p className="text-xs font-semibold uppercase tracking-[.24em] text-primary">House of Briar / Emerging talent</p>
 <h1 className="mt-4 font-serif text-5xl">Discover designers by school</h1>
 <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">Explore independent designers who have chosen to share their school affiliation. Participation is voluntary; a school listing does not imply an official partnership or school endorsement.</p>
 {error&&<p role="alert" className="mt-6">{error}</p>}
 {selected?<><button type="button" onClick={()=>setParams({})} className="mt-8 min-h-11 text-primary underline">All schools</button><h2 className="mt-4 font-serif text-3xl">{selected}</h2><p className="mt-2 text-muted-foreground">{designers.length} participating {designers.length===1?'designer':'designers'}</p><div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{designers.map(d=><Link key={d.id} to={'/designers/'+encodeURIComponent(d.id)} className="overflow-hidden rounded-2xl border border-border bg-card"><div className="aspect-[4/3] bg-muted">{d.portraitUrl&&<img src={d.portraitUrl} alt="" className="size-full object-cover"/>}</div><div className="p-5"><h3 className="font-serif text-2xl">{d.brandName||d.displayName||'Independent designer'}</h3><p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{d.bio}</p></div></Link>)}</div>{designers.length===0&&<p className="mt-8">No designers are currently sharing this school affiliation.</p>}</>:<><label className="mt-8 block max-w-lg text-sm font-medium">Search schools<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="School name" className="mt-2 min-h-12 w-full rounded-xl border border-border bg-card px-4"/></label><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{schools.filter(s=>s.name.toLowerCase().includes(query.toLowerCase())).map(s=><button key={s.name} type="button" onClick={()=>setParams({school:s.name})} className="min-h-32 rounded-2xl border border-border bg-card p-6 text-left hover:border-primary"><h2 className="font-serif text-2xl">{s.name}</h2><p className="mt-3 text-sm text-muted-foreground">{s.designerCount} participating {s.designerCount===1?'designer':'designers'}</p></button>)}</div>{schools.length===0&&!error&&<p className="mt-8 text-muted-foreground">School collections will appear when designers choose to share their affiliation.</p>}</>}
 <p className="mt-10 text-sm text-muted-foreground">Are you a designer? <Link to="/account" className="underline">Manage your school visibility in your profile.</Link></p>
 </main></HouseShell>;
}
