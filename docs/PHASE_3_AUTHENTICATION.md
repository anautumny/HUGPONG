# Phase 3 — Server-Authoritative Authentication

Status: **Implemented and locally verified**  
Date: 2026-09-16

## Authority boundary

- Express is the only password authentication authority.
- Public `users/{userId}` documents contain profile/account state only.
- Password hashes exist only in `user_credentials/{userId}` and use versioned, randomly salted scrypt.
- Firestore client SDK access to `user_credentials` is always denied.
- Web and mobile send credentials only to Express. Web keeps authentication in an HttpOnly server session cookie and never persists a bearer token; Mobile stores its opaque bearer and session in platform-encrypted secure storage.
- Firebase custom claims contain canonical role and assignment IDs. `accountReady` remains false until registered-phone verification and any required first-login password change are complete.
- Every protected API request reloads the active account, compares its `authVersion`, validates the signed client platform and completed setup state, and applies an explicit method/path role policy. Password, phone, role, and status changes revoke previous HUGPONG sessions and Firebase refresh tokens.
- Before authentication or route logic, every request passes a shared input boundary that accepts JSON request objects only, rejects bodies on read methods, validates URL/query/header shape, limits nesting and collection sizes, rejects non-finite numbers and unsafe prototype keys, and returns a generic `400` without persisting input. Route/domain validators then rebuild canonical database records from approved fields.
- Clients sign in to Firebase Auth for identity continuity only. Application records are read and mutated through the scoped Express API; clients do not attach Firestore data listeners.
- A previously authenticated user, including SRA Admin, may restore and retain a cached local session while internet or the HUGPONG API is unavailable. SRA may read only the last account-scoped district analytics snapshot and certified audit history, both labeled with their synchronization time. Pending review state is excluded, and offline status never grants mutation authority: official SRA actions remain server-confirmed. The clients automatically retry live data refresh after reconnection. An explicit `401`/`403` authentication rejection clears the session and the local SRA snapshot.

## Account flows

1. Login resolves an eight-digit user ID directly or an indexed normalized phone query; it never downloads the user collection for password comparison.
2. Registration and first-login phone OTP values are generated, stored, expired, attempt-limited, and verified by Express. Codes are never returned to clients. Administrators record a new account's phone number but cannot verify ownership on the account owner's behalf.
3. Self-registration can create only a pending Farm Member account and requires server-verified phone possession.
   Registration stores first, optional middle, last, and optional suffix separately; the server derives the display name. Selecting a Block Farm is optional at registration. An unassigned request stays pending until an SRA Admin selects an active Block Farm during approval.
4. Password confirmation, password change, and phone change use authenticated Express endpoints.
5. Every administrator-provisioned account must verify its registered phone on first login and then replace the temporary password. The server ignores client attempts to pre-verify the phone or bypass the password change.
6. Forgot-password recovery uses a three-step server flow shared by Web and Mobile: a generic SMS-code request to the registered number, code verification that issues a short-lived reset-only grant, and an atomic password reset. Recovery codes and grants are HMAC-protected, persisted in a client-denied Firestore collection, attempt-limited, expiring, single-use, and bound to the account's issuance-time `authVersion`. A successful reset verifies possession of the registered number, increments `authVersion`, revokes Firebase refresh tokens and all HUGPONG sessions, and requires a normal login with the new password. If a SIM is lost, an authorized scoped administrator can first update the registered number after in-person identity verification; the owner then completes this same SMS recovery flow.
7. Login, registration, OTP, password recovery, password-verification,
   account-creation, and administrative SMS paths use shared Firestore-backed
   throttles. Login uses independent 15-minute limits for IP, normalized
   account identifier, and IP/account pair; the pair limit remains five
   attempts. Web and Mobile persist and restore a server-issued login lock
   after refresh or restart without displaying its remaining duration. Every
   verification-code send flow enforces a 60-second resend cooldown and a
   maximum of three accepted code requests per canonical phone/account. Web
   and Mobile render the server-provided OTP countdown and remaining-send
   count; the third accepted send starts a full one-hour lock. General
   client-created audit events and arbitrary SMS bodies are rejected. A
   bounded early gateway limiter additionally protects all Web and Mobile API
   traffic before parsing and database access; see `ABUSE_PROTECTION.md`.

## Firebase authorization

`firestore.rules` denies every Web and Mobile client read/write across all current collections and default-denies every future unmatched path. Firebase Admin on the server bypasses these rules, so all database access must first pass the API's live-account, account-readiness, platform, role, and resource-scope checks.

Rules are configured by `firebase.json` but are not deployed automatically by this repository change.

## Required runtime configuration

- `SESSION_SECRET`: random value of at least 32 characters.
- Firebase Admin credentials capable of signing custom tokens, preferably application default credentials/workload identity. Local development may use the gitignored `server/serviceAccountKey.json` or `GOOGLE_APPLICATION_CREDENTIALS`.
- Rotated `SEMAPHORE_API_KEY` and `SEMAPHORE_SENDER_NAME`.
- `SMS_PROVIDER=semaphore` in production. Local OTP testing may explicitly use `SMS_PROVIDER=console`; console delivery is rejected in production and never falls back from Semaphore. See `DEVELOPMENT_AUTH_RBAC_TESTING.md` for the gated development setup.
- `CORS_ORIGINS` for allowed browser origins.
- Mobile `EXPO_PUBLIC_API_BASE_URL` pointing at the Express server.

## Verification

- `npm test` in `server`: scrypt, safe projections, all four canonical roles and Firebase claims, account readiness, missing/forged bearer rejection, cross-role denial, server OTP lifecycle, and Firestore credential/default-deny assertions.
- Server JavaScript syntax check.
- Web shared/role JavaScript syntax check.
- Expo Android production export.

## Deployment follow-up

- Deploy `firestore.rules` with the Firebase CLI and run the rules suite against the Firestore emulator or a disposable project.
- Registration and first-login OTP challenges remain process-local. Password-recovery challenges are already Firestore-backed; enable a Firestore TTL policy on `password_recovery_challenges.deleteAfter`.
- Live custom-token creation, Semaphore delivery, and end-to-end role reads require configured Firebase/Semaphore services and were not exercised by offline local validation.
