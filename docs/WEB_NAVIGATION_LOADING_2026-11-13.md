# Web navigation delay and loading feedback

## Cause

The installed React Router wraps browser navigation in a React transition. HUGPONG lazy-loads workspace modules, but its only route-level Suspense boundary surrounded the whole route tree. After that boundary had displayed a page, a transition to another unresolved module could retain the previous page while browser history had already updated the address. The loading fallback was consequently absent during the pause.

The Prices and Fields screens already render their own data-loading states after mounting; their API reads run in effects. This fix addresses the earlier page-module loading phase. It does not claim to remove all network or rendering latency.

## Database / server / Web / Mobile

- Database/schema: unchanged; no data migration or business-record writes.
- Server/API/controllers: unchanged. Authentication, RBAC, canonical mutations, live subscriptions, request budgets and offline conflict handling are retained.
- Web: `AppShell.jsx` now wraps its outlet in `RouteContent.jsx`, which keys the page's Suspense boundary by pathname. A newly opened page can show `RouteLoadingState.jsx` immediately while the shell remains mounted. The accessible loading state contains text, a spinner and skeleton placeholders, respects reduced motion, and disappears when the page module is ready. Query/filter changes do not reset the boundary.
- Web optimization: the existing `lazyWithRecovery.js` shares each module promise between intent preloading and actual navigation. `App.jsx` registers existing route aliases, and Sidebar plus responsive bottom navigation warm only the selected link's code on pointer entry, keyboard focus or pointer down. Successful modules remain reusable; failed speculative loads can retry without reloading the app. Preloading skips offline, data-saver and 2G connections and does not execute data-fetching component effects. No periodic polling or new data cache was introduced.
- Android: inspected `RootNavigator.js` and `CustomBottomTabBar.js`. Native tabs use React Navigation with locally bundled `getComponent` screens, lazy mounting, inactive-screen detachment/freezing, native selection feedback and existing cached data. They do not use BrowserRouter or download workspace chunks during navigation. No Android source or APK was changed for this browser-specific issue. Phone browsers receive the same Web fix.

Modified application files: `web/react-app/src/App.jsx`, `components/layout/AppShell.jsx`, `RouteContent.jsx`, `RouteLoadingState.jsx`, `Sidebar.jsx`, `MobileBottomNav.jsx`, and `utils/lazyWithRecovery.js`. Package/lock changes add development-only jsdom/esbuild for executable DOM regression coverage; their transitive regex dependency was updated to its patched version.

## Verification

- **776 server tests passed**, `output/navigation-server-tests.tap`.
- **65 Web tests passed**, `output/navigation-web-tests.tap`.
- New real React DOM/BrowserRouter tests hold a lazy module unresolved and confirm that navigation updates the URL, shows a loading status, removes the old page, and preserves the shell. They also check cached visits without artificial delay, filter state preservation, rapid navigation with late module completion, shared preloads, speculative failure recovery, and network/data-saver restrictions.
- Web production build passed, `output/navigation-web-build.txt`. The main entry is approximately 142.33 kB gzip; development test tools are excluded from the production bundle.
- Three Wrangler activation attempts returned Cloudflare error `10013` after upload. A subsequent request through Cloudflare's documented deployment API succeeded. Candidate version **d08a9081-ae6f-457e-91e5-322d9b89d955** is active; deployment **13aa3a7b-423d-435d-b9f1-3b5e7b38ca0d**. No bindings, secrets, domains or database records were changed to work around the activation failure.
- Live `/`, `/prices` and `/fields` returned 200 and referenced `/assets/index-DTnkKIAa.js`. That asset matched the local production build byte-for-byte. `/health/ready` returned 200 in active mode. Evidence: `output/navigation-live-verification.json` and `output/navigation-version-activation.json`.

## Remaining limits

Signed-in physical-device timing and visual acceptance were not performed. DOM tests verify navigation behavior, not measured improvements on the beneficiary's device or connection. A browser already running the previous JavaScript needs one page reload to load this release. The existing Vite development-tool advisory remains outside this navigation change; the new test dependency's reported advisory was patched.

Reference: React documents retaining revealed content during transitions and resetting Suspense boundaries for a new destination in its [Suspense reference](https://react.dev/reference/react/Suspense#resetting-suspense-boundaries-on-navigation). Cloudflare documents the activation endpoint in [Create Worker Deployment](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/).
