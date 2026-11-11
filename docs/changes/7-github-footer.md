# Shared GitHub footer credit (#7)

## Contract and delivery path

Make the source project discoverable from every rendered view through one
accessible footer link. The maintainer authorized implementation, a merged PR
and production redeployment. This uses the neckbeard lightweight path: a
single shared HTML surface, no architecture delta, dependencies, persistence,
content-generation, API or database changes. Issue #7 supplies the specification;
separate architecture/spec/test-plan artifacts would duplicate that contract.

## Discovery and design

`index.html` owns the footer outside route-managed `main`; `js/app.js` changes
home/game/result state without replacing it. Add a native same-tab anchor with
clear text, existing visible keyboard focus and an underline. Wrap footer flex
items on narrow layouts. Per-game footers and JavaScript injection were rejected
because both would create duplication and omit future modules or failure views.

## Verification ledger

- Component: `npm test` passes 28 tests, including a new single-credit/shared-shell
  regression. `npm run format:check`, Rust formatting/clippy/tests and game-package
  validation pass. Four database tests are delegated to hosted CI's disposable DB.
- Browser: Chrome through Playwright, 360/768/1440-pixel widths, home, both games,
  unknown route, completed Fivefold result, refresh/resume and unavailable API.
  Exactly one correctly named/destined credit, focusable, with no horizontal
  overflow. Mobile screenshot inspected. A real scaffolded third module loaded
  through route-backed fixture files inherits the same credit after navigation.
- Accessibility scope: native anchor, accessible name, visible focus and inherited
  muted-text color; this is not a full screen-reader or WCAG conformance audit.
- Delivery gates: independent review and required hosted CI must pass for the exact
  PR head before merge. Production verification must establish the merged source
  revision, healthy API, rendered link and unchanged daily puzzle data.

## Release and recovery

Build the merged source on the production Docker host, not the Mac. Smoke-test
that immutable image before promoting it. Recreate only the web container:
worker, database, volumes, credentials and published editions are out of scope.
Retain the prior image and configuration for web-only rollback if health, rendered
credit or puzzle equivalence checks fail. Record actual release evidence on the PR.
