# House of Briar Android (Capacitor 8)

This is an **initial Android build scaffold**, not a Play Store-ready release. Capacitor 8 generates an Android project targeting API 36. It intentionally leaves the existing website and backend unchanged.

## Build

Use Node 22+, Android SDK 36, Java 21, and Android Studio. From the repository root:

```sh
npm --prefix apps/default ci
cd mobile
npm install
npm run android:init
npm run android:verify
cd android
./gradlew assembleDebug bundleRelease
```

Subsequent builds: `npm run sync` from mobile. Do not run `cap add android` again if the native directory already exists.

**Important:** The frontend depends on same-origin `/api/*` and Taskade authentication endpoints. A packaged `capacitor://localhost` / local HTTPS WebView origin is NOT the deployed backend origin. The native build can launch but **login, checkout, uploads, and external payment return are not yet guaranteed to work**. Before release, implement a reviewed API-origin strategy, cookie/CORS/CSRF and auth callback handling, Stripe browser/deep-link return, Android photo picker and Back navigation integration. Do not put server secrets in the app or disable WebView security. No production server URL is hardcoded.

## Release gates

- Confirm package ID `com.houseofbriar.market` and Play Console ownership before first publication (cannot be changed after release).
- Build signed AAB using a securely managed upload key; never commit keystores or passwords.
- Inspect manifest and merged permissions; minimize permissions and confirm no cleartext traffic.
- Inspect final AAB target API with bundletool and verify signing certificate fingerprint.
- Test a release-equivalent build on a physical Android 16 phone: cold launch, crashes/ANRs, login and session restore, Stripe test checkout/cancel/return, multi-photo upload and permission denial, system/predictive Back, network loss, keyboard, edge-to-edge and safe areas.
- Validate data safety disclosure, privacy policy, account deletion and Play Store policy before submission.

CI builds **unsigned** release AAB and debug APK for technical feedback only. It does not sign, publish, or prove physical-device functionality. The Android project is generated rather than committed; any future native customization must be captured reproducibly in scripts or checked into version control.
