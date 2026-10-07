// Rates are flat US amounts per piece. Thresholds use the seller's merchandise
// subtotal before discounts and exclude gift wrapping and other sellers.
function applyShipping(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.designerId)) groups.set(item.designerId, { designerId: item.designerId, designerName: item.designerName, merchandiseCents: 0, shippingCents: 0, shippingReady: true });
    groups.get(item.designerId).merchandiseCents += item.grossCents;
  }
  for (const item of items) {
    const group = groups.get(item.designerId);
    const rate = item.shippingCostCents;
    const valid = Number.isSafeInteger(rate) && rate >= 0;
    const threshold = item.freeShippingThresholdCents;
    item.freeShippingApplied = valid && Number.isSafeInteger(threshold) && threshold > 0 && group.merchandiseCents >= threshold;
    item.shippingCents = valid ? (item.freeShippingApplied ? 0 : rate * item.quantity) : null;
    if (!valid) group.shippingReady = false;
    else {
      group.shippingCents += item.shippingCents;
      item.lineTotalCents += item.shippingCents;
      item.designerAmountCents += item.shippingCents;
    }
  }
  const designers = [...groups.values()];
  const shippingReady = designers.every(group => group.shippingReady);
  return { shippingReady, shippingCents: shippingReady ? designers.reduce((sum, group) => sum + group.shippingCents, 0) : null, designers };
}
module.exports = { applyShipping };
