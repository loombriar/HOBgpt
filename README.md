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

`.github/workflows/ci.yml` installs the root lockfile with `npm ci` and runs the backend regression suite with `npm test`. A passing Node.js CI run does not verify the separate React marketplace in `apps/default`.

The marketplace export is not yet independently buildable:

- Its manifest requests `@taskade/genesis-client`, `@taskade/parade-shared`, and `@taskade/parade-template-utils`. The attempted CI install returned a public npm 404 for `@taskade/genesis-client`; obtain Taskade's supported package source and access instructions before restoring the frontend install gate.
- Its build and dev commands reference missing `apps/default/scripts/build.mjs`.
- `apps/default/src/main.tsx` imports missing `apps/default/src/styles/genesis-base.css`.
- Its test command is `vitest run`, but this export contains no frontend test files.

Restore the missing template files, verify package access and meaningful frontend tests, then generate and commit `apps/default/package-lock.json`. Only after the marketplace tests and build pass should CI require those checks with `npm ci`, `npm test`, and `npm run build` in `apps/default`.

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

Before launch, run `npm ci` and `npm test`, verify the persistent volume survives a redeploy, complete a Stripe test-mode purchase/refund and Connect payout flow, verify EasyPost tracking updates, and confirm transactional email delivery. The separate Taskade marketplace frontend build currently depends on Taskade packages that are not available from the configured public npm registry; do not treat that blocked package installation as a successful frontend production build.
