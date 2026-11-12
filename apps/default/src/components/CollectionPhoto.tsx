import { useState } from 'react';

type Props = { sources: string[]; alt: string; className: string };

// Only the supplied photos for this product may replace a failed cover.
export default function CollectionPhoto({ sources, alt, className }: Props) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const source = sources.find(url => url && !failed[url]);
  if (!source) return <div role="img" aria-label={`${alt}: photo unavailable`} className={`${className} flex items-center justify-center p-4 text-center text-sm text-slate-700`}>
    <span>Photo unavailable</span>
  </div>;
  return <img key={source} src={source} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={className}
    onError={() => setFailed(previous => ({ ...previous, [source]: true }))} />;
}
