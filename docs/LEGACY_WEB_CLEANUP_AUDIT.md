# HUGPONG Legacy Web Cleanup Audit

## Final result

Phase 9 now uses one React/Vite single-page application. Express serves the generated Vite build at the web root after all authentication and API routes. React Router owns public, legal, authentication, and role-workspace URLs, including direct refresh.

No essential workflow requires a page-specific legacy HTML workspace. The obsolete HTML, stylesheet, DOM controllers, role guards, Firebase global bridge, schema projection, consent script, and bundled QR script were removed after both removal groups passed the build and applicable server tests.

## Runtime dependency map

```text
Express
├── /auth/* and /api/* ─────────────> authoritative authentication and mutations
├── /health and /api/data ──────────> status endpoints
└── every other GET ────────────────> web/react-dist/index.html
    └── React Router
        ├── /                         public landing
        ├── /login                    login + OTP + required password change
        ├── /privacy                  privacy policy
        ├── /terms                    terms
        ├── /cookies                  storage policy
        └── /workspace/:role/:section guarded role features
            ├── Express API services  mutations
            └── Firebase subscriptions read-only local replica
```

## Final route ownership

| Surface | React owner |
| --- | --- |
| Public landing | `LandingPage.jsx` |
| Privacy, terms, storage policy | `LegalPage.jsx` |
| Consent notice | `ConsentBanner.jsx` |
| Login, OTP, password completion | `LoginPage.jsx`, `AuthProvider.jsx`, `platformAdapter.js` |
| Role correction and section guards | `roleRouting.js`, `WorkspacePage.jsx` |
| Users, farms, fields | `RegistrySections.jsx` |
| Operations / Take Over and cycles | `OperationsSections.jsx` |
| SRA prices, reports, certification, QR | `RegulatorySections.jsx` |
| History, diagnostics, support, settings | `SystemSections.jsx` |
| Authenticated read replica | `firebaseClient.js`, `replicaStore.js` |
| Server mutations | `apiClient.js`, `domainApi.js` |

## Removed files

HTML:

- `web/dashboard.html`
- `web/index.html`
- `web/login.html`
- `web/privacy-policy.html`
- `web/terms-and-conditions.html`
- `web/cookie-policy.html`
- all three `web/roles/*/dashboard.html` files

CSS:

- `web/admin.css`

JavaScript:

- all three legacy role controllers
- `web/shared/core.js`
- `web/shared/core-platform.js`
- `web/shared/core-dashboard.js`
- `web/shared/core-operations.js`
- `web/shared/firebase-config.js`
- `web/shared/firebase-init.js`
- `web/shared/webDataStore.js`
- `web/shared/firestore-schema.js`
- `web/shared/auth-routing.js`
- `web/shared/qrcode.min.js`
- `web/shared/consent-banner.js`

## Retained web files

- `web/react-app/`: the maintained React/Vite source application.
- `web/react-dist/`: generated, ignored production output created by `npm run build`.
- `web/logo.png`: reusable non-code brand asset; it has no legacy routing or runtime authority.

## Preserved architecture

- Express remains the authentication and mutation authority.
- Firebase custom authentication enables read-only Firestore subscriptions.
- Firestore Security Rules deny all canonical client writes and credential access.
- Submitted operations retain the `ACTIVE → ARCHIVED` lifecycle; React exposes no deletion or approval state.
- Audit certification remains an `audit_reports` action restricted to SRA Admin.
- Farm Manager Take Over creates a scoped operation through `/api/logs`; it is not operation approval.
- The mobile explicit outbox and its conflict/idempotency behavior are unchanged.

## Verification

- React production build: passed.
- React unit tests: passed.
- Full server security/RBAC/lifecycle/outbox/migration suite: passed after stale coexistence tests were updated.
- Source scans: no active legacy HTML navigation, role workspace path, global bootstrap, or direct client Firestore mutation remains.
- No Playwright suite exists in this repository; direct-route HTTP smoke verification is recorded in the Phase 9 migration report.
