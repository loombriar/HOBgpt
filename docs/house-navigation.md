# House navigation and account choices

The fixed header uses three role menus: Designers, Seamstresses and Creative House. One visible Sign in / Join link above them opens `/join.html`; it becomes My dashboard when an existing designer or customer session is detected. This page explains the existing account types and gives each workspace an explicit route. It does not merge accounts, create new authentication roles, or grant access.

- Designers: native designer dashboard, private notification inbox and public designer directory. The existing heart mailbox stays inside this menu.
- Seamstresses: sewing profile, private service requests (notifications) and shared design board. A designer shop is not required.
- Creative House: model, photographer, DJ and venue entry routes, designer signup and open calls. These use the existing House customer email verification and passkeys. The selected profile form role is preselected only from an allowlist; an existing saved profile remains authoritative.
- Shoppers and sketch creators remain available on the shared account-choice page.

Creative returns are fixed internal routes for model, photographer, DJ and venue; no arbitrary return URL is accepted. Existing rules consent, email verification and private-profile authorization remain in place. Dropdowns close on outside click, Escape and selecting a link, and opening one closes the others. Phone panels sit below the complete header and scroll within the viewport.

No Railway settings, credentials, payment configuration or account records are changed by this PR. Automated account and email flows use disposable local fixtures; they do not send live messages.
