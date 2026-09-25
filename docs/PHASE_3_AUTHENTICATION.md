# Phase 3 — Server-Authoritative Authentication

Status: **Implemented and locally verified**  
Date: 2026-09-16

## Authority boundary

- Express is the only password authentication authority.
- Public `users/{userId}` documents contain profile/account state only.
- Password hashes exist only in `user_credentials/{userId}` and use versioned, randomly salted scrypt.
- Firestore client SDK access to `user_credentials` is always denied.
- Web and mobile send credentials only to Express and receive an opaque HUGPONG bearer plus a Firebase custom token.
- Firebase custom claims contain canonical role and assignment IDs. `accountReady` remains false until registered-phone verification and any required first-login password change are complete.
- Clients sign in to Firebase Auth with the custom token before attaching Firestore realtime listeners.
- A previously authenticated Farm Member or Farm Manager may restore its cached local session while offline. SRA Admin is online-only and is signed out when internet or the HUGPONG API is unavailable. On reconnection, `/auth/session` reloads eligible field-role users and refreshes both tokens.

## Account flows

1. Login resolves an eight-digit user ID directly or an indexed normalized phone query; it never downloads the user collection for password comparison.
2. Registration OTP, first-login phone OTP, and administrator personnel-phone OTP values are generated, stored, expired, attempt-limited, and verified by Express. Codes are never returned to clients.
3. Self-registration can create only a pending Farm Member account and requires server-verified phone possession.
4. Password confirmation, password change, and phone change use authenticated Express endpoints.
5. First-login password change remains mandatory when `requiresPasswordChange` is true.
6. The nonfunctional client-side forgot-password simulation was disabled. Password recovery still requires an authorized administrator; no unauthenticated password-reset mutation exists.

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
- Replace Express's default in-memory session store with a production shared store before multi-instance deployment.
- The OTP challenge store is process-local. Move it to a TTL-capable shared store before running multiple Express instances.
- Live custom-token creation, Semaphore delivery, and end-to-end role reads require configured Firebase/Semaphore services and were not exercised by offline local validation.
