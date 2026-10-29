# Editorial app background

The repeating campaign artwork is replaced with a quiet, solid palette: warm ivory (`#f6f2ea`) in light mode and soft charcoal (`#202020`) in dark mode. Cards use slightly separated surfaces; antique gold is reserved for readable headline emphasis and small borders. The shared navigation, Creative House, sewing services, design portfolios and account chooser use the same palette. React shop/account surfaces use matching neutral theme tokens.

`botanical-backgrounds.css` retains its existing URL for compatibility, but no longer references repeating artwork. It retires only backdrop ornaments, preserves layout and product photography, and overrides the older campaign's forced light text, green/rust accents and hero gradients. Existing image assets and user profile uploads are not deleted or edited. Versioned stylesheet references are refreshed.

Validation covers both themes at phone/desktop widths, plain background surfaces, headline contrast, horizontal bounds, existing dark-room controls, theme persistence, room layouts and PayPal/Stripe donation entry. No authentication, payment, product, account or deployment settings change.
