'use strict';

// Simulation only. No payment-provider calls, persisted balances, or transfers.
// All values are integer minor units in a single currency.
function previewDesignerSettlement({grossCents, commissionCents, processingFeeCents = 0, refundedCents = 0, reservedCents = 0} = {}) {
  const values = {grossCents, commissionCents, processingFeeCents, refundedCents, reservedCents};
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(name + ' must be a non-negative safe integer');
  }
  if (commissionCents + processingFeeCents + refundedCents + reservedCents > grossCents) {
    throw new RangeError('Deductions cannot exceed gross amount');
  }
  return Object.freeze({
    ...values,
    designerNetCents: grossCents - commissionCents - processingFeeCents - refundedCents - reservedCents,
    simulationOnly: true
  });
}
module.exports = {previewDesignerSettlement};
