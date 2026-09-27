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
- Every protected API request reloads the active account and compares its `authVersion`. Password, phone, role, and status changes revoke previous HUGPONG sessions and Firebase refresh tokens.
- Clients sign in to Firebase Auth with the custom token before attaching Firestore realtime listeners.
- A previously authenticated user, including SRA Admin, may restore and retain a cached local session while internet or the HUGPONG API is unavailable. SRA may read only the last account-scoped district analytics snapshot and certified audit history, both labeled with their synchronization time. Pending review state is excluded, and offline status never grants mutation authority: official SRA actions remain server-confirmed. The clients automatically retry live data refresh after reconnection. An explicit `401`/`403` authentication rejection clears the session and the local SRA snapshot.

## Account flows

1. Login resolves an eight-digit user ID directly or an indexed normalized phone query; it never downloads the user collection for password comparison.
2. Registration and first-login phone OTP values are generated, stored, expired, attempt-limited, and verified by Express. Codes are never returned to clients. Administrators record a new account's phone number but cannot verify ownership on the account owner's behalf.
3. Self-registration can create only a pending Farm Member account and requires server-verified phone possession.
   Registration stores first, optional middle, last, and optional suffix separately; the server derives the display name. Selecting a Block Farm is optional at registration. An unassigned request stays pending until an SRA Admin selects an active Block Farm during approval.
4. Password confirmation, password change, and phone change use authenticated Express endpoints.
5. Every administrator-provisioned account must verify its registered phone on first login and then replace the temporary password. The server ignores client attempts to pre-verify the phone or bypass the password change.
6. The nonfunctional client-side forgot-password simulation was disabled. Password recovery still requires an authorized administrator; no unauthenticated password-reset mutation exists.
7. Login, registration, OTP, password-verification, account-creation, and administrative SMS paths use shared Firestore-backed throttles. General client-created audit events and arbitrary SMS bodies are rejected.

## Firebase authorization

`firestore.rules` requires Firebase authentication plus `accountReady == true`, denies every client read/write to `user_credentials`, denies credential-bearing public user documents, applies canonical-role checks to known collections, disallows submitted-operation deletion, and default-denies unmatched paths.

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
- The OTP challenge store is process-local. Move it to a TTL-capable shared store before running multiple Express instances.
- Live custom-token creation, Semaphore delivery, and end-to-end role reads require configured Firebase/Semaphore services and were not exercised by offline local validation.
