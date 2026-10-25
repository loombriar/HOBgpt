# Guided first listing

The account dashboard at `/account#designer-listings` groups the existing listing controls into Photos, Details, Measurements, Price & shipping, and Review. The standalone Designer Room links directly to this flow. Back, Next and numbered step buttons preserve form state; readiness actions reveal and focus the relevant field.

Unfinished **new listing text** is automatically saved in this browser under the authenticated designer profile ID. A returning designer can explicitly resume or discard it. Photos, AI consent, credentials and marketplace-rule consent are not stored. Photos must be selected again after refresh. Storage failures display a warning and do not block manual account saves. Existing listing edits require Save draft and retain optimistic version checking.

Save draft uploads photos and saves to the designer account; it never submits a new piece for review. The existing separate review submission and approval gates remain in place. Failed photo uploads retain the newly created listing ID/version so retries update the same draft instead of creating another listing.

Validation: 414 backend tests, 97 frontend tests, TypeScript and production build passed locally. Browser scenarios cover mobile/desktop navigation, refresh/resume, readiness navigation and private draft saving. Local browser execution was blocked by a failed Chromium download; CI must complete those scenarios before merge.
