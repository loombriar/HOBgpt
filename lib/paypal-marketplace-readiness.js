'use strict';

// Preflight only: this module cannot create orders, capture funds or send payouts.
// Marketplace approval and provider-specific settlement design are required before wiring.
function marketplaceSandboxReadiness(env = process.env) {
  const environment = String(env.PAYPAL_ENVIRONMENT || '').toLowerCase();
  const configured = Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
  const sandbox = environment === 'sandbox';
  const approval = env.PAYPAL_MARKETPLACE_APPROVED === 'true';
  const reasons = [];
  if (!sandbox) reasons.push('sandbox_environment_required');
  if (!configured) reasons.push('sandbox_credentials_required');
  if (!approval) reasons.push('marketplace_approval_not_confirmed');
  return Object.freeze({
    readyForSandboxPlanning: sandbox && configured,
    readyForMarketplaceTransactions: false,
    reasons: Object.freeze(reasons),
  });
}
module.exports = { marketplaceSandboxReadiness };
