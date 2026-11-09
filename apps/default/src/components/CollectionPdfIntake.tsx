import { collectionImportReport } from '@/lib/collection-import-report';
import { useEffect, useRef, useState } from 'react';

/** Private PDF, DOCX and XLSX intake; uploads processed in memory. */
export default function CollectionPdfIntake({ onFinishListing }: { onFinishListing: (id:string) => Promise<void> }) {
  const selectionVersion = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [serverStatus, setServerStatus] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [sending, setSending] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [listingCategory, setListingCategory] = useState('');
  const [usdPricesConfirmed, setUsdPricesConfirmed] = useState(false);
  const [createdListingIds, setCreatedListingIds] = useState<string[]>([]);
  const [createdDrafts, setCreatedDrafts] = useState<Array<{id:string;title:string}>>([]);
  const [openingListing, setOpeningListing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [reviewGarments, setReviewGarments] = useState<Array<{id:string;name:string;description:string;price:number|null;sizes:string;colors:string;selected:boolean}>>([]);
  const [savedReviews, setSavedReviews] = useState<Array<{id:string;sourceName:string;updatedAt:string;garmentCount:number}>>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [openingReview, setOpeningReview] = useState(false);
  const [deletingReview, setDeletingReview] = useState('');
  async function deleteReview(id:string, name:string) {
    if (!window.confirm('Permanently delete the saved review for '+name+'? This will not delete marketplace listings.')) return;
    setDeletingReview(id); setReviewError('');
    try {
      const response = await fetch('/api/designer/collection-drafts/'+encodeURIComponent(id), {method:'DELETE',credentials:'same-origin'});
      if (!response.ok) throw new Error('Could not delete saved review.');
      if (draftId === id) { setDraftId(''); setReviewGarments([]); setExtractedText(''); setFile(null); }
      await refreshReviews();
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Delete failed.'); }
    finally { setDeletingReview(''); }
  }
  const [sourceName, setSourceName] = useState('');
  const [reviewPage, setReviewPage] = useState(0);
  const [reviewQuery, setReviewQuery] = useState('');
  const visibleReviews = reviewGarments.map((garment,index)=>({garment,index})).filter(({garment})=>garment.name.toLowerCase().includes(reviewQuery.toLowerCase()));
  const pageCount = Math.max(1,Math.ceil(visibleReviews.length/20));
  const importReport = extractedText && draftId ? collectionImportReport(extractedText, reviewGarments) : null;
  async function refreshReviews() {
    setLoadingReviews(true); setReviewError('');
    try {
      const response = await fetch('/api/designer/collection-drafts', { credentials:'same-origin', cache:'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error('Could not load saved collections. Please refresh the list.');
      setSavedReviews(result.items);
    } catch (err) { setReviewError(err instanceof Error ? err.message : 'Could not load saved collections.'); }
    finally { setLoadingReviews(false); }
  }
  useEffect(() => { void refreshReviews(); }, []);
  async function resumeReview(id:string) {
    if ((draftId || file) && !window.confirm('Open this saved collection? Unsaved changes in the current review will be replaced.')) return;
    setOpeningReview(true); setError('');
    try {
      const response=await fetch('/api/designer/collection-drafts/'+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});
      const result=await response.json();
      if(!response.ok)throw new Error('Could not open this saved collection. Refresh the list and try again.');
      selectionVersion.current++; setFile(null); setExtractedText(''); setEntries([]); setCreatedListingIds([]); setCreatedDrafts([]); setListingCategory('');
      setUsdPricesConfirmed(false); setReviewPage(0); setReviewQuery(''); setDraftId(result.id); setSourceName(result.sourceName); setReviewGarments(result.garments);
      setServerStatus('Saved collection reopened. Your original document is not needed to finish this review.');
    }catch(err){setError(err instanceof Error?err.message:'Could not open collection.');}
    finally{setOpeningReview(false);}
  }
  const [entries, setEntries] = useState<Array<{ name: string; price: string; notes: string }>>([]);
  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  function choose(next: File | undefined) {
    const version = ++selectionVersion.current;
    setError('');
    setServerStatus('');
    setExtractedText('');
    setSourceName(next?.name || '');
    setDraftId(''); setReviewPage(0); setReviewQuery(''); setReviewGarments([]); setUsdPricesConfirmed(false); setCreatedListingIds([]); setCreatedDrafts([]);
    setFile(null);
    setEntries([]);
    if (!next) return;
    if (next.size > 20 * 1024 * 1024) { setError('Document must be 20 MB or smaller.'); return; }
    const isPdf = next.name.toLowerCase().endsWith('.pdf');
    const isDocx = next.name.toLowerCase().endsWith('.docx');
    const isXlsx = next.name.toLowerCase().endsWith('.xlsx');
    if (!isPdf && !isDocx && !isXlsx) { setError('Select a PDF, Word (.docx) or Excel (.xlsx) catalog.'); return; }
    next.slice(0, 5).arrayBuffer().then(bytes => {
      if (version !== selectionVersion.current) return;
      const magic = String.fromCharCode(...new Uint8Array(bytes));
      if (isPdf ? magic !== '%PDF-' : !magic.startsWith('PK')) { setError('This file does not appear to be a valid document.'); return; }
      setFile(next);
    }).catch(() => { if (version === selectionVersion.current) setError('Could not read this document.'); });
  }
  return <section aria-label="Collection document intake" className="rounded-2xl border border-border p-5 space-y-4">
    <h2 className="font-serif text-2xl">Upload your collection — PDF, Word or Excel</h2>
    <p className="text-sm">Upload a PDF, Word (.docx) or Excel (.xlsx) catalog for text extraction, then review garment suggestions before creating private drafts. The original document is processed in memory and is not stored. Photos are not imported. Prices, sizes, colors and descriptions need manual review; scanned PDFs may not contain readable text. Word support is for .docx files, not older .doc files.</p>
    <section aria-label="Resume saved collections" className="space-y-3 border rounded-xl p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Resume saved collections</h3><button type="button" className="underline min-h-11" disabled={loadingReviews || openingReview || sending || converting} onClick={()=>void refreshReviews()}>Refresh list</button></div>
      <p className="text-sm">Private reviews saved to your designer account. The 100 most recently updated collections appear here. Re-uploading identical extracted content reuses its existing review; older reviews can be deleted individually.</p>
      {loadingReviews && <p role="status">Loading saved collections…</p>}
      {reviewError && <p role="alert">{reviewError}</p>}
      {!loadingReviews && !reviewError && savedReviews.length===0 && <p>No saved collections yet. Extract a catalog and create a private review to begin.</p>}
      <ul className="space-y-2">{savedReviews.map(review=><li key={review.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><div className="min-w-0"><p className="font-medium break-words">{review.sourceName}</p><p className="text-sm">{review.garmentCount} suggestions · Updated {review.updatedAt}</p></div><div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border px-4 min-h-11" disabled={openingReview || sending || converting || Boolean(deletingReview)} onClick={()=>void resumeReview(review.id)} aria-label={'Resume '+review.sourceName}>{openingReview?'Opening…':'Resume review'}</button><button type="button" className="rounded-lg border px-4 min-h-11 text-red-700" disabled={openingReview || sending || converting || Boolean(deletingReview)} onClick={()=>void deleteReview(review.id,review.sourceName)} aria-label={'Delete '+review.sourceName}>{deletingReview===review.id?'Deleting…':'Delete review'}</button></div></li>)}</ul>
    </section>
    <label className="block">Choose PDF, Word or Excel catalog (up to 20 MB)
      <input className="mt-2 block w-full" type="file" disabled={sending || converting || openingReview} accept=".pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => choose(event.target.files?.[0])} />
    </label>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {(url || draftId) && <>
      <button type="button" disabled={sending || !file || openingReview} className="rounded-lg border px-4 py-2" onClick={async () => {
        if (!file) return;
        setSending(true); setError(''); setServerStatus(''); setExtractedText('');
        try {
          const data = new FormData(); data.append('catalog', file);
          const response = await fetch('/api/designer/collection-imports', { method: 'POST', body: data, credentials: 'same-origin' });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || 'Document validation failed.');
          setExtractedText(typeof result.extractedText === 'string' ? result.extractedText : '');
          setServerStatus(result.extractedText?.trim() ? 'Text extracted. Review it below, then create a private review draft. No listings were created.' : 'No readable text found. Use a text-based PDF, DOCX or XLSX, or use the manual review list below. No listings were created.');
        } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed.'); }
        finally { setSending(false); }
      }}>{sending ? 'Validating…' : 'Extract document text with House of Briar'}</button>
      {serverStatus && <p role="status">{serverStatus}</p>}
      {extractedText && !draftId && <button type="button" className="rounded-lg border px-4 py-2" onClick={async () => {
        try {
          const response = await fetch('/api/designer/collection-drafts', { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({sourceName:file?.name,extractedText}) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || 'Could not create private review draft.');
          setUsdPricesConfirmed(false); setReviewPage(0); setReviewQuery(''); setDraftId(result.id); setSourceName(file?.name || result.sourceName); setReviewGarments(result.garments); setServerStatus(result.reused ? 'Identical review already exists; reopened saved review.' : 'New private review created.'); void refreshReviews();
        } catch (err) { setError(err instanceof Error ? err.message : 'Draft creation failed.'); }
      }}>Create private review draft from extracted lines</button>}
      {draftId && <section className="space-y-3"><h3 className="font-semibold">Private collection review</h3><p className="text-sm break-words">{sourceName}</p>
        <p className="text-sm">These are unverified text-line suggestions, not finished product listings. Correct or remove every entry before using it.</p>
        {importReport?.supported && <section aria-label="Import accuracy report" className="rounded-xl border p-4 space-y-2">
          <h4 className="font-semibold">Import accuracy report</h4>
          <p className="text-sm">Compared against extracted spreadsheet text, not the original workbook. This checks mapped fields only. Product images, original currency, stock, shipping, and extraction completeness are not verified.</p>
          <p className="text-sm">{importReport.matched} of {importReport.sourceCount} extracted products matched by name · {importReport.issues.length} source rows flagged</p>
          {importReport.truncated && <p role="alert" className="text-sm">The review is limited to 30 suggestions. Additional source products may be missing; do not treat this as a complete import.</p>}
          {importReport.issues.length===0 ? <p className="text-sm">No differences found in compared fields only. This is not a zero-error certification of the workbook.</p> :
            <details><summary className="cursor-pointer underline">Show {importReport.issues.length} flagged source rows</summary>
              <ul className="list-disc pl-5 space-y-2 mt-2">{importReport.issues.map((issue,i)=><li key={i} className="text-sm">Row {issue.row}: {issue.name} — {issue.problems.join('; ')}</li>)}</ul>
            </details>}
        </section>}
        {draftId && !extractedText && <p className="text-sm">Accuracy comparison is unavailable for reopened saved reviews because the original extracted text is not retained. Re-upload the source file to generate a new comparison.</p>}
        <div className="flex flex-wrap items-center gap-3 border rounded-lg p-3">
          <label>Find product <input className="border rounded p-2 ml-2" value={reviewQuery} onChange={e=>{setReviewQuery(e.target.value);setReviewPage(0);}} placeholder="Search product names" /></label>
          <span className="text-sm">{visibleReviews.length} of {reviewGarments.length} products</span>
          <button type="button" className="border rounded px-3 py-2" disabled={reviewPage===0} onClick={()=>setReviewPage(p=>Math.max(0,p-1))}>Previous</button>
          <span className="text-sm">Page {Math.min(reviewPage+1,pageCount)} of {pageCount}</span>
          <button type="button" className="border rounded px-3 py-2" disabled={reviewPage>=pageCount-1} onClick={()=>setReviewPage(p=>Math.min(pageCount-1,p+1))}>Next</button>
        </div>
        {visibleReviews.slice(reviewPage*20,(reviewPage+1)*20).map(({garment:g,index:i}) => <fieldset key={g.id} className="rounded-lg border p-3 space-y-2">
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
          <p className="text-sm">Select a category and mark each complete garment as reviewed. Only reviewed garments with a name, description and confirmed price are eligible. Prices in this form become USD marketplace prices. This importer does not detect or convert foreign currencies. If your workbook uses GBP or another currency, manually convert and verify each price before creating drafts. Photos, shipping and inventory must be checked separately before publication.</p>
          <label className="flex items-start gap-2"><input type="checkbox" checked={usdPricesConfirmed} onChange={e=>setUsdPricesConfirmed(e.target.checked)}/><span>I have verified that every selected product price is the intended final USD marketplace price (including any necessary GBP-to-USD conversion). I understand the spreadsheet's numeric GBP prices are not converted automatically.</span></label>
          <label className="block">Marketplace category
            <select className="block border rounded p-2" value={listingCategory} onChange={e=>setListingCategory(e.target.value)}>
              <option value="">Choose category</option>
              {['apparel','accessories','costumes','menswear','womenswear','unisex','other'].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button type="button" className="rounded-lg border px-4 py-2" disabled={converting || !usdPricesConfirmed || !listingCategory || !reviewGarments.some(g=>g.selected && g.name.trim() && g.description.trim() && g.price!==null && Number.isFinite(g.price) && g.price>=0)}
            onClick={async()=>{
              if (!usdPricesConfirmed) { setError('Confirm the selected product prices are in USD before creating marketplace drafts.'); return; }
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
                  if (!result.item?.id) throw new Error('The listing was saved without a valid reference. Open Your listings before retrying.');
                  setCreatedDrafts(items=>items.some(item=>item.id===result.item.id)?items:[...items,{id:result.item.id,title:result.item.title||g.name}]);
                  setCreatedListingIds(ids=>ids.includes(g.id)?ids:[...ids,g.id]);
                  created++;
                }
                setServerStatus(created+' marketplace listing drafts created or reused. None were published.');
              }catch(err){setError(err instanceof Error?err.message:'Listing draft conversion failed. Earlier items may have succeeded; retry is safe for the same garments.');}
              finally{setConverting(false);}
            }}>{converting?'Creating drafts…':'Create marketplace drafts from reviewed garments'}</button>
        </div>
        {createdDrafts.length>0 && <section aria-label="Finish imported listings" className="rounded-xl border p-4 space-y-3">
          <h4 className="font-semibold">Next: finish your listings</h4>
          <p className="text-sm">Your imported details are saved as private drafts. Open each listing to add product photos, check sizes, set shipping and inventory, then save. Submitting for review is a separate step.</p>
          <ul className="space-y-2">{createdDrafts.map(item=><li key={item.id} className="flex flex-wrap justify-between items-center gap-3 border-t pt-3"><span className="break-words">{item.title}</span><button type="button" disabled={openingListing||converting} className="min-h-11 rounded-lg border px-4" onClick={async()=>{setOpeningListing(true);setError('');try{await onFinishListing(item.id);}catch(err){setError(err instanceof Error?err.message:'Could not open listing. Find it under Your listings.');}finally{setOpeningListing(false);}}}>Finish listing: {item.title}</button></li>)}</ul>
        </section>}
        <button type="button" className="rounded-lg border px-4 py-2" onClick={async()=>{
          try {
            const response=await fetch('/api/designer/collection-drafts/'+encodeURIComponent(draftId),{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({garments:reviewGarments})});
            const result=await response.json(); if(!response.ok)throw new Error(result.message||'Save failed.');
            setServerStatus('Private review draft saved. This save does not create or publish marketplace listings.'); void refreshReviews();
          } catch(err){setError(err instanceof Error?err.message:'Save failed.');}
        }}>Save private review draft</button>
      </section>}
      {extractedText && <label className="block">Extracted catalog text (review for accuracy)<textarea readOnly className="mt-2 block w-full border rounded p-2" rows={8} value={extractedText || 'No readable text found. Scanned or complex PDFs may require OCR.'} /></label>}
      {file?.name.toLowerCase().endsWith(".pdf") && <object data={url} type="application/pdf" className="w-full min-h-[360px]" aria-label="Your PDF catalog">
        <p>PDF preview is unavailable in this browser. You can still enter garment details below.</p>
      </object>}
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
