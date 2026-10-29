'use strict';

// Readiness checks are intentionally provider-neutral. This module never
// initiates a transfer, creates a recipient, or changes checkout behavior.
const SUPPORTED_METHODS = new Set(['global_payouts', 'approved_marketplace_provider']);

function assessDesignerPayout({country, method, providerApproved = false, complianceApproved = false, recipientVerified = false, payoutRailReady = false} = {}) {
  const reasons = [];
  if (typeof country !== 'string' || !/^[A-Z]{2}$/.test(country)) reasons.push('valid_country_required');
  if (!SUPPORTED_METHODS.has(method)) reasons.push('approved_payout_method_required');
  if (providerApproved !== true) reasons.push('provider_approval_required');
  if (complianceApproved !== true) reasons.push('compliance_approval_required');
  if (recipientVerified !== true) reasons.push('recipient_verification_required');
  if (payoutRailReady !== true) reasons.push('payout_rail_not_ready');
  return Object.freeze({
    country: typeof country === 'string' ? country : null,
    method: SUPPORTED_METHODS.has(method) ? method : null,
    payoutsReady: reasons.length === 0,
    reasons: Object.freeze(reasons)
  });
}

module.exports = {assessDesignerPayout};
