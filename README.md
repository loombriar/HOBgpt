# House of Briar

A full-stack storefront prototype with a designer portal, validated multi-photo uploads, and a published-only gallery. The shop loads directly from the same SQLite-backed listing store used by the designer workspace, so a second gallery index is not required.

## Current release evidence

See [the release acceptance evidence](docs/release-acceptance-evidence.md) for the October 17, 2026 assessed commit, CI links, deployment observations and incomplete provider/device gates. Normal browser authentication now uses HttpOnly sessions; saved customer measurement profiles are encrypted and persistent. Off-site upload has been observed, while a production-backup restore drill remains unverified. Automated tests and a successful deployment do not constitute full launch signoff.

## Designer Studio options

The authenticated studio overview offers Active, Draft, Expired, Sold Out and Inactive filters with mutually exclusive counts, seller-scoped orders/request counts, and 30-day product-view event/session totals. View events are analytics, not verified people. Listings expire only when their designer explicitly ends them; no automatic listing lifetime is assumed. Reserved pieces cannot expire, and renewal creates a draft that must follow normal moderation before going live.

Designers can offer free gift notes per listing. Checkout validates opt-in and a 500-character maximum, stores notes per order item, and exposes them only in the owning designer’s authenticated order data. Notes are not public catalog content.

Shared Studio access is read-only and granted to an active designer account linked to its verified sign-in email. Helpers use their own sign-in; do not share passwords. They receive only listing titles/status, order item summaries, request counts and analytics counts. They cannot see buyer addresses, private measurements, gift notes, message contents or payment settings, or mutate the owner’s listings. Grants and revocations are audited and authorization is checked on every shared-dashboard request. This change does not enable buyer–designer open chat.

## Seller drafting tools

The listing editor can request a description draft, search tags and a style/aesthetic classification using the seller’s factual notes. Suggestions are reviewed and explicitly applied to editable fields; they never publish listings or replace garment categories. Requests require the seller’s consent to send listing text to OpenAI. Configure the server-only `OPENAI_API_KEY` and optional `HOUSE_LISTING_MODEL` (default `gpt-4.1-mini`). Missing configuration gives a clear unavailable response. Requests have hourly throttles, daily per-seller/global caps, bounded input/output, structured validation and sanitized errors. Seller facts cannot guarantee AI accuracy; the seller must check claims before normal save and moderation.

Photo enhancement uses local Sharp clarity cleanup, orientation correction and aspect-preserving optimization. It does not generate details, replace backgrounds or crop garments. Uploaded and saved listing photos get an enhancement preview alongside their original; adding an enhanced copy keeps the original in the listing editor and respects the ten-photo limit. Copies pass the ordinary upload endpoint’s mandatory image safety review when saved. Photo cleanup does not require the listing-generation API key.

## Shipping checkout

All new US orders include delivery in the listing price. Canonical quotes return zero delivery charges, regardless of legacy per-item rates or thresholds. Designers pay postage and packaging themselves and should price accordingly; the marketplace fee remains based on the sale price. The House does not reimburse or automatically purchase postage. Eligible designers may explicitly approve a live in-app label purchase when enabled, with the confirmed postage deducted from their earnings.

Seller Terms version `2026-10-17-live-postage` requires explicit acceptance before new sales. No acceptance is backfilled. Prior `2026-10-06` acceptance still permits fulfillment/payouts of already-paid orders, without weakening tracking verification or refund holds. Historical order shipping charges, totals and refund amounts stay intact. Existing listing prices are never automatically increased.

US address collection, private seller-scoped fulfillment details, handling times and carrier tracking remain required. Delivery timing is separate from designer preparation. Automatic tax calculation is not enabled by this change.

## House support agent

Signed-in shoppers can ask House support about policies and their own orders/tracking. The assistant reads the current rules/shipping pages and has exactly two tools: a buyer-scoped order lookup and creation of a human support ticket in the existing admin support queue. Escalation requires the shopper’s explicit permission. It never changes orders, refunds, payouts or accounts, and does not open buyer–designer chat. Questions and order summaries require consent before being sent to OpenAI; addresses, card details and buyer emails are not provided to the model. Configure `OPENAI_API_KEY` and optional `HOUSE_SUPPORT_MODEL`.

