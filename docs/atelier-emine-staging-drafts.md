# Atelier Emine staging draft import

Only the exact Railway environment name `staging` imports the owner-authorized supplied catalog at startup. No production import occurs. This adds a suspended placeholder designer (`atelier-emine-draft`) and 89 draft/pending listings. The placeholder email uses the reserved `.invalid` domain; it is not the seller's email. No seller login, terms acceptance, Connect account, payout approval or message is created.

The supplied 529 image URLs are preserved, without server-side downloads or generated replacements. A scaled preview of the supplied logo appears only in the authenticated review view. Model descriptions, supplied GBP price, approved USD snapshot, colour, weight, care and shipping source data are retained. Quantity 10,000 is not imported as stock; all records are made to order with zero physical stock, zero additional shipping charge and provisional 1–5 day handling.

Open `/admin#atelier-emine-drafts` after signing in to staging. The collection supports search, full descriptions, direct photo links and persisted staff notes. Staff notes never mark seller approval. Four records warn about two identical-gallery pairs. This view is separate from the moderation queue: these listings are drafts, not pending submissions.

The import runs transactionally with stable SKU-based identifiers. Restarting does not overwrite edits, notes, status or deleted listings. It rejects identity/SKU collisions and malformed source records. It does not alter an existing real Atelier Emine account. If an identity has already been reassigned, reconcile manually before importing again.

Before any future activation: verify the actual business representative and email, arrange secure account handoff, obtain seller confirmation of each item and disputed photos, collect actual seller terms acceptance, and integrate/verify a supported payout route for the Turkish business. Do not infer US residency or create an unsupported Connect account. Existing moderation, checkout and payout guards remain in force. This change does not implement seller handoff, approval or live sales.

Validation: staging import/restart/idempotency, production exclusion, original source preservation, no partial invalid imports, real app admin authentication, public gallery and storefront exclusion, checkout rejection, and direct approval rejection. Existing commerce and payout guards also run.
