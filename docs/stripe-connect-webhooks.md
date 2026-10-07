# Stripe Connect readiness synchronization

Configure a live Stripe event destination for **connected accounts**, subscribing to `account.updated`, with URL:

`https://houseofbriar.shop/api/stripe/webhook`

Set that destination's signing secret as `STRIPE_CONNECT_WEBHOOK_SECRET` in Railway. Keep the existing `STRIPE_WEBHOOK_SECRET` for platform Checkout events. Do not overwrite it with the Connect secret. The server accepts either configured signing secret, including Stripe's multiple-v1-signature secret rotation format.

Use test-mode destinations and secrets for test environments. Stripe setup reference: https://docs.stripe.com/connect/webhooks

The handler only refreshes accounts already linked by `designer_profiles.stripe_account_id`. Event metadata cannot attach accounts. It retrieves the current account from Stripe rather than trusting an old event snapshot, persists payout/onboarding/requirements readiness and successful event IDs atomically, and returns 500 on retrieval failure so Stripe can retry. Duplicate successful event IDs do not fetch or update again. Unknown accounts are acknowledged without changes. Checkout continues to check Stripe directly.

Verify a signed connected-account test event reaches this URL and gets HTTP 200, then confirm the matching designer profile's readiness and `stripe_status_checked_at` update. Confirm payout disablement and new requirements appear after a real account update. Code deployment alone does not configure event delivery in Stripe.

## Legacy PayPal merchandise orders

PayPal merchandise checkout and Stripe seller transfers from PayPal orders remain disabled. Both admin full-order and seller-portion refund routes return HTTP 409 `refund_provider_unsupported` before any Stripe lookup, reversal, refund, or database mutation. Legacy PayPal refunds must be issued through the original provider and reconciled manually; House does not automatically record their completion. PayPal donations remain separate from marketplace payouts.
