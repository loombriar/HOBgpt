import { useState } from 'react';

type Photo = { id: string; url: string };
export default function StudioListingPhotos({ title, images }: { title: string; images: Photo[] }) {
  const [selectedId, setSelectedId] = useState<string>();
  const [failedUrl, setFailedUrl] = useState('');
  const available = images.filter(image => image.url);
  const selected = available.find(image => image.id === selectedId) ?? available[0];
  return <div className="w-full shrink-0 sm:w-40" role="group" aria-label={`${title} photos`}>
    <div className="flex aspect-[4/5] max-h-64 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted sm:max-h-none">
      {selected && failedUrl !== selected.url ? <img src={selected.url} alt={`${title} — photo ${available.indexOf(selected) + 1} of ${available.length}`} loading="lazy" className="h-full w-full object-contain" onError={() => setFailedUrl(selected.url)} /> : <span className="p-3 text-center text-sm text-muted-foreground">{selected ? 'Photo unavailable' : 'No photos yet'}</span>}
    </div>
    {available.length > 1 && <div className="mt-2 flex flex-wrap gap-2">{available.map((image, index) => <button key={image.id} type="button" aria-label={`Show ${title} photo ${index + 1}`} aria-pressed={selected?.id === image.id} onClick={() => setSelectedId(image.id)} className="h-12 w-12 overflow-hidden rounded-md border-2 border-border bg-muted aria-pressed:border-primary"><img src={image.url} alt="" loading="lazy" className="h-full w-full object-contain" /></button>)}</div>}
  </div>;
}
