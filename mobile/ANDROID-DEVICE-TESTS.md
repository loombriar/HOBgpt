# Physical Android release test record

Device model: ______  Android version: ______  Build SHA: ______
AAB SHA-256: ______  Signing certificate SHA-256: ______

| Gate | Steps | Result / evidence |
| --- | --- | --- |
| API | Inspect signed AAB manifest for targetSdkVersion >=36 | Pending |
| Signing | Confirm upload certificate matches Play Console | Pending |
| Permissions | Inspect merged manifest, deny and grant photo access | Pending |
| Crashes | Cold launch, force stop/restart, background, rotate; capture logcat and ANRs | Pending |
| Login | Sign up, login, logout, session expiry and return | Pending |
| Checkout | Stripe test payment, cancellation, browser return and order confirmation | Pending |
| Uploads | Select multiple photos, HEIC, invalid image, interrupted upload | Pending |
| Back | Gesture/hardware Back from product, cart, checkout, picker and login | Pending |

No gate passes solely because web/browser tests pass. Do not submit until all gates are evidenced.
