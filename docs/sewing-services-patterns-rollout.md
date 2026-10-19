# Sewing services and pattern sales

Staging review: Custom wedding-dress service flags appear on designer storefronts and the designer directory. Seamstress/tailor profiles have a separate, opt-in public directory; existing private talent directories keep their access rules. Quote requests share the requester's verified account email only with the selected provider. Agree price, lead time, shipping costs, and return arrangements before sending clothing. Service quotes do not create payments or bookings.

Sewing Patterns is a separate department with PDF and paper formats. Paper patterns use the existing stock/shipping/verified-carrier payout flow. PDFs use immutable private files, checkout-time version snapshots, verified-payment download access, refund holds, and idempotent seller transfers for digital-only groups. Mixed physical/digital groups still require carrier verification. Backups check both active and purchased PDF versions.

PDF purchases through the installed Android app are disabled by default. Before enabling ANDROID_DIGITAL_PATTERNS_ENABLED, verify the applicable Google Play billing or approved alternative-billing program, enrollment, region eligibility, disclosures, fees, reporting and required terms. Do not enable merely because web Stripe checkout works. Paper patterns and physical services are separate from digital-goods billing.

Before production promotion, complete staging browser tests, policy/billing review and seller/buyer walkthroughs. New features remain in draft PR #470 until reviewed.
