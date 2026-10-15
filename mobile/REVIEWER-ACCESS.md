# Google Play reviewer access

`/reviewer-login` provides reusable app-only password sign-in for one verified customer account and one verified designer account. It never grants admin access and never signs into the email provider. It is disabled unless `REVIEWER_LOGIN_EMAIL` is configured.

## Owner setup

1. Configure `REVIEWER_LOGIN_EMAIL=thee.house.of.briar@gmail.com` on the intended service. Do not put a password in environment variables or Git.
2. In House of Briar, create the dedicated customer account using that address and complete its emailed verification code and required terms acceptance. Use no personal customer data.
3. Within 15 minutes of email sign-in, open `/reviewer-login`, expand **Account owner: set up reviewer access**, select Customer / creative, and enter a unique app-only password twice. The owner must enter this password privately. Gmail passwords must not be used.
4. Create and verify a dedicated designer profile with the same address. Repeat enrollment for Designer. This role has the usual active designer access, including the Creative House directory. Do not use the founder/admin account. Keep this review profile unpublished and without payout/bank details or real orders.
5. In a separate browser session, test both role logins, favorites, measurements, creative profile editing, and designer screens. Account roles remain separate; enrolling requires a new mailbox-verified session, not a password-based reviewer session.
6. Enter the app-only credentials in Play Console; update navigation instructions. Do not certify access to premium/paid content until that access has actually been provisioned and tested. Do not claim that guest browsing alone provides full review access.

## Suggested navigation instructions (after setup and testing)

Open House of Briar. Tap Sign in / Sign up, then Google Play reviewer sign-in. Select Customer / creative or Designer and use the supplied app-only credentials for that role. No email code is required for reviewer password sign-in. Customer / creative opens shopping and creative account features; Designer opens the Designer Room. Public clothing browsing and the cart also work without sign-in.

## Security and revocation

Passwords use salted scrypt hashes. Successful sign-in issues the existing HttpOnly/SameSite session cookies. Sign-in and enrollment are rate limited and require a trusted same-origin request. Enrollment is bound to the allowlisted mailbox-verified account ID. It does not create accounts or mark email verified. Short passwords, other emails, admin roles, stale verification, and legacy-token enrollment are rejected.

A password change revokes password-based reviewer sessions for that role. Removing/changing REVIEWER_LOGIN_EMAIL disables existing reviewer credentials and sessions on startup; email verification is required to enroll again. Normal email-code sessions are unaffected. Customer account deletion removes its reviewer password as well.

The production-access application is separate from the app release and reviewer access declaration. Do not submit a full-access declaration until both role logins and all restricted features needed for review have been verified.