The agent allows at most three model turns/four tool calls, uses request idempotency for ticket creation, and enforces hourly plus daily per-account/global usage caps. Failed responses cannot leak provider messages. If the model fails after opening a ticket, the customer still receives the actual ticket reference. Guest shoppers and unavailable AI use the existing support email/form and public policies; order numbers alone are never proof of ownership.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env
npm start
```

Then open http://localhost:3000.

## CI and frontend build status

`.github/workflows/ci.yml` runs the backend regression suite, installs the marketplace lockfile, runs its gateway contract tests, and builds the complete React marketplace with Vite. The missing chat, inquiry flow, supporting UI, and base stylesheet files were recovered from the earlier app export without overwriting newer marketplace features.

To build the marketplace:

```bash
cd apps/default
npm ci
npm test
npm run build
```

Output is in `apps/default/dist`. For frontend development run `npm run dev`. This restores the build; it does not switch the Express server from its current root storefront to the React app or deploy either frontend.

The React app still expects same-origin `/api/*` backend routes plus Taskade's `/_genesis/auth` and `/api/taskade/*` services for sign-in, chat, and inquiry flows. A standalone Vite preview does not provide those services. Verify those hosting integrations and real checkout, signup, chat, and inquiry delivery before launch. CI's gateway unit tests and production build do not establish end-to-end service readiness.

The sample Jekyll deployment workflow has been removed. GitHub Pages cannot run this application's Express server, SQLite database, webhooks, or upload handling; deploy the backend to a Node.js host with persistent storage as described below.

## Designer flow

1. Open the Designer portal.
2. Sign in with a token from `.env`.
3. Add a listing and upload multiple images at once.
4. Save as a draft or submit.
5. If review is enabled, the listing stays hidden until admin approval.

## API summary

- `POST /api/session` — validate a designer token
- `GET /api/gallery` — public listings only
- `GET /api/my/listings` — authenticated designer listings
- `POST /api/listings` — create a draft with an idempotency key
- `PUT /api/listings/:id` — edit a draft/rejected listing
- `POST /api/listings/:id/images` — upload one image at a time
- `PUT /api/listings/:id/images/order` — reorder the assigned images
- `DELETE /api/listings/:id/images/:imageId` — remove an image
- `POST /api/listings/:id/submit` — submit for review or publish
- `POST /api/admin/listings/:id/approve` — admin approval
- `POST /api/admin/listings/:id/reject` — admin rejection
- `POST /api/admin/listings/:id/unpublish` — archive a public listing

## Data notes

The app stores listings and uploaded images under `.data/`.

## Production deployment checklist

House of Briar uses SQLite plus uploaded image files. Production hosting must provide a persistent writable volume and set `DATA_DIR` to a directory on that volume. Ephemeral container storage will lose catalog changes, orders, reservations, payout state, and uploaded images after a restart or redeploy.

Set `NODE_ENV=production` and configure `APP_ORIGIN` to the exact public HTTPS origin, for example `https://shop.example.com` with no path. The server intentionally refuses to start in production if this is missing or insecure.

Configure secrets in the hosting provider rather than committing them: `ADMIN_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `EASYPOST_API_KEY`, `EASYPOST_WEBHOOK_SECRET`, and `RESEND_API_KEY`. Configure `RESEND_FROM_EMAIL` with a verified sending domain. Legacy `DESIGNER_TOKENS_JSON` and `DESIGNER_IDENTITY_MAP_JSON` should only be set when those compatibility mappings are actually required.

Stripe must send its signed webhook to `/api/stripe/webhook`. EasyPost must send its signed webhook to `/api/easypost/webhook`. Use each provider's production webhook secret; do not reuse API keys as webhook secrets.

The built-in signup, report and customer-auth rate limits use the request IP. On Railway public HTTP ingress, the application reads the edge-overwritten `X-Real-IP` header to avoid grouping all shoppers under the reverse proxy address. Outside Railway, it uses the socket address and ignores forwarding headers. The app does **not** enable Express `trust proxy` globally or trust arbitrary `X-Forwarded-For` chains. Railway private-network requests bypass edge header sanitization: do not expose the same HTTP listener to untrusted private-network callers, because those callers can forge `X-Real-IP`. On another hosting provider, validate its proxy trust boundary before enabling client-IP header handling. The IP limit is an abuse-control heuristic, not a verified visitor identity.

Before launch, run `npm ci` and `npm test`, verify the persistent volume survives a redeploy, complete a Stripe test-mode purchase/refund and Connect payout flow, verify EasyPost tracking updates, and confirm transactional email delivery. The separate marketplace frontend now installs, passes gateway contract tests, and builds. Verify the frontend/backend hosting connection and Taskade authentication, chat, and inquiry services before treating it as ready to launch.

### Photo search

Signed-in shoppers can opt in to cloud photo search from the Shop page. The server validates still image bytes, strips metadata and resizes to 768 pixels before sending the reference to OpenAI with `store: false`. Search photos are not written to House disk or database; provider processing remains subject to OpenAI data policies. This is reference-photo to catalog-description style matching, not exact image identification, on-device AI inference or a fit guarantee. Only approved, published, available pieces from active, non-vacation, Stripe-connected designers are eligible; the current candidate window is the latest 120 published listings. Availability is rechecked after model processing. Strict output validation rejects invented IDs and duplicate results are removed. Clear photo and results cancels the browser request and clears local references; it cannot recall a request already sent to the provider. Limits: 10 searches per shopper per day, 100 total per day and 15 requests per IP per hour. `OPENAI_API_KEY` is required; optionally set `HOUSE_VISUAL_SEARCH_MODEL`.

Wearable applications, device-specific foldable testing, on-device model inference and spatial AR require separate implementation and are not included in this change. New controls use responsive grids, wrapping actions and accessible labels.

### Refund and payout safeguards

Stripe webhook subscriptions must include `refund.created`, `refund.updated`, and `refund.failed` in addition to the existing Checkout and Connect events. Refund events refresh the current provider record, verify its payment reference, currency and amount, and update the durable `order_refunds` ledger and order summary. Existing pending full refunds with a saved Stripe refund ID are also supported.

A refund holds its seller payout before any provider request; a full refund holds every seller. Individual seller refunds can be issued for separate sellers, but a full refund cannot be combined with seller refunds on the same order. Use the same refund action for safe retries/status checks. Uncertain requests older than 23 hours require provider review, and failed/canceled refund operations remain held for staff review. Admin order details include the refund ledger. A payout interrupted while its `payout_in_flight` marker is set must be reconciled with Stripe before clearing that marker; do not blindly retry or clear financial holds.

Listing inquiries allow the original item request plus the designer's Available/Not available response. Existing thread history remains visible, and further assistance goes through House customer support. Configured brand profile defaults are initialized once and preserve populated details and subsequent edits.

### Railway frontend integration

Build both applications with `npm ci && npm --prefix apps/default ci && npm --prefix apps/default run build`, then start with `npm start`. The original homepage and `/designers/room` remain the public storefront and House sign-in. React `/account` and `/shop` use the existing House designer credential only after `/api/my/designer-profile` validates it. The server advertises `house-token` mode through `/api/frontend-config`; House credentials never go to Taskade or URL parameters. Anonymous shoppers retain ordinary browsing and guest checkout. Cloud AI currently requires a validated House designer session on this Railway deployment; a separate visitor account provider is not configured.

### Designer signup alerts

Set `DESIGNER_SIGNUP_ALERT_EMAIL` in Railway to the inbox that should receive an immediate email when a new designer completes signup. Delivery uses the existing Resend outbox, including retry handling and an idempotent event key so duplicate signup requests do not create duplicate alerts.


## Off-site backups

`npm run backup:offsite` creates a WAL-safe local snapshot, verifies its manifest and SQLite integrity, uploads it to an S3-compatible private bucket, verifies the uploaded manifest, and removes remote objects older than the configured retention window.

Required production variables: `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, and `BACKUP_S3_SECRET_ACCESS_KEY`. Production startup requires `OFFSITE_BACKUP_ENABLED=true` and the required backup credentials. This is no longer opt-in. Configure these before deploying this change. Configuration alone does not verify a completed backup. Admin credentials must be at least 32 characters; prefer labeled `ADMIN_TOKENS_JSON` entries such as `{ "ops": "...", "finance": "..." }` so operator activity can be attributed. Optional variables are `BACKUP_S3_REGION` (defaults to `auto`) and `BACKUP_RETENTION_DAYS` (defaults to `30`). Use a bucket-scoped read/write credential and an HTTPS endpoint. For Cloudflare R2, use the account S3 endpoint and region `auto`.

The job intentionally uploads only after local verification succeeds. Keep the bucket private and independent of the Railway volume.

### Creative Portfolio subscriptions

Free creative profiles include five images. Premium Portfolio costs $4.99 USD/month and includes 30 images, grid/editorial/spotlight layouts, mint/coral/night colors, featured project text, and a count of private portfolio opens over 30 days. Clothing listings and existing designer directory permissions stay free. Casting Pass/Studio are still planned and cannot be purchased here.

Set `STRIPE_PORTFOLIO_PRICE_ID` to an active USD Price of 499 cents with a monthly interval and interval_count 1. Checkout validates the provider price before charging; there are no client-supplied prices or account IDs. Without the variable the free portfolio works, but paid checkout stays disabled. The existing `STRIPE_SECRET_KEY` needs Customer, Price, Checkout, Subscription, Invoice, and Billing Portal permissions. Use a restricted key with those permissions where available.

On the existing platform `/api/stripe/webhook` endpoint retain all current events and add `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`, and `invoice.payment_action_required`. Configure Stripe's customer portal for payment-method updates and cancellation; the app also provides a direct cancel-at-period-end action. No tax collection is enabled by this change; review Stripe Tax registrations and the tax treatment of portfolio subscriptions before enabling automatic tax.

Billing maps a server-created Stripe Customer to the authenticated House subject, never by email. Signed events retrieve current Checkout, Subscription and Invoice records; Premium requires the exact configured price, active status, a paid invoice owned by the same customer/subscription, and an unexpired paid period. Access and privileged requests also reconcile directly with Stripe to recover missed events. Replayed events are idempotent; delayed events cannot restore stale provider state. An unpaid renewal removes premium benefits without deleting images. Cancellation at period end keeps paid access until expiry. After expiry only five images are exposed to the private designer audience; owners can still remove saved extras. Account deletion with billing records requires support review to avoid orphaning an ongoing subscription.

Backend routes are under `/api/creative-house/subscription` (status, checkout, portal, cancel), `/my-portfolio` (images, settings, analytics), and `/portfolios/:slug` (existing designer audience). Admins can inspect `/api/admin/portfolio-subscriptions`. Portfolio media is transformed to metadata-free WebP and served through authenticated routes, with no public static media path. Verified House customer or designer sessions are required; subscription checkout does not create or verify an account.
