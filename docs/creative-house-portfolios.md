# Creative House portfolio implementation plan

## Agreed pricing
- Free: up to 5 portfolio images, public biography, location, creative role, shareable URL, collaboration discovery.
- Premium: $4.99/month, up to 30 images, configurable layout and style, featured projects, view analytics.
- Eligible roles: model, photographer, designer.
- Designers' existing clothing listings stay free.
- No payments until subscription activation, self-service cancellation, and access enforcement are implemented and tested.

## Phase 1: secure accounts and free portfolios (required before launch)
- Support adult creative accounts with verified email and secure sessions; reuse existing designer sessions for linked designer portfolios without exposing private seller data.
- Public display name, role, broad location, biography, portfolio projects and media; private email never returned from public APIs.
- Server-side role and ownership checks for all create/edit/delete routes; no anonymous edits or untrusted client-selected owner IDs.
- Image validation, file limits, moderation/reporting, and deletion; strip image metadata; no public storage of private contact details.
- Public profiles must be opt-in, and searchable only after publication; account deletion and privacy controls.
- Models and photographers must be 18+ for initial release.
- Profile page and portfolio editor; accessible mobile layout.

## Phase 2: subscriptions
- Stripe recurring price at $4.99/month (or provider equivalent); use hosted checkout and customer portal, never collect card details directly.
- Verified, idempotent webhook events as authoritative subscription state; protect against duplicate and out-of-order events.
- Enforce free/premium gallery limits server-side; downgrade keeps data safely but limits visibility without deleting paid images.
- Self-service cancellation, billing history, failed-payment handling, clear renewal disclosures, taxes and refunds policy.
- Analytics count meaningful public profile views without storing unnecessary visitor personal data.
- Test upgrade, renewal, failed payment, cancellation, and access downgrade before accepting real subscriptions.

## Phase 3: collaboration applications
- Private, consent-based applications and communication; anti-spam controls and reporting.
- Clear paid/unpaid compensation labels; never imply paid promotion equals verification.
