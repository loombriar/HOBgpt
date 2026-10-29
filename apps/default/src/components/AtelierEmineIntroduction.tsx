export default function AtelierEmineIntroduction() {
  return <section id="atelier-emine" aria-labelledby="atelier-emine-title" className="border-b border-border bg-card">
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[260px_1fr] md:items-center lg:px-8">
      <div className="flex items-center justify-center bg-white p-4">
        <img src="/atelier-emine-logo-v1.webp" width="1024" height="1024" alt="Atelier Emine" className="h-56 w-56 object-contain" loading="lazy"/>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">Meet an independent design house / Istanbul, Türkiye</p>
        <h2 id="atelier-emine-title" className="mt-3 font-serif text-4xl">Meet Atelier Emine</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">Atelier Emine is an Istanbul-based design house creating handcrafted couture handbags inspired by a 65-year family craft heritage. Each piece is individually made using carefully selected materials, including crystals, mother-of-pearl, pearls, velvet, and wood.</p>
        <p className="mt-5 font-semibold text-foreground">Collection in preparation</p>
        <p className="mt-1 text-sm text-muted-foreground">We’re preparing their collection for House of Briar. Pieces are not available to purchase yet.</p>
        <div className="mt-5 flex flex-wrap gap-x-7 gap-y-2 text-sm font-semibold">
          <a href="https://www.atelieremine.com" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">Visit Atelier Emine’s website ↗</a>
          <a href="https://www.instagram.com/ateliereminedesign" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">Instagram ↗</a>
        </div>
      </div>
    </div>
  </section>;
}
