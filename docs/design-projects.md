# Design portfolios and maker connections

Signed-in customers and designers can open **My sketches & custom projects** from their account, or use `/design-projects.html`. The Creative House and sewing-services directory link to the same page.

1. Create a project with a creative alias, title and description. Budget, size/fit notes and preferred completion date are optional. New projects always start private.
2. Upload up to three JPEG, PNG or WebP drawings per project. Each upload requires permission to share the work and explicit consent for an OpenAI image safety check. The existing bounded image-work pipeline removes metadata, limits dimensions and normalizes the drawing to WebP; unavailable or unsuccessful safety checks do not save the image.
3. Choose Share with makers. Only active House designers and signed-in published sewing-service providers offering **Bring sketches to life · custom garment construction** can browse. Other customers and anonymous visitors cannot retrieve drawings. The board omits owner account IDs and contact emails.
4. A maker can offer help once per project. The owner sees their display name, note and status, with no email before acceptance. Accepting one offer shares both account emails, retains drawing access for that maker, removes the project from the board, and declines the other pending offers. Acceptance is an introduction, not a booking or payment.
5. The owner can remove drawings, make an unmatched project private again or delete the whole project. Removing the last drawing makes an unmatched project private. Project deletion removes drawing bytes and offers. Customer-account deletion removes private project records and images; existing connection records require the established privacy-review path.

Limits: 10 projects per owner, 3 images per project, 10 MiB upload limit and 2 MiB per normalized drawing, 50 offers per project, bounded list endpoints, per-account mutation and image-work limits. Drawing bytes reside in SQLite so normal database backups include them. Sensitive project APIs and authenticated image responses use `Cache-Control: no-store`.

Validation: backend tests cover private/sharing access, ownership, cookie request origin, service-provider eligibility, opt-in image processing, failed moderation/provider errors, upload limits, contact release on acceptance and customer deletion. End-to-end tests exercise the real upload/share/offer/accept/delete journey at mobile and desktop widths using disposable data and mocked external image review. No real messages, bookings or payments are sent by these tests.

Before production rollout, verify the existing image-review provider configuration in staging and exercise a real original sketch with consenting test accounts. No deployment configuration or credentials are changed by this feature.
