type Props={size:string;measurements:string;fit:string;preparation:string};
export default function PurchaseEssentials({size,measurements,fit,preparation}:Props){
 return <section aria-label="Purchase essentials" className="mt-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
  <h2 className="font-serif text-xl">Before you buy</h2>
  <dl className="mt-3 space-y-3 text-sm leading-6">
   <div><dt className="font-semibold">Size & garment measurements</dt><dd className="whitespace-pre-wrap break-words text-muted-foreground">Listed size: {size}. {measurements||'Exact measurements have not been supplied. Ask the designer before purchase.'}</dd></div>
   <div><dt className="font-semibold">Fit</dt><dd className="whitespace-pre-wrap break-words text-muted-foreground">{fit||'No fit guidance has been supplied. Compare with a garment you own or ask the designer.'}</dd></div>
   <div><dt className="font-semibold">Processing time</dt><dd className="text-muted-foreground">{preparation} Carrier transit time is additional.</dd></div>
   <div><dt className="font-semibold">US shipping cost</dt><dd className="text-muted-foreground">Free US delivery. US addresses only. <a href="/shipping.html" className="underline">Shipping policy</a></dd></div>
   <div><dt className="font-semibold">Returns</dt><dd className="text-muted-foreground">Eligibility depends on the piece and marketplace terms. <a href="/rules.html" className="underline">Read the returns policy before ordering</a>.</dd></div>
  </dl>
  <a href="#product-inquiry" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline">Ask the designer about this piece</a>
  <details className="mt-2 border-t border-border pt-2"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Alterations & custom fit</summary><p className="pb-3 text-sm leading-6 text-muted-foreground">Confirm alteration availability and pricing with the designer before purchase. <a className="underline" href="#product-inquiry">Ask about alterations</a> or <a className="underline" href="#custom-sizing">request custom sizing</a>.</p></details>
 </section>;
}
