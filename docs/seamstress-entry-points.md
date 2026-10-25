# Seamstress sign-in and signup

The native and React homepages intentionally omit the **Shop the edit** hero button during launch preparation. Restore it as part of enabling shopping; this UI change does not change checkout configuration.

The shared native navigation and React header now contain a **Seamstresses** menu with distinct sign-in and signup entries. The homepage, Creative House, design-project and sewing-service invitations lead into the same flow:

- `/?visitors=signup&seamstress=signup` presents Seamstress signup. After House email verification it opens `/sewing-services.html#offer-services` to complete the service profile.
- `/?visitors=signup&seamstress=signin` presents Seamstress sign in. After email verification it opens `/sewing-services.html#service-inbox` for existing requests.

Both use the existing customer/creative House session. A designer shop and app-only reviewer password are not required. Rules consent and verified email remain required; services are published only when the owner explicitly checks the existing publish option and saves their profile. Existing customer sessions continue straight to the appropriate sewing workspace. Customer passkey sign-in retains the same fixed sewing destination. No arbitrary return URL is accepted.

Generic customer entry remains unchanged. The seamstress screens focus on email verification and sewing services instead of purchase-history panels or Google Play reviewer credentials.

Validation includes mobile and desktop signup, email-code sign-in with an existing account, fixed return destinations, dropdown bounds at narrow widths, original customer onboarding, design-project connections and existing room layouts. Backend tests, frontend tests, typecheck and production build pass locally. External email and image review are mocked in disposable browser-test fixtures; no deployment or credential changes are made.
