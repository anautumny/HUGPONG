# HUGPONG Security Containment Report

Date: 2026-09-15  
Scope: containment only; no authentication redesign or unrelated refactor

## Result

The identified runtime authentication shortcuts, exposed SMS credential, OTP disclosure fallbacks, unauthenticated sensitive mutations, and permanent submitted-operation-log deletion paths have been removed or made fail-closed across the server, web client, and mobile client.

Submitted operation logs are now retained as historical records. Active-cycle archival remains available, and local unsaved drafts can still be discarded.

## Vulnerabilities fixed

1. **Runtime fallback accounts**
   - Removed the server-side canonical account registry used when Firestore returned no match.
   - Removed the web login fallback that authenticated directly against Firestore or local browser state when the server was unavailable or rejected credentials.
   - Web role workspaces now require a valid backend session and no longer accept an offline/local profile as authorization.

2. **Universal and master passwords**
   - Removed universal acceptance of known default, demo, admin, and manager passwords from server login, web takeover/amendment authorization, and mobile takeover/amendment authorization.
   - Authorization prompts now accept only the authenticated user's stored password hash.

3. **Insecure password verification shortcuts**
   - Removed plaintext-password comparison and direct hash-as-password acceptance.
   - Password verification now rejects missing or non-64-hex stored password hashes.
   - Removed automatic default password assignment from user synchronization and account/field helper flows.
   - New account creation requires an explicitly entered password of at least eight characters.

4. **Forgeable bearer-token authorization**
   - Replaced client-computable/static bearer signatures with full HMAC-SHA-256 signatures keyed by `SESSION_SECRET`.
   - Added constant-time signature verification and expiry enforcement before bearer tokens can hydrate a server session.
   - Removed legacy token acceptance and browser-side token generation.

5. **Embedded and fallback secrets**
   - Removed the hardcoded Express session secret and hardcoded Semaphore API credential.
   - The server now refuses to start without a random `SESSION_SECRET` of at least 32 characters.
   - Semaphore configuration is read only from `SEMAPHORE_API_KEY` and `SEMAPHORE_SENDER_NAME`.
   - Bootstrap/seed passwords are read from `HUGPONG_BOOTSTRAP_PASSWORD` and `HUGPONG_SEED_PASSWORD`; known passwords and plaintext compatibility fields were removed.
   - Browser-side seeding no longer creates credential-bearing user accounts.

6. **OTP disclosure and success fallbacks**
   - Removed API responses that returned OTP values when Semaphore delivery failed.
   - Removed mobile direct-to-Semaphore calls and the bundled provider credential.
   - Removed console, toast, alert, development-mode, and offline fallbacks that disclosed generated OTPs.
   - SMS delivery now reports failure and does not advance verification state unless the server/provider accepts the request.
   - Mobile registration now compares the submitted code with the issued code; entering any six digits no longer succeeds.

7. **Unauthenticated password changes**
   - `/auth/change-password` now requires an authenticated session, derives the account ID from that session, rejects client-supplied password hashes, and hashes plaintext on the server.
   - Normal password changes require the current password. The first-login exception is limited to a session already marked as requiring a password change.
   - Web first-login and settings flows persist through the server before updating client state; direct Firestore password writes were removed from those flows.
   - Removed mobile password reset by arbitrary identifier. Mobile first-login password setup now uses the authenticated user's current password.
   - Mobile self-service forgot-password mutation is fail-closed pending a properly designed recovery-token workflow.

8. **Unauthenticated phone verification**
   - `/auth/verify-phone` requires an authenticated session, derives the account and registered phone server-side, and accepts only a matching server-generated, unexpired OTP.
   - Web first-login verification persists through the server before updating client state; the direct Firestore verification write was removed.
   - Removed the mobile behavior that marked a phone verified merely because a local password login succeeded.
   - Changing a mobile number now marks the new number unverified and pending verification.

9. **Unauthenticated sensitive API mutations**
   - Added authentication to submitted operation-log creation, support-ticket creation, OTP dispatch, SMS alert dispatch, and SMS gateway status.
   - Operation-log creation derives `loggedById` from the authenticated session.
   - Support-ticket author and block-farm identity are derived from the authenticated session.
   - Existing price, user approval, field, block-farm, custom-operation, and custom-stage mutation guards remain in place.

10. **Permanent operation-log deletion and purge**
    - Removed `DELETE /api/logs/:id` and `POST /api/logs/purge-past`.
    - Removed web and mobile submitted-log delete/past-history purge implementations and controls.
    - Removed operation-log collection deletion from maintenance reset/bootstrap scripts.
    - Legacy deletion tombstones received during web/mobile synchronization are treated as archived historical records instead of being hidden.
    - Local draft discard functions and controls remain available because drafts are not submitted historical records.

## Required deployment actions

1. Revoke the previously exposed Semaphore API key in Semaphore and create a new key. Repository changes cannot revoke a provider credential.
2. Set a new random `SESSION_SECRET` of at least 32 characters in the deployment environment.
3. Set the rotated `SEMAPHORE_API_KEY` and approved `SEMAPHORE_SENDER_NAME` in the deployment environment.
4. Set bootstrap/seed passwords only for the one-time administrative scripts that need them, then remove those variables from the runtime environment.
5. Use `server/.env.example` as the variable inventory; do not place actual values in source control.

All existing sessions and old bearer tokens should be treated as invalid after `SESSION_SECRET` rotation.

## Containment consequences

- Accounts that contain only legacy plaintext passwords or invalid/missing password hashes can no longer authenticate. They require an authorized credential reset/provisioning action.
- Unauthenticated mobile registration and forgot-password SMS requests now fail closed. Restoring those workflows requires a later authentication redesign using server-generated, rate-limited, expiring verification challenges or recovery tokens.
- Historical operation-log documents that were already physically deleted before this pass cannot be reconstructed by code changes. Existing tombstone documents are retained as archived records.

## Verification performed

- Node syntax checks passed for changed server, web core, and administrative script files.
- Babel parsing passed for all changed mobile ES module/JSX files.
- `git diff --check` passed (line-ending notices only).
- Live unauthenticated request checks returned `401` for phone verification, password change, operation-log creation, ticket creation, and OTP dispatch.
- Removed operation-log delete and purge routes returned `404`.
- A forged legacy-style bearer token did not establish a server session.
- Static scans found no prior Semaphore credential, universal/master password constants, OTP disclosure fallback markers, submitted-log deletion functions, or operation-log delete/purge routes in runtime code.

## Explicitly deferred

This pass did not replace the existing password-hashing scheme, introduce a full identity provider, build server-side OTP challenge storage, or refactor the broader direct-Firestore/offline architecture. Those are authentication/architecture redesign tasks outside this containment scope.
