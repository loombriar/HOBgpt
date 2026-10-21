# Founding Schools Initiative — implementation specification

Status: proposed, not deployed. Keep production unchanged until tests and legal review. The implementation does not yet include official school badges, dedicated school pages, school referral caps, or the proposed audit trail. The checkout change from the existing 9% commission to a proposed standard 7% is a financial policy change requiring explicit approval and staging verification.

## Commission eligibility
- Founding individual creators: first 50 approved and activated, permanent 5% platform commission.
- School-program creators: enrolled students or graduates within 24 calendar months of graduation at application approval; 5% for the first 12 months after creator activation, then 7%. Separate allocation from first 50.
- Other creators: 7% platform commission.
- Commission applies to discounted merchandise subtotal, excluding separately itemized shipping, sales tax, and gift-wrap charges under the proposed new policy. Confirm treatment of gift-wrap revenue before rollout.
- Creators pay processor fees separately. Display actual provider fee schedule before account activation.
- No retroactive fee changes. Store immutable commission-rate assignment with source and timestamp.
- Initial school referral allocation: 10 approved students per school, configurable, with explicit waitlist handling. Independent verified student applications may be accepted without school partnership.

## Data model proposal
schools(id, legal_name, display_name, website, partnership_status, badge_status, logo_permission_at, referral_cap, created_at)
school_applications(id, school_id, contact_name, contact_email, status, submitted_at, reviewed_at, reviewer_id)
student_verifications(id, creator_id, school_id, status, enrollment_or_graduation, graduation_date, verification_method, reviewed_at, expires_at)
commission_assignments(id, creator_id, rate_basis_points, program, approved_at, approved_by, immutable_rate_lock)
school_referrals(id, school_id, creator_id, referral_code_hash, status, created_at)
audit_events(id, actor_id, action, target_type, target_id, created_at, details_json)

## Required workflow
1. Public school application; public student application; creator authentication.
2. School approval by authorized admin; badge requires approval and trademark/logo permission for logos.
3. Student verifies enrollment or graduation within past 24 months; minimize document collection and limit retention.
4. Admin approval transaction assigns 500 basis points exactly once; prevent race conditions and duplicate founder allocation.
5. Creator connects payout provider and passes verification before listing/checkout activation.
6. On each order, server calculates platform commission from stored assignment, never client-supplied percentage.
7. Refunds reverse proportionate platform commission. Provider dispute/fee rules disclosed separately.
8. Audit all approval, denial, fee, and badge changes; add rate-lock regression tests.

## Safety and privacy
- Do not upload verification documents to publicly served storage; use authenticated access, encryption, retention limits.
- Require eligible adult status or implement appropriate guardian/minor handling before permitting sales.
- Do not represent payments to a for-profit marketplace as tax-deductible donations.
- School partnership never required for independently verified student eligibility.
- Schools are not guarantors of creator performance.
- Do not use school trademarks without permission.

## Acceptance criteria
- 50 general founder slots unaffected by school-program approvals.
- Student graduating exactly 24 months before approval is eligible; 24 months plus one day is not.
- Approved student retains the 5% rate until the 12-month anniversary of activation regardless of graduation or later school partnership termination; subsequent orders use 7%.
- Creator cannot modify commission through browser/API.
- Concurrent approvals do not overallocate school referral cap or general founder slots.
- Order totals with shipping/tax/discounts compute correct platform and processor fees.
- Admin can review and approve applications with an audit trail.
- No live rollout before passing automated and staging end-to-end tests.
