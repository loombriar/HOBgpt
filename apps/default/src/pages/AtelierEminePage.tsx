import {useEffect,useState} from 'react';
import HouseShell from '@/components/HouseShell';
import collection from '../../../../shared/atelier-emine-preview.json';

const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});

export default function AtelierEminePage(){
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState('name');
  useEffect(()=>{document.title='Atelier Emine Collection Preview | House of Briar';},[]);
  const needle=query.trim().toLocaleLowerCase();
  const pieces=collection.filter(p=>`${p.name} ${p.sku} ${p.description}`.toLocaleLowerCase().includes(needle))
    .sort((a,b)=>sort==='price-low'?a.priceUsd-b.priceUsd:sort==='price-high'?b.priceUsd-a.priceUsd:a.name.localeCompare(b.name));
  return <HouseShell>
    <header className="border-b border-border bg-card">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 md:grid-cols-[200px_1fr] lg:px-8">
        <img src="/atelier-emine-logo-v1.webp" width="200" height="200" alt="Atelier Emine" className="mx-auto h-48 w-48 bg-white object-contain"/>
        <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">Independent by design / Istanbul, Türkiye</p>
          <h1 className="mt-4 font-serif text-5xl sm:text-6xl">Atelier Emine</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Handcrafted couture handbags, shaped by a 65-year family craft heritage. Explore pearls, crystals, velvet, mother-of-pearl, and wood through the collection.</p>
          <div className="mt-5 flex flex-wrap gap-6 text-sm font-semibold"><a className="underline underline-offset-4" href="https://www.atelieremine.com" target="_blank" rel="noopener noreferrer">Designer website ↗</a><a className="underline underline-offset-4" href="https://www.instagram.com/ateliereminedesign" target="_blank" rel="noopener noreferrer">Instagram ↗</a></div>
        </div>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <section aria-labelledby="collection-preview-title" className="border-l-4 border-primary bg-accent p-5">
        <h2 id="collection-preview-title" className="font-semibold">Collection preview · Purchasing coming soon</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6">These pieces are not available to purchase yet. Prices are shown in US dollars. Each bag is made to order; production and delivery timing will be confirmed before purchases open.</p>
        <p className="mt-2 text-sm leading-6">The designer’s listed prices include DHL Express shipping and seller-stated DDP customs duties and taxes.</p>
      </section>
      <div className="my-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex-1 text-sm font-semibold">Search the collection<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, material or model code" className="mt-2 block min-h-12 w-full rounded-lg border border-border bg-background px-4 font-normal"/></label>
        <label className="text-sm font-semibold">Sort pieces<select value={sort} onChange={e=>setSort(e.target.value)} className="mt-2 block min-h-12 w-full rounded-lg border border-border bg-background px-4 font-normal"><option value="name">Name A–Z</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label>
      </div>
      <p role="status" className="mb-6 text-sm text-muted-foreground">{pieces.length} {pieces.length===1?'piece':'pieces'} in this preview</p>
      {pieces.length===0&&<p className="py-10 text-center">No pieces match your search. Try another name or material.</p>}
      <div className="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {pieces.map(piece=><article key={piece.sku} id={`preview-${piece.sku}`} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <div className="relative aspect-[4/5] bg-white"><img src={piece.images[0]} alt={`${piece.name} by Atelier Emine`} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain"/><span className="absolute left-3 top-3 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold">Coming soon</span></div>
          <div className="p-4"><h2 className="font-serif text-2xl">{piece.name}</h2><p className="mt-2 text-sm font-semibold tabular-nums">{money.format(piece.priceUsd)} USD</p><p className="mt-1 text-xs text-muted-foreground">Made to order · Collection preview</p>
            <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold underline underline-offset-4">Details &amp; photos</summary>
              <p className="mt-2 break-words text-xs text-muted-foreground">Model {piece.sku}</p><p className="mt-4 whitespace-pre-line break-words text-sm leading-6">{piece.description}</p>
              {piece.care&&<p className="mt-4 text-sm leading-6"><strong>Care:</strong> {piece.care}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2">{piece.images.map((url,index)=><a key={`${url}-${index}`} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${piece.name} photo ${index+1}`}><img src={url} alt={`${piece.name}, view ${index+1}`} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full bg-white object-contain"/></a>)}</div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">Photos supplied by Atelier Emine. Open a photo to view it at full size.</p>
            </details>
          </div>
        </article>)}
      </div>
      <p className="mt-10 text-sm text-muted-foreground">Independent by design. Made by someone, not everyone.</p>
    </main>
  </HouseShell>;
}
