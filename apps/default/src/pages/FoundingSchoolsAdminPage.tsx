import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
type Application={id:string;kind:'student'|'school';name:string;email:string;school:string;academic_status:string|null;graduation_date:string|null;status:string;created_at:string};
export default function FoundingSchoolsAdminPage(){
 const [applications,setApplications]=useState<Application[]>([]);
 const [role,setRole]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState('');
 const [creatorIds,setCreatorIds]=useState<Record<string,string>>({});
 const [verified,setVerified]=useState<Record<string,boolean>>({});
 async function load(){
   setError('');
   try{
     const session=await fetch('/api/admin/session',{credentials:'same-origin',cache:'no-store'});
     if(!session.ok)throw Error('Sign in through the House of Briar admin dashboard first.');
     const identity=await session.json();
     if(!['owner','operator'].includes(identity.admin?.role))throw Error('Owner or operator access required.');
     setRole(identity.admin.role);
     const response=await fetch('/api/founding-schools/admin/applications',{credentials:'same-origin',cache:'no-store'});
     if(!response.ok)throw Error('Could not load school applications.');
     const payload=await response.json();
     setApplications(payload.applications||[]);
   }catch(err){setError(err instanceof Error?err.message:'Could not load applications');}
 }
 useEffect(()=>{void load();},[]);
 async function action(path:string,body:object,key:string){
   setBusy(key);setError('');setNotice('');
   try{
     const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
     const payload=await response.json().catch(()=>({}));
     if(!response.ok)throw Error(payload.error||'Action failed');
     setNotice('Change saved.');await load();
   }catch(err){setError(err instanceof Error?err.message:'Action failed');}
   finally{setBusy('');}
 }
 return <main style={{maxWidth:1050,margin:'auto',padding:'3rem 1.5rem'}}>
  <p><Link to="/admin">← Back to administration</Link></p>
  <h1>Founding Schools applications</h1>
  <p>Review student eligibility outside this dashboard before approval. Approval alone does not activate a discounted commission.</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {role&&<><p>Signed in as {role}. <button onClick={()=>void load()}>Refresh applications</button></p>
  <div style={{display:'grid',gap:16}}>
   {applications.map(a=><section key={a.id} style={{border:'1px solid #9c916f',borderRadius:12,padding:18}}>
    <h2>{a.name} — {a.school}</h2>
    <p>{a.kind==='student'?'Student / graduate':'School representative'} · {a.status} · {a.created_at.slice(0,10)}</p>
    <p><a href={'mailto:'+a.email}>{a.email}</a>{a.academic_status?' · '+a.academic_status:''}{a.graduation_date?' · Graduated '+a.graduation_date:''}</p>
    {a.status==='pending'&&<div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
     <button disabled={!!busy} onClick={()=>void action('/api/founding-schools/admin/applications/'+encodeURIComponent(a.id)+'/review',{status:'approved'},a.id)}>Approve application</button>
     <button disabled={!!busy} onClick={()=>void action('/api/founding-schools/admin/applications/'+encodeURIComponent(a.id)+'/review',{status:'rejected'},a.id)}>Reject application</button>
    </div>}
    {role==='owner'&&a.kind==='student'&&a.status==='approved'&&<div style={{marginTop:14}}>
      <label>Existing creator ID <input value={creatorIds[a.id]||''} onChange={e=>setCreatorIds(v=>({...v,[a.id]:e.target.value}))}/></label>
      <label style={{display:'block',margin:'12px 0'}}><input type="checkbox" checked={!!verified[a.id]} onChange={e=>setVerified(v=>({...v,[a.id]:e.target.checked}))}/> I have independently verified current enrollment or graduation within 24 months.</label>
      <button disabled={!!busy||!verified[a.id]||!creatorIds[a.id]?.trim()} onClick={()=>void action('/api/founding-schools/admin/applications/'+encodeURIComponent(a.id)+'/assign-creator',{creatorId:creatorIds[a.id].trim(),eligibilityVerified:true},a.id)}>Activate student 5% introductory rate</button>
    </div>}
   </section>)}
   {!applications.length&&<p>No applications to display.</p>}
  </div></>}
 </main>;
}
