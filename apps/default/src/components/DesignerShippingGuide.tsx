type Props = {sample:boolean;hasTracking:boolean;refunded:boolean};

export default function DesignerShippingGuide({sample,hasTracking,refunded}:Props) {
  const steps = [
    ['Pack the piece', 'Check the delivery address above. Protect the garment and include any requested gift note.'],
    ['Weigh & measure', 'Measure the packed parcel in inches and weigh it in ounces, including the packaging.'],
    ['Choose postage', sample ? 'Open the sample postage tools below, enter your return details and compare rates. Approve the exact sample deduction.' : 'Buy postage through your carrier using the delivery address above. In-app label purchases are currently sample-only.'],
    ['Print the label', sample ? 'Open the sample PDF to try printing. It cannot be used for delivery.' : 'Print your carrier’s label and attach it securely. Cover or remove any old labels.'],
    ['Add tracking & hand over', sample ? 'Sample tracking is for practice only. Do not mail this parcel; no payout can be released.' : 'Save the carrier and tracking number below, then hand the parcel to the carrier. Keep your acceptance receipt.'],
  ];
  return <details className="mt-4 rounded-xl border border-border bg-accent/20 p-4 text-sm">
    <summary className="cursor-pointer font-semibold">{sample?'Practice shipping':'Shipping guide'} · 5 steps</summary>
    {refunded ? <p className="mt-3 font-medium" role="status">This order has a customer refund. Check the refund details with House support before shipping anything.</p> : hasTracking ? <p className="mt-3 text-muted-foreground">Tracking is saved. Keep your carrier receipt and check the shipment status below.</p> : <p className="mt-3 text-muted-foreground">{sample?'A practice run from packing to printing. No real shipping or money movement.':'From your studio to their doorstep—work through these steps when the piece is ready.'}</p>}
    <ol className="mt-4 grid gap-4 sm:grid-cols-2">{steps.map(([title,body],index)=><li key={title} className="flex items-start gap-3"><span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background font-semibold tabular-nums">{index+1}</span><div><p className="font-medium">{title}</p><p className="mt-1 leading-6 text-muted-foreground">{body}</p></div></li>)}</ol>
    <div className="mt-4 space-y-3 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
      <p><strong className="text-foreground">Postage & earnings.</strong> {sample?'Sample label costs reduce the sample earnings shown here. No real charge or payout is made.':'House keeps 9% of the sale before other applicable costs. Postage purchased outside House is paid separately and is not automatically deducted in this breakdown.'}</p>
      <p><strong className="text-foreground">Need to cancel a label?</strong> Request cancellation only for an unused label, then stop using it. Postage bought through House stays deducted until the carrier confirms its refund. A customer refund does not cancel a shipping label. For postage bought elsewhere, request the refund from that provider.</p>
      <p><strong className="text-foreground">When can earnings be released?</strong> Saving tracking or printing a label does not release a payout. Eligible earnings remain held until shipment movement is verified and payout requirements are met. Pending postage or refund reviews can keep them held.</p>
    </div>
  </details>;
}
