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

`.github/workflows/ci.yml` runs the backend regression suite and separately installs the marketplace lockfile and runs its gateway contract tests. A passing CI run does not verify a complete React marketplace build or its UI.

The marketplace installs from public npm with `npm ci` in `apps/default`. Unused Taskade runtime/template packages were removed, and the preview logger's payload types are defined locally. The gateway tests cover duplicate-write prevention, invalid response handling, conditional reads, and pending-request tracking.

The marketplace export is not yet independently buildable. Restore these missing template files from the original source before requiring a production build:

- `apps/default/scripts/build.mjs`, referenced by the build and dev commands.
- `apps/default/src/styles/genesis-base.css`, imported by `main.tsx`.
- `apps/default/src/components/blocks`, providing `FloatingAgentChat` to `HouseShell.tsx`.
- `apps/default/src/lib/genesis-flows`, providing `submitForm` to `InquiryForm.tsx`.

The gateway tests do not replace browser tests of checkout, signup, chat, or inquiry delivery. Verify those flows and `npm run build` after restoring the template before enabling a production build gate.

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

Before launch, run `npm ci` and `npm test`, verify the persistent volume survives a redeploy, complete a Stripe test-mode purchase/refund and Connect payout flow, verify EasyPost tracking updates, and confirm transactional email delivery. The separate marketplace frontend installs and its gateway contract tests pass, but its production build remains blocked by missing template source files; passing CI does not establish frontend deployment readiness.
