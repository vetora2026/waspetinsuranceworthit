# WasPetInsuranceWorthIt.com

Astro site deployed to Cloudflare Workers/Pages. Static calculator + article pages.

## Build

- `npm run build` — must finish with zero errors. A `postbuild` hook runs `npm run check`
  (canonical/sitemap assertions), so a build fails if canonicals drift.
- `npm run check:a11y` — axe against every sitemap URL. Not part of the build: it needs a
  running preview server.

## Analytics

Cloudflare Web Analytics is on for this site. Cloudflare injects it at the edge, so it is
not in the repo. Privacy and about copy must never say the site has no analytics.

## Performance and accessibility

- `/_astro/*` must be served `max-age=31536000, immutable`. On Cloudflare Pages all matching
  `_headers` rules apply, so never let a catch-all rule set Cache-Control on assets.
- CSS is inlined (`build.inlineStylesheets: 'always'`).
- Run `npm run check:a11y` after any colour or layout change; zero `color-contrast` and
  `target-size` violations.
- Wrap every email address in `<!--email_off-->…<!--/email_off-->` so Cloudflare does not
  inject its email-decode script.
- `scripts/check-canonical.mjs` runs after every build and must pass.
