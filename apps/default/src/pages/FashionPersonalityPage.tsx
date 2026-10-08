import { useState } from 'react';
import { Link } from 'react-router-dom';
import HouseShell from '@/components/HouseShell';

const questions = [
  { title: 'Which world feels most like you?', choices: [['An overgrown secret garden','romantic'],['A candlelit midnight atelier','dramatic'],['A sunlit vintage market','playful'],['A quiet gallery of sculptural pieces','minimal']] },
  { title: 'Choose your favorite detail.', choices: [['Lace, flowers, and soft draping','romantic'],['Velvet, corsetry, and contrast','dramatic'],['Unexpected prints and rescued fabrics','playful'],['Clean lines and thoughtful tailoring','minimal']] },
  { title: 'What would you wear to a celebration?', choices: [['A flowing, dreamlike dress','romantic'],['A bold statement ensemble','dramatic'],['A one-of-a-kind colorful look','playful'],['An understated piece with striking shape','minimal']] },
  { title: 'Your ideal palette?', choices: [['Rose, moss, and cream','romantic'],['Blackberry, midnight, and gold','dramatic'],['Marigold, lavender, and coral','playful'],['Stone, ink, and warm ivory','minimal']] },
  { title: 'What matters most in a piece?', choices: [['The story and romance','romantic'],['The impact and confidence','dramatic'],['The surprise and individuality','playful'],['The craft and versatility','minimal']] },
] as const;
const results = {
  romantic: { name:'The Woodland Romantic', detail:'Soft silhouettes, botanical stories, and a touch of everyday enchantment.', search:'dress' },
  dramatic: { name:'The Midnight Original', detail:'Rich textures, striking shapes, and a wardrobe that makes an entrance.', search:'velvet' },
  playful: { name:'The Colorful Collector', detail:'Upcycled treasures, unexpected combinations, and pieces nobody else owns.', search:'upcycled' },
  minimal: { name:'The Thoughtful Curator', detail:'Intentional details, wearable art, and carefully chosen statement pieces.', search:'one-of-a-kind' },
};
type Style = keyof typeof results;
export default function FashionPersonalityPage() {
  const [answers,setAnswers] = useState<Style[]>([]);
  const step=answers.length;
  const result:Style = (Object.keys(results) as Style[]).reduce((best,key) => answers.filter(x=>x===key).length > answers.filter(x=>x===best).length ? key : best,'romantic');
  const finished=step===questions.length;
  return <HouseShell><main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
    <p className="text-xs font-semibold uppercase tracking-[.24em] text-primary">Mess Around · Five little questions</p>
    <h1 className="mt-4 font-serif text-5xl sm:text-6xl">Find Your Fashion Personality</h1>
    <p className="mt-5 text-muted-foreground">A playful style discovery, not a sizing or fit assessment. Explore what makes your wardrobe yours.</p>
    {!finished ? <section className="mt-10 rounded-3xl border border-border bg-card p-6 sm:p-10">
      <p className="text-sm text-primary">Question {step+1} of {questions.length}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-accent"><div className="h-full rounded-full bg-primary transition-all" style={{width:`${step/questions.length*100}%`}}/></div>
      <h2 className="mt-8 font-serif text-3xl">{questions[step].title}</h2>
      <div className="mt-6 grid gap-3">{questions[step].choices.map(([label,style])=><button type="button" key={label} onClick={()=>setAnswers(prev=>[...prev,style])} className="min-h-14 rounded-2xl border border-border px-5 py-4 text-left transition hover:border-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary">{label}</button>)}</div>
      {step>0&&<button type="button" className="mt-6 text-sm text-muted-foreground underline" onClick={()=>setAnswers(prev=>prev.slice(0,-1))}>Previous question</button>}
    </section> : <section className="mt-10 rounded-3xl border border-primary/30 bg-card p-8 text-center sm:p-12" aria-live="polite">
      <p className="text-xs uppercase tracking-[.24em] text-primary">Your fashion personality</p>
      <h2 className="mt-5 font-serif text-4xl sm:text-5xl">{results[result].name}</h2>
      <p className="mx-auto mt-5 max-w-lg leading-8 text-muted-foreground">{results[result].detail}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to={`/shop?q=${encodeURIComponent(results[result].search)}`} className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground">Discover matching pieces</Link>
        <Link to="/designers" className="rounded-full border border-border px-6 py-3 text-sm font-semibold">Meet the designers</Link>
        <button type="button" onClick={()=>setAnswers([])} className="rounded-full border border-border px-6 py-3 text-sm">Try again</button>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Suggestions use a shop search; results depend on available listings.</p>
    </section>}
  </main></HouseShell>;
}
