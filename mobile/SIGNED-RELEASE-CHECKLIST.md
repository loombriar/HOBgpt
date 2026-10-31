# Android signed release: operator checklist

The manual workflow `.github/workflows/android-signed-release.yml` builds a signed AAB only. It does **not** publish to Google Play, configure authentication, or validate native app flows.

## Configure privately

1. Confirm the final package ID `com.houseofbriar.market` and the upload certificate expected by Google Play Console. If an app already exists in Play Console, **use its existing upload key**, or follow Google's upload-key reset process. Do not generate a replacement blindly.
2. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**. Configure:
   - `ANDROID_KEYSTORE_BASE64`: base64 encoding of the upload keystore file (single line, no newlines).
   - `ANDROID_STORE_PASSWORD`: keystore password.
   - `ANDROID_KEY_ALIAS`: upload key alias.
   - `ANDROID_KEY_PASSWORD`: key password.
3. Do not commit the keystore, place passwords in workflow logs, or paste secrets into issues or chat. Restrict who can run release workflows and protect the repository and signing key backups.
4. In **Actions → Android signed release (manual) → Run workflow**, choose the intended branch. Download the `android-signed-release-aab` artifact only after the workflow succeeds.
5. Independently compare the printed SHA-256 signing fingerprint with the Play Console upload certificate. Record the final AAB hash and the CI run URL.

## Release blockers

- The generated Capacitor app still needs an audited API-origin/authentication approach, Stripe external-browser return handling, uploads, and Android Back integration. A signed AAB is **not** a functioning mobile storefront by itself.
- Execute every gate in `mobile/ANDROID-DEVICE-TESTS.md` on a physical device using a release-equivalent build.
- Review permissions, privacy policy, account deletion, data safety, and store listing before Play submission.
- Do not upload to production or announce launch solely because CI is green.

## Customer measurements

Measurement profiles are currently **temporary in-memory entries**, not account-backed saved profiles. Refreshing the app clears them. Previous browser-stored measurement profiles are deleted when the measurement module is loaded; customers should be informed that prior saved profiles cannot be recovered. A secure, authenticated, access-controlled storage feature would require separate design, deletion controls, and tests.

## Verified release evidence — October 9, 2026

- The manual signed release completed successfully after installation and certificate verification fixes.
- The operator's Play Console screenshot shows version code 4 reached Preview and confirm with one non-blocking deobfuscation warning. Package and upload signing compatibility passed the upload checks.
- Current package: `com.houseofbriar.market`; version code: `4`; version name: `1.0.4`.
- Store review, publication, and physical-device behavior remain unverified. This evidence does not complete the device checklist or first-sale acceptance run.
