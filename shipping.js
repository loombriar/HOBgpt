// US delivery is included in the listed price. Designers fund their own postage.
// Stored rates remain available for historical orders; new quotes never add them.
function applyShipping(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.designerId)) groups.set(item.designerId, { designerId: item.designerId, designerName: item.designerName, merchandiseCents: 0, shippingCents: 0, shippingReady: true });
    groups.get(item.designerId).merchandiseCents += item.grossCents;
    item.freeShippingApplied = true;
    item.shippingCents = 0;
  }
  return { shippingReady: true, shippingCents: 0, designers: [...groups.values()] };
}
module.exports = { applyShipping };
