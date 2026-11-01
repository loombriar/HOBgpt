# Designer PDF collection import — implementation plan

Status: proposed; not deployed. All changes belong on this feature branch until tested and reviewed.

## Existing application integration
- Designer Studio: `apps/default/src/pages/AccountPage.tsx` (authenticated designer access).
- Existing listing creation, image uploads, and moderation must be reused rather than bypassed.
- The server is `server.js`; confirm existing authorization, persistence, and upload limits before adding endpoints.

## Proposed workflow
1. Authenticated designer chooses a PDF catalog (max 20 MB, max 100 pages initially).
2. Server validates the PDF magic bytes, MIME type, page count, and limits. Store privately with a designer-specific owner and a generated opaque identifier. Never serve raw files publicly.
3. Background processing extracts text and candidate images; OCR or AI is optional and must not be required for basic operation. Scan files and restrict resource consumption.
4. Produce an import preview with proposed garment names, descriptions, candidate photos, sizes, and prices. Missing or uncertain values remain blank; never invent prices, stock, materials, or sizes.
5. Designer reviews each garment and confirms image rights and listing details. Save as private drafts using the existing listing validation, ownership, and moderation flow.
6. Designer explicitly submits approved drafts for House of Briar review. No automatic publication.

## API contract proposal (not yet implemented)
- POST /api/designer/collection-imports — authenticated PDF upload, returns import ID.
- GET /api/designer/collection-imports/:id — owner-only status and proposed draft entries.
- PATCH /api/designer/collection-imports/:id — owner-only corrections and item selection.
- POST /api/designer/collection-imports/:id/save-drafts — idempotently creates private drafts using existing listing services.
- DELETE /api/designer/collection-imports/:id — owner-only cleanup.

## Acceptance tests before merge
- Unauthorized users cannot upload or read another designer's import.
- Non-PDF, oversized, malformed, encrypted, and decompression-bomb files are rejected safely.
- Missing prices and uncertain extracted fields are never fabricated.
- Extracted images remain private until explicitly approved; file and listing access are owner-scoped.
- Retrying save does not duplicate products.
- Imported products remain drafts until existing moderation rules allow publication.
- Existing single-product listing creation, image upload, payouts, and storefront flows still work.
- Build and test pass in CI; confirm Railway deploy is healthy before considering production release.

## Rollout
Implement and validate behind a disabled-by-default feature flag. Test with permissioned sample designer PDFs before enabling for any users.
