# Phase 5 — Runtime Authority and Release Readiness

Phase 5 turns the earlier security and hardcoded-data review into a repeatable release gate. It does not inspect or modify live Firestore records; the Phase 4 legacy-data audit remains the separate database deployment gate.

## Database / schema

- No collection or document shape changes are required.
- Firebase project identity is deployment configuration, not a source-code fallback.
- Server startup uses the project supplied by credentials or `FIREBASE_PROJECT_ID`.
- A release is not database-ready until the Phase 4 live audit separately reports `deploymentReady: true`.

## Server / API

- `npm run audit:secrets` scans version-controlled and non-ignored files for credential files, private-key material, known secret-token formats, public-environment secrets, and SMS provider credentials/endpoints in Web or Mobile source.
- Secret findings contain only the rule, file, and line number; the matched value is never included in output.
- Production startup fails closed when `SMS_PROVIDER=semaphore` is selected without a server-side `SEMAPHORE_API_KEY`.
- `npm run audit:runtime-authority` scans active Web and Mobile source for direct Firestore mutations/imports, embedded Firebase configuration, deprecated native `SafeAreaView` imports, and known fabricated runtime records.
- The scan reports only rule, file, and line evidence. It does not print credentials or matched source values.
- Firebase Admin no longer silently falls back to a named project.

## Web

- Firebase Authentication configuration comes from the six `VITE_FIREBASE_*` deployment variables documented in `web/react-app/.env.example`.
- Missing configuration fails clearly at application startup.
- Application records continue to use the authenticated API; the release audit rejects direct Firestore mutations.

## Mobile

- Firebase Authentication configuration comes from the six `EXPO_PUBLIC_FIREBASE_*` build variables.
- The unused Firestore client initialization was removed. Mobile retains Firebase Authentication only; application records and mutations continue through the API and durable mutation outbox.
- The release audit rejects direct Firestore imports and deprecated React Native `SafeAreaView` usage.

## Release command

From the repository root, run:

```powershell
npm run verify:release
```

The command runs deployment parity, tracked-secret, and runtime-authority audits, the complete server test suite, Web tests, the Web production build, and an Android Expo production export. The Android export uses a temporary operating-system directory and removes it even when verification fails.

Environment-specific Firebase values must be provided before building. Web and Mobile project IDs must identify the same Firebase project as the server unless an intentionally isolated environment is being tested.
