export type Earnings={salesCents:number;houseFeeCents:number;designerShareCents:number;postageChargedCents:number;postageRefundCents:number;postageCents:number;netEarningsCents:number;payoutAmountCents:number;postageHold:boolean;insufficientEarnings:boolean;customerRefunded:boolean;customerRefundHold:boolean;unrecoveredPostageCents:number;postPayoutCreditCents:number;testMode:boolean};
const money=(cents:number)=>`$${(cents/100).toFixed(2)}`;
export default function EarningsBreakdown({earnings:e}:{earnings:Earnings}) {
  const rows=[['Sale total',money(e.salesCents)],['House fee',`− ${money(e.houseFeeCents)}`],['Postage',`− ${money(e.postageChargedCents)}`],...(e.postageRefundCents?[['Confirmed postage refund',`+ ${money(e.postageRefundCents)}`]]:[]),[e.testMode?'Sample earnings after postage':'Earnings after postage',money(e.netEarningsCents)]];
  return <section aria-label={e.testMode?'Sample earnings breakdown':'Earnings breakdown'} className="mt-4 rounded-xl border border-border p-4 text-sm"><h4 className="font-semibold">{e.testMode?'Sample earnings breakdown':'Earnings breakdown'}</h4><dl className="mt-3 space-y-2">{rows.map(([label,value],i)=><div key={label} className={`flex justify-between gap-4 ${i===rows.length-1?'border-t border-border pt-3 font-semibold':''}`}><dt>{label}</dt><dd className="tabular-nums">{value}</dd></div>)}</dl>
    {e.testMode&&<p className="mt-3 text-xs text-muted-foreground">Sample amounts only. No real charge or payout.</p>}
    {e.postageHold&&<p className="mt-3" role="status">Postage is awaiting carrier confirmation or review. Payout remains held.</p>}
    {e.insufficientEarnings&&<p className="mt-3" role="status">Postage exceeds this order’s earnings. No negative payout or automatic charge will be made.</p>}
    {e.customerRefunded&&<p className="mt-3">The customer refund is confirmed. No designer earnings are payable for the refunded portion.</p>}
    {e.unrecoveredPostageCents>0&&<p className="mt-3">Unrefunded postage of {money(e.unrecoveredPostageCents)} needs House review. A customer refund does not cancel the postage label.</p>}
    {e.postPayoutCreditCents>0&&<p className="mt-3">A postage credit of {money(e.postPayoutCreditCents)} arrived after the payout was fixed. House review is required; the original payout will not be sent again.</p>}
  </section>;
}
