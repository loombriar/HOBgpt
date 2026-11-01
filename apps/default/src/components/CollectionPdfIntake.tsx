import { useEffect, useState } from 'react';

/**
 * First-stage local collection intake. PDFs never leave the browser in this component.
 * This does not parse garments or create server-side listings.
 */
export default function CollectionPdfIntake() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [serverStatus, setServerStatus] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [sending, setSending] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [listingCategory, setListingCategory] = useState('');
  const [createdListingIds, setCreatedListingIds] = useState<string[]>([]);
  const [converting, setConverting] = useState(false);
  const [reviewGarments, setReviewGarments] = useState<Array<{id:string;name:string;description:string;price:number|null;sizes:string;colors:string;selected:boolean}>>([]);
  const [entries, setEntries] = useState<Array<{ name: string; price: string; notes: string }>>([]);
  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  function choose(next: File | undefined) {
    setError('');
    setServerStatus('');
    setExtractedText('');
    setDraftId(''); setReviewGarments([]); setCreatedListingIds([]);
    setFile(null);
    setEntries([]);
    if (!next) return;
    if (next.size > 20 * 1024 * 1024) { setError('PDF must be 20 MB or smaller.'); return; }
    if (next.type !== 'application/pdf' || !next.name.toLowerCase().endsWith('.pdf')) {
      setError('Select a PDF catalog.'); return;
    }
    next.slice(0, 5).arrayBuffer().then(bytes => {
      const magic = String.fromCharCode(...new Uint8Array(bytes));
      if (magic !== '%PDF-') { setError('This file does not appear to be a valid PDF.'); return; }
      setFile(next);
    }).catch(() => setError('Could not read this PDF.'));
  }
  return <section aria-label="PDF collection intake" className="rounded-2xl border border-border p-5 space-y-4">
    <h2 className="font-serif text-2xl">Prepare a collection from a PDF</h2>
    <p className="text-sm">Preview your existing lookbook and record garment details before submitting them. Your PDF stays on this device in this early version; no collection is uploaded or published.</p>
    <label className="block">Choose PDF catalog (up to 20 MB)
      <input className="mt-2 block w-full" type="file" accept=".pdf,application/pdf" onChange={event => choose(event.target.files?.[0])} />
    </label>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {url && <>
      <button type="button" disabled={sending} className="rounded-lg border px-4 py-2" onClick={async () => {
        if (!file) return;
        setSending(true); setServerStatus('');
        try {
          const data = new FormData(); data.append('catalog', file);
          const response = await fetch('/api/designer/collection-imports', { method: 'POST', body: data, credentials: 'same-origin' });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || 'PDF validation failed.');
          setExtractedText(typeof result.extractedText === 'string' ? result.extractedText : '');
          setServerStatus('Server checked the PDF and attempted basic text extraction. No listings were created.');
        } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed.'); }
        finally { setSending(false); }
      }}>{sending ? 'Validating…' : 'Validate PDF with House of Briar'}</button>
      {serverStatus && <p role="status">{serverStatus}</p>}
      {extractedText && !draftId && <button type="button" className="rounded-lg border px-4 py-2" onClick={async () => {
        try {
          const response = await fetch('/api/designer/collection-drafts', { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({sourceName:file?.name,extractedText}) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || 'Could not create private review draft.');
          setDraftId(result.id); setReviewGarments(result.garments);
        } catch (err) { setError(err instanceof Error ? err.message : 'Draft creation failed.'); }
      }}>Create private review draft from extracted lines</button>}
      {draftId && <section className="space-y-3"><h3 className="font-semibold">Private collection review</h3>
        <p className="text-sm">These are unverified text-line suggestions, not finished product listings. Correct or remove every entry before using it.</p>
        {reviewGarments.map((g,i) => <fieldset key={g.id} className="rounded-lg border p-3 space-y-2">
          <legend>Candidate {i+1}</legend>
          <label className="block">Garment name<input className="block w-full border rounded p-2" value={g.name} onChange={e=>setReviewGarments(items=>items.map((v,j)=>j===i?{...v,name:e.target.value}:v))}/></label>
          <label className="block">Description<textarea className="block w-full border rounded p-2" value={g.description} onChange={e=>setReviewGarments(items=>items.map((v,j)=>j===i?{...v,description:e.target.value}:v))}/></label>
          <label className="block">Price (leave empty if unknown)<input className="block w-full border rounded p-2" type="number" min="0" step="0.01" value={g.price ?? ''} onChange={e=>setReviewGarments(items=>items.map((v,j)=>j===i?{...v,price:e.target.value===''?null:Number(e.target.value)}:v))}/></label>
          <label className="block">Sizes<input className="block w-full border rounded p-2" value={g.sizes} onChange={e=>setReviewGarments(items=>items.map((v,j)=>j===i?{...v,sizes:e.target.value}:v))}/></label>
          <label className="block">Colors<input className="block w-full border rounded p-2" value={g.colors} onChange={e=>setReviewGarments(items=>items.map((v,j)=>j===i?{...v,colors:e.target.value}:v))}/></label>
          <label className="flex gap-2"><input type="checkbox" checked={g.selected} onChange={e=>setReviewGarments(items=>items.map((v,j)=>j===i?{...v,selected:e.target.checked}:v))}/> Mark reviewed</label>
          <button type="button" className="underline" onClick={()=>setReviewGarments(items=>items.filter((_,j)=>j!==i))}>Remove suggestion</button>
        </fieldset>)}
        <div className="space-y-2 border-t pt-3">
          <h4 className="font-semibold">Create unpublished marketplace drafts</h4>
          <p className="text-sm">Select a category and mark each complete garment as reviewed. Only reviewed garments with a name, description and confirmed price are eligible. Photos, shipping and inventory must be checked separately before publication.</p>
          <label className="block">Marketplace category
            <select className="block border rounded p-2" value={listingCategory} onChange={e=>setListingCategory(e.target.value)}>
              <option value="">Choose category</option>
              {['apparel','accessories','costumes','menswear','womenswear','unisex','other'].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button type="button" className="rounded-lg border px-4 py-2" disabled={converting || !listingCategory || !reviewGarments.some(g=>g.selected && g.name.trim() && g.description.trim() && g.price!==null && Number.isFinite(g.price) && g.price>=0)}
            onClick={async()=>{
              const eligible=reviewGarments.filter(g=>g.selected && g.name.trim() && g.description.trim() && g.price!==null && Number.isFinite(g.price) && g.price>=0 && !createdListingIds.includes(g.id));
              if(!eligible.length){setError('No eligible new garments remain.');return;}
              if(!window.confirm('Create '+eligible.length+' private marketplace listing drafts? This will not publish products.'))return;
              setConverting(true);setError('');
              try{
                // Save the reviewed source before creating listings.
                const saved=await fetch('/api/designer/collection-drafts/'+encodeURIComponent(draftId),{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({garments:reviewGarments})});
                if(!saved.ok)throw new Error('Save your private collection review before converting.');
                let created=0;
                for(const g of eligible){
                  const response=await fetch('/api/listings',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Idempotency-Key':'pdf-'+g.id},body:JSON.stringify({title:g.name.trim(),description:g.description.trim(),price:g.price,category:listingCategory,size:g.sizes.slice(0,40)})});
                  const result=await response.json();
                  if(!response.ok)throw new Error(result.message||'Could not create listing draft for '+g.name);
                  setCreatedListingIds(ids=>ids.includes(g.id)?ids:[...ids,g.id]);
                  created++;
                }
                setServerStatus(created+' marketplace listing drafts created or reused. None were published.');
              }catch(err){setError(err instanceof Error?err.message:'Listing draft conversion failed. Earlier items may have succeeded; retry is safe for the same garments.');}
              finally{setConverting(false);}
            }}>{converting?'Creating drafts…':'Create marketplace drafts from reviewed garments'}</button>
        </div>
        <button type="button" className="rounded-lg border px-4 py-2" onClick={async()=>{
          try {
            const response=await fetch('/api/designer/collection-drafts/'+encodeURIComponent(draftId),{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({garments:reviewGarments})});
            const result=await response.json(); if(!response.ok)throw new Error(result.message||'Save failed.');
            setServerStatus('Private review draft saved. No marketplace listings were created.');
          } catch(err){setError(err instanceof Error?err.message:'Save failed.');}
        }}>Save private review draft</button>
      </section>}
      {serverStatus && <label className="block">Extracted catalog text (review for accuracy)<textarea readOnly className="mt-2 block w-full border rounded p-2" rows={8} value={extractedText || 'No readable text found. Scanned or complex PDFs may require OCR.'} /></label>}
      <object data={url} type="application/pdf" className="w-full min-h-[360px]" aria-label="Your PDF catalog">
        <p>PDF preview is unavailable in this browser. You can still enter garment details below.</p>
      </object>
      <button type="button" className="rounded-lg border px-4 py-2" onClick={() => setEntries(current => [...current, { name: '', price: '', notes: '' }])}>Add garment to review list</button>
      {entries.map((entry, index) => <fieldset key={index} className="rounded-xl border p-3 space-y-2">
        <legend>Garment {index + 1}</legend>
        <label className="block">Name <input className="block w-full border rounded p-2" value={entry.name} onChange={event => setEntries(items => items.map((item, i) => i === index ? {...item, name: event.target.value} : item))} /></label>
        <label className="block">Price (optional) <input className="block w-full border rounded p-2" value={entry.price} onChange={event => setEntries(items => items.map((item, i) => i === index ? {...item, price: event.target.value} : item))} /></label>
        <label className="block">Description and details <textarea className="block w-full border rounded p-2" value={entry.notes} onChange={event => setEntries(items => items.map((item, i) => i === index ? {...item, notes: event.target.value} : item))} /></label>
        <button type="button" className="underline" onClick={() => setEntries(items => items.filter((_, i) => i !== index))}>Remove garment</button>
      </fieldset>)}
      {entries.length > 0 && <button type="button" className="rounded-lg border px-4 py-2" onClick={() => {
        const blob = new Blob([JSON.stringify({sourceFile: file?.name, garments: entries}, null, 2)], {type: 'application/json'});
        const link = document.createElement('a'); const href = URL.createObjectURL(blob);
        link.href = href; link.download = 'house-of-briar-collection-draft.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(href), 1000);
      }}>Download collection draft</button>}
    </>}
  </section>;
}
