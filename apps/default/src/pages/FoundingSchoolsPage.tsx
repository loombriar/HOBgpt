import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

type Applicant = 'student' | 'school';
export default function FoundingSchoolsPage() {
  const [type, setType] = useState<Applicant>('student');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({name:'',email:'',school:'',portfolio:'',discipline:'fashion',status:'enrolled',graduationDate:''});
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('');
    try {
      const response = await fetch('/api/founding-schools/applications', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({kind:type,...draft,academicStatus:draft.status})
      });
      if (!response.ok) throw new Error('Submission failed. Check your information and try again.');
      setSubmitted(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Submission failed'); }
  }
  return <main style={{minHeight:'85vh',background:'#10251e',color:'#f4e8d1',padding:'4rem 1.5rem',fontFamily:'Georgia,serif'}}>
    <div style={{maxWidth:820,margin:'auto'}}>
      <p style={{letterSpacing:3,color:'#d4b879',textTransform:'uppercase',fontSize:12}}>House of Briar · Creative education</p>
      <h1 style={{fontSize:'clamp(2.2rem,6vw,4rem)',lineHeight:1.1}}>Founding Schools Initiative</h1>
      <p style={{fontSize:19,lineHeight:1.6}}>A place for emerging fashion designers, artists, and makers to build independent creative businesses.</p>
      <section style={{border:'1px solid #94794e',borderRadius:16,padding:24,margin:'2rem 0'}}>
        <h2 style={{fontSize:32,margin:'0 0 8px'}}>5% commission for your first year</h2>
        <p>Approved current students and graduates within 24 months of graduation pay 5% for their first 12 months after creator activation, then the standard 7% rate applies automatically. Payment processing fees are separate. Creators manage their own inventory, customer service, and shipping.</p>
        <p>No listing fees, monthly membership charges, or required advertising. School partnerships are free and optional. Standard creator commission is 7%.</p>
      </section>
      <div role="group" aria-label="Application type" style={{display:'flex',gap:12,marginBottom:20}}>
        <button type="button" onClick={()=>{setType('student');setSubmitted(false)}} aria-pressed={type==='student'} style={{padding:'12px 20px',background:type==='student'?'#d4b879':'transparent',color:type==='student'?'#10251e':'#f4e8d1',border:'1px solid #d4b879',borderRadius:8}}>Student or graduate</button>
        <button type="button" onClick={()=>{setType('school');setSubmitted(false)}} aria-pressed={type==='school'} style={{padding:'12px 20px',background:type==='school'?'#d4b879':'transparent',color:type==='school'?'#10251e':'#f4e8d1',border:'1px solid #d4b879',borderRadius:8}}>School representative</button>
      </div>
      {submitted ? <section role="status" style={{padding:20,border:'1px solid #d4b879',borderRadius:10}}><h2>Application received</h2><p>Your application is pending review. No commission is assigned until approval. For questions contact <a style={{color:'#d4b879'}} href="mailto:thee.house.of.briar@gmail.com">thee.house.of.briar@gmail.com</a>.</p><button onClick={()=>setSubmitted(false)}>Edit preview</button></section> :
      <form onSubmit={submit} style={{display:'grid',gap:16,maxWidth:600}}>
        <h2>{type==='student'?'Student application':'School partnership inquiry'}</h2>
        <label>{type==='student'?'Full name':'Representative name'}<input required maxLength={120} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} style={inputStyle}/></label>
        <label>Email<input required type="email" maxLength={254} value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})} style={inputStyle}/></label>
        <label>School name<input required maxLength={160} value={draft.school} onChange={e=>setDraft({...draft,school:e.target.value})} style={inputStyle}/></label>
        {type==='student'&&<><label>Creative discipline<select value={draft.discipline} onChange={e=>setDraft({...draft,discipline:e.target.value})} style={inputStyle}><option value="fashion">Fashion & apparel</option><option value="art">Art & illustration</option><option value="jewelry">Jewelry & accessories</option><option value="handmade">Handcrafted goods</option><option value="other">Other</option></select></label>
        <label>Academic status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})} style={inputStyle}><option value="enrolled">Currently enrolled</option><option value="graduate">Graduated within 24 months</option></select></label>
        {draft.status==='graduate'&&<label>Graduation date<input required type="date" value={draft.graduationDate} onChange={e=>setDraft({...draft,graduationDate:e.target.value})} style={inputStyle}/></label>}
        <label>Portfolio URL (optional)<input type="url" value={draft.portfolio} onChange={e=>setDraft({...draft,portfolio:e.target.value})} style={inputStyle}/></label></>}
        <p style={{fontSize:13}}>Applications require review and eligibility verification. Do not submit identity documents here. Schools are not required to participate for students to apply.</p>
        {error && <p role="alert">{error}</p>}
        <button type="submit" style={{padding:14,background:'#d4b879',color:'#10251e',border:0,borderRadius:8,fontWeight:700}}>Submit application</button>
      </form>}
      <p style={{marginTop:32}}><Link to="/sell" style={{color:'#d4b879'}}>Explore standard creator registration</Link></p>
    </div>
  </main>;
}
const inputStyle={display:'block',width:'100%',boxSizing:'border-box' as const,marginTop:8,padding:12,borderRadius:8,border:'1px solid #94794e',background:'#f9f5ec',color:'#10251e',fontSize:16};
