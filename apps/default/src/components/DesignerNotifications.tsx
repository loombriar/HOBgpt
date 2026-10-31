export type DesignerNotification = {
  id: string; type: string; title: string; body: string;
  listingId?: string | null; orderId?: string | null; inquiryId?: string | null;
  actionPath?: string | null; readAt?: string | null; createdAt: string;
  priority?: string; source?: string; adminLabel?: string | null;
};

type Props = {
  items: DesignerNotification[]; unread: number;
  onRead: (id: string) => void; onReadAll: () => void; onRefresh: () => void;
};

export default function DesignerNotifications({ items, unread, onRead, onReadAll, onRefresh }: Props) {
  return <section id="messages" className="mb-8 scroll-mt-8 rounded-3xl border border-border bg-card p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Designer updates</p><h2 className="mt-2 font-serif text-3xl">Your inbox <span className="text-sm">{unread} unread</span></h2></div>
      <div className="flex gap-2"><button type="button" onClick={onRefresh} className="min-h-11 rounded-full border border-border px-4 text-xs">Refresh</button><button type="button" disabled={!unread} onClick={onReadAll} className="min-h-11 rounded-full border border-border px-4 text-xs disabled:opacity-50">Mark all read</button></div>
    </div>
    {items.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Sales, shipping steps, inventory alerts, and House notices will appear here.</p> : <div className="mt-5 space-y-3">{items.map(note => <article key={note.id} className={`rounded-2xl border p-4 ${note.readAt ? 'border-border' : 'border-primary/40 bg-accent/30'}`}>
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{note.title}</h3><span className="text-xs text-muted-foreground">{note.source === 'admin' ? note.adminLabel || 'House of Briar' : 'House update'}{note.priority && note.priority !== 'normal' ? ` · ${note.priority}` : ''}</span></div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{note.body}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(note.createdAt).toLocaleString()}</p>
      <div className="mt-3 flex gap-3">{note.actionPath?.startsWith('/account#') && <a href={note.actionPath} className="text-sm text-primary underline" onClick={() => onRead(note.id)}>Open details</a>}{!note.readAt && <button type="button" onClick={() => onRead(note.id)} className="text-sm text-primary underline">Mark read</button>}</div>
    </article>)}</div>}
  </section>;
}
