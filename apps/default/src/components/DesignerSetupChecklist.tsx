type Props = {
  termsAccepted: boolean | null;
  paymentReady: boolean | null;
  paymentConnected: boolean;
  hasApprovedPiece: boolean;
  busy: boolean;
  error: string;
  onPaymentSetup: () => void;
  onRefresh: () => void;
};
export default function DesignerSetupChecklist({termsAccepted,paymentReady,paymentConnected,hasApprovedPiece,busy,error,onPaymentSetup,onRefresh}: Props) {
  const checking=termsAccepted===null || paymentReady===null;
  const ready=termsAccepted===true && paymentReady===true;
  const complete=Number(termsAccepted===true)+Number(paymentReady===true);
  return <section aria-labelledby="launch-title" className="mb-8 rounded-3xl border border-primary/20 bg-card p-6">
    <p className="text-xs font-semibold uppercase tracking-widest text-primary">Getting started</p>
    <h2 id="launch-title" className="mt-2 font-serif text-3xl">Your selling setup</h2>
    <p role="status" className="mt-3 font-semibold text-primary">{ready?'Ready to sell':checking?'Checking your setup…':'Finish your selling setup'}</p>
    <p className="mt-2 text-sm text-muted-foreground">{ready?'Your account is ready. Approved pieces with available stock appear in the shop unless paused or you are on vacation.':'Your pieces stay in your dashboard. Customers cannot buy them until you accept the current delivery terms and finish payment setup.'}</p>
    <p className="mt-3 text-sm">{complete} of 2 account steps complete.</p>
    <ol className="mt-5 grid gap-3 sm:grid-cols-2">
      <li className="rounded-2xl border border-border p-4"><h3 className="font-semibold">1. Accept the delivery terms</h3><p className="mt-2 text-sm text-muted-foreground">Customers get free US delivery. You cover postage, so include it in your price.</p><p className="mt-2 text-sm">{termsAccepted===true?'Complete':termsAccepted===null?'Checking…':'Action needed'}</p>{termsAccepted!==true&&<a href="#seller-terms" className="mt-3 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold">Review and accept terms</a>}</li>
      <li className="rounded-2xl border border-border p-4"><h3 className="font-semibold">2. Finish payment setup</h3><p className="mt-2 text-sm text-muted-foreground">Stripe securely checks your details and sets up your bank account for designer earnings.</p><p className="mt-2 text-sm">{paymentReady===true?'Complete':paymentReady===null?'Not checked yet':'Action needed'}</p>{paymentReady!==true&&<button type="button" disabled={busy} onClick={onPaymentSetup} className="mt-3 min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?'Please wait…':paymentConnected?'Continue payment setup':'Set up payments'}</button>}</li>
    </ol>
    <button type="button" disabled={busy} onClick={onRefresh} className="mt-4 min-h-11 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-50">{busy?'Checking…':'Check payment setup again'}</button>
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <div className="mt-5 rounded-2xl bg-accent/50 p-4"><h3 className="font-semibold">Your pieces</h3><p className="mt-2 text-sm text-muted-foreground">{hasApprovedPiece?'You have an approved piece. Selling setup must be complete before it appears in the shop.':'Save a draft whenever you like. Submit your finished piece for review; drafts stay private and approval is required before a piece appears in the shop.'}</p><a href="#designer-listings" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline">Manage listings</a></div>
  </section>;
}
