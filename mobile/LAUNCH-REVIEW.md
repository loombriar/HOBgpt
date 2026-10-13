# Launch review — October 12, 2026

## Verified in source and deployment

- Website serves the updated storefront, Creative House, optional Premium Portfolio checkout, and privacy/account deletion routes.
- Native package ID is com.houseofbriar.market and Capacitor loads https://houseofbriar.shop over HTTPS. Website updates therefore appear in the connected native app; this does not change the installed native version or satisfy Play review.
- Capacitor verification requires compile/target API 36. The signed-release checklist records version 4 / 1.0.4 as accepted at Preview and confirm on October 9; current Console state was not accessible in this review.
- PWA manifest now describes shopping and creative collaboration, provides Shop/Creative House shortcuts, and matches the current palette. Service worker v3 provides a dedicated offline page, with no offline payment/account API cache.

## Clothing launch dependency

No Shippo or EasyPost API key was listed on the production service during review. Shipment submission calls provider verification before persisting tracking. Seller transfers remain held until real carrier movement is verified. Disabling a shipping integration alone does not provide a functioning manual fulfillment/payout path. This review did not change delivery charges, checkout availability, or payout safeguards.

Browsing and free profile recruitment can proceed independently. Before live clothing sales, complete a provider-backed fulfillment run or implement and verify an audited manual tracking/payout workflow without removing refund holds or seller isolation.

## Google Play checks still needed

1. Inspect the actual Play Console dashboard and publishing overview: store listing, screenshots, contact details, countries, content rating, target audience, Data safety, app access/reviewer instructions, privacy URL and account deletion declarations. Do not mark these complete from source files alone.
2. If new personal-account testing rules apply, complete the Console-required closed test (currently 12 opted-in testers continuously for 14 days) before applying for production access.
3. Verify the final signed AAB target SDK >=36 and upload certificate against Console. The current workflow hardcodes version code 4/name 1.0.4; a new upload needs a code higher than every uploaded release. Confirm the current maximum before changing it.
4. Complete mobile/ANDROID-DEVICE-TESTS.md on a physical phone. Its gates remain NOT TESTED; signing/compilation is not device evidence.
5. Review Premium Portfolio digital subscriptions under Play Payments policy. Physical clothing and digital feature subscriptions have different billing rules. In-app Stripe subscriptions require an applicable approved alternative-billing/external-offers program or a compliant Play Billing implementation. Do not assume an external Stripe page or a PWA wrapper is exempt. Website Stripe checkout remains configured; no Android billing policy solution was implemented by this review.
6. Complete real Stripe test-mode subscription and first-sale acceptance flows, including renewals/cancellation, tracking, payout/refund and delivered email notifications.

Official references:
- https://support.google.com/googleplay/android-developer/answer/11926878
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://support.google.com/googleplay/android-developer/answer/9858738

Play Console inspection was blocked by automatic browser approval review, which reported the unexpected origin google.play rather than play.google.com. No Console declarations, releases, or production rollout were modified.
