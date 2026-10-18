# Optional customer and designer passkeys

Customers and designers sign in by email, open Account settings → Passkeys, name their passkey, and select Add a passkey. A recent verified session (15 minutes) is required to add or remove one. Passkeys require user verification and a discoverable credential; devices can offer a fingerprint, face recognition, device PIN, or a compatible credential provider. Email sign-in remains available. Administrator MFA is unchanged.

The server stores public keys and identifiers, never biometric data, device PINs or private keys. Registration is bound to the signed-in account and a single-use, five-minute browser challenge. Authentication verifies the challenge, origin, server-configured RP ID, user verification, user handle, public-key signature and counter before issuing the existing role-specific HttpOnly session. Removed passkeys revoke their passkey sessions. Reviewer-password sessions cannot enroll credentials. Account deletion removes passkeys.

## Web rollout

Deploy the feature commit to staging first and use a real compatible device to add, sign out, sign in, and remove a passkey. Test cancellation and email fallback. Test both customer and designer accounts and both themes. Use the site's canonical hostname: passkeys on a Railway staging domain are separate from houseofbriar.shop. No production accounts are automatically enrolled.

## Android release

The reproducible native configuration enables guarded Android WebView WebAuthn support and the Credential Manager dependencies. It requires a new Android build; existing installed builds do not gain this native setting from a website deploy.

Before distributing the new build, set Railway `ANDROID_APP_SIGNING_SHA256` to the public **app-signing key certificate SHA-256 fingerprint** shown in Google Play Console → App integrity → App signing. Use the Play app-signing certificate, which signs installed apps, rather than the upload certificate. Enter colon-separated uppercase hex; comma-separate fingerprints only when Play lists more than one active app-signing certificate. Never enter a signing private key or keystore password.

The website serves the association at `https://houseofbriar.shop/.well-known/assetlinks.json`, for package `com.houseofbriar.market` and only the `get_login_creds` relation. Without a valid configured certificate the endpoint returns an empty list. Do not insert sample or debug fingerprints in production. Verify the association on the installed Play-signed build, then test creation, sign-out, sign-in, removal, cancellation and email recovery on a physical Android device before claiming Android app support.

Official implementation references: https://simplewebauthn.dev/docs/packages/server and https://developer.android.com/identity/sign-in/credential-manager-webview .
