# House of Briar

A full-stack storefront prototype with a designer portal, validated multi-photo uploads, and a published-only gallery. The shop loads directly from the same SQLite-backed listing store used by the designer workspace, so a second gallery index is not required.

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

The built-in signup and checkout rate limits use the request IP. No reverse-proxy trust setting is enabled by default because the correct trust boundary depends on the hosting provider. If the production host places the app behind a proxy, validate the provider's documented proxy topology before configuring Express `trust proxy`; do not enable it globally without that validation.

Before launch, run `npm ci` and `npm test`, verify the persistent volume survives a redeploy, complete a Stripe test-mode purchase/refund and Connect payout flow, verify EasyPost tracking updates, and confirm transactional email delivery. The separate marketplace frontend now installs, passes gateway contract tests, and builds. Verify the frontend/backend hosting connection and Taskade authentication, chat, and inquiry services before treating it as ready to launch.

### Refund and payout safeguards

Stripe webhook subscriptions must include `refund.created`, `refund.updated`, and `refund.failed` in addition to the existing Checkout and Connect events. Refund events refresh the current provider record, verify its payment reference, currency and amount, and update the durable `order_refunds` ledger and order summary. Existing pending full refunds with a saved Stripe refund ID are also supported.

A refund holds its seller payout before any provider request; a full refund holds every seller. Individual seller refunds can be issued for separate sellers, but a full refund cannot be combined with seller refunds on the same order. Use the same refund action for safe retries/status checks. Uncertain requests older than 23 hours require provider review, and failed/canceled refund operations remain held for staff review. Admin order details include the refund ledger. A payout interrupted while its `payout_in_flight` marker is set must be reconciled with Stripe before clearing that marker; do not blindly retry or clear financial holds.

Listing inquiries allow the original item request plus the designer's Available/Not available response. Existing thread history remains visible, and further assistance goes through House customer support. Configured brand profile defaults are initialized once and preserve populated details and subsequent edits.
