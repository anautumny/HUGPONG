# HUGPONG Phase 9 — React/Vite Migration

## Status

Phase 9 is complete. The web application is a React/Vite SPA at `http://localhost:3000/`. Page-specific legacy HTML workspaces and DOM controllers are no longer served or retained.

## Architecture

- Express owns authentication, OTP verification, password changes, RBAC, resource-scope checks, validation, and all persistent mutations.
- React owns rendering, routing, form orchestration, and role-scoped navigation.
- The Firebase web SDK signs in only with a server-issued custom token and maintains authenticated read subscriptions.
- `replicaStore.js` replaces local read collections from Firestore snapshots. It never manufactures an upload.
- `domainApi.js` sends explicit server mutations with idempotency and base-version metadata.
- Mobile remains the offline-first mutation client and continues to use its explicit durable outbox.

## Routes

```text
/
/login
/privacy
/terms
/cookies
/workspace/super-admin/:section?
/workspace/sra-admin/:section?
/workspace/farm-manager/:section?
/workspace/member/:section?
```

The workspace guard waits for session restoration, normalizes the four roles exactly, and performs at most one replacement navigation when a user opens the wrong role URL.

## Authentication flow

```text
credentials → POST /auth/login
            → phone verification required? request + verify OTP
            → password change required? POST /auth/change-password
            → Firebase custom-token sign-in
            → sanitized session cache
            → canonical React workspace
```

OTP values are never returned by the client flow. The same server-side expiration, resend cooldown, attempt limit, digest, and single-use behavior remains in effect.

## Feature ownership

- Super Admin: overview, users, block farms, fields, reports, prices, governance history, system monitoring, support resolution, account settings.
- SRA Admin: block farms, fields, canonical price publication, audit report certification, QR verification, Farm Manager accounts, support, settings.
- Farm Manager: assigned farm, member fields/accounts, password-authorized Take Over operation entry with optional itemized costs, operation amendments/history, custom field-plan configuration, atomic crop-cycle rollover, report compilation, diagnostics, support, settings.
- Member Farmer: authenticated mobile-only web notice; operational workflows remain in the mobile application.
- Public: landing, privacy, terms, cookie/local-storage policy, accessible consent acknowledgement.

## Validation commands

```text
npm --prefix web/react-app run build
npm --prefix web/react-app test
npm --prefix server test
```

There is no Playwright/E2E test suite in the repository. Direct-route smoke checks should verify `/`, `/login`, `/privacy`, `/terms`, `/cookies`, and each workspace URL returns the Vite application; unauthenticated workspaces then route to `/login` in the client.

Final Phase 9 verification returned HTTP 200 with the same Vite root for the five public/auth routes and direct Super Admin, SRA Admin, Farm Manager, and Member workspace URLs. An unauthenticated `/api/logs` request returned HTTP 401 and was not swallowed by the SPA fallback.
