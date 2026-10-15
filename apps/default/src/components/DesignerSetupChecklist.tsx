type Props = {
  profileReady: boolean | null;
  hasListing: boolean;
  hasPendingPiece: boolean;
  termsAccepted: boolean | null;
  paymentReady: boolean | null;
  paymentConnected: boolean;
  hasApprovedPiece: boolean;
  busy: boolean;
  error: string;
  onPaymentSetup: () => void;
  onRefresh: () => void;
};
export default function DesignerSetupChecklist({profileReady,hasListing,hasPendingPiece,termsAccepted,paymentReady,paymentConnected,hasApprovedPiece,busy,error,onPaymentSetup,onRefresh}: Props) {
  const checking=profileReady===null || termsAccepted===null || paymentReady===null;
  const accountReady=termsAccepted===true && paymentReady===true;
  const ready=accountReady && hasApprovedPiece;
  const complete=Number(profileReady===true)+Number(termsAccepted===true)+Number(paymentReady===true)+Number(hasListing)+Number(hasApprovedPiece);
  const next=checking?'Checking your setup…':!termsAccepted?'Next: review and accept the delivery terms.':!paymentReady?'Next: finish your secure payment setup.':!hasListing?'Next: save your first piece as a draft.':!hasApprovedPiece?hasPendingPiece?'Your piece is awaiting review. You can keep working on other drafts.':'Next: open your listings and submit a finished piece for review.':!profileReady?'Your selling setup is complete. Add your story and location to help shoppers meet you.':'Your selling setup is complete. Keep your stock and availability up to date.';
  return <section aria-labelledby="launch-title" className="mb-8 rounded-3xl border border-primary/20 bg-card p-6">
    <p className="text-xs font-semibold uppercase tracking-widest text-primary">Getting started</p>
    <h2 id="launch-title" className="mt-2 font-serif text-3xl">Your path to selling</h2>
    <p className="mt-3 font-semibold text-primary">{checking?'Checking your setup…':ready?'Selling setup complete':accountReady?'Account ready · prepare your first approved piece':'Finish your selling setup'}</p>
    <p role="status" className="mt-2 text-sm text-muted-foreground">{next}</p>
    <p className="mt-3 text-sm">{complete} of 5 milestones complete.</p>
    <ol className="mt-5 grid gap-3 sm:grid-cols-2">
      <li className="rounded-2xl border border-border p-4"><h3 className="font-semibold">1. Prepare your profile</h3><p className="mt-2 text-sm text-muted-foreground">Add your brand name, story and location so shoppers can meet you. Recommended; this does not block selling.</p><p className="mt-2 text-sm">{profileReady===true?'Complete':profileReady===null?'Checking…':'To do'}</p>{profileReady!==true&&<a href="/designers/room" className="mt-3 inline-flex min-h-11 items-center underline">Edit designer profile</a>}</li>
      <li className="rounded-2xl border border-border p-4"><h3 className="font-semibold">2. Accept the delivery terms</h3><p className="mt-2 text-sm text-muted-foreground">Customers get free US delivery. You cover postage, so include it in your price.</p><p className="mt-2 text-sm">{termsAccepted===true?'Complete':termsAccepted===null?'Checking…':'Action needed'}</p>{termsAccepted!==true&&<a href="#seller-terms" className="mt-3 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold">Review and accept terms</a>}</li>
      <li className="rounded-2xl border border-border p-4"><h3 className="font-semibold">3. Finish payment setup</h3><p className="mt-2 text-sm text-muted-foreground">Stripe securely checks your details and sets up your bank account for designer earnings.</p><p className="mt-2 text-sm">{paymentReady===true?'Complete':paymentReady===null?'Not checked yet':'Action needed'}</p>{paymentReady!==true&&<button type="button" disabled={busy} onClick={onPaymentSetup} className="mt-3 min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?'Please wait…':paymentConnected?'Continue payment setup':'Set up payments'}</button>}</li>
      <li className="rounded-2xl border border-border p-4"><h3 className="font-semibold">4. Save your first piece</h3><p className="mt-2 text-sm text-muted-foreground">Add photos, measurements, fit and preparation time. Save whenever you like; drafts stay private.</p><p className="mt-2 text-sm">{hasListing?'Complete':'To do'}</p>{!hasListing&&<a href="#designer-listings" className="mt-3 inline-flex min-h-11 items-center underline">Create a draft</a>}</li>
      <li className="rounded-2xl border border-border p-4"><h3 className="font-semibold">5. Submit for approval</h3><p className="mt-2 text-sm text-muted-foreground">{hasApprovedPiece?'You have an approved piece. Customers can buy when account setup is complete, stock is available and the listing is not paused or on vacation.':hasPendingPiece?'Your submitted piece is awaiting review. Approval is required before it appears in the shop.':'Open your listings and submit a finished draft for review; approval is required before it appears in the shop.'}</p><p className="mt-2 text-sm">{hasApprovedPiece?'Complete':hasPendingPiece?'Awaiting review':'To do'}</p><a href="#products" className="mt-3 inline-flex min-h-11 items-center underline">Manage listings</a></li>
    </ol>
    <button type="button" disabled={busy} onClick={onRefresh} className="mt-4 min-h-11 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-50">{busy?'Checking…':'Check payment setup again'}</button>
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

  </section>;
}
