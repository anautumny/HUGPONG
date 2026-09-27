# Phase 6 — Deployment Configuration and Continuous Verification

Phase 6 makes the Phase 5 release gate reproducible outside one developer workstation. It validates cross-platform deployment identity without printing configuration values and runs the same verification automatically for pushes, pull requests, and manual workflow runs.

## Database / schema

- No Firestore schema or production record is changed.
- The server, Web client, and Mobile client must name the same Firebase project before a release build can pass.
- Live database integrity remains a separate read-only operator command: `npm --prefix server run audit:legacy-data`.
- Legacy migration execution is never part of CI and retains the Phase 4 explicit execution gates.

## Server / API

- `audit:deployment-config` loads ignored local `.env` files for development while giving deployment-provided environment variables precedence.
- The audit requires the server Firebase project, six Web Firebase variables, the Mobile API origin, and six Mobile Firebase variables.
- Production rejects missing values, project mismatches, placeholder configuration, non-HTTPS API origins, and loopback API hosts.
- Reports contain only counts, booleans, violation codes, and variable names. They never print API keys, project IDs, app IDs, or origins.

## Web

- CI supplies the `VITE_FIREBASE_*` build contract.
- The Web production bundle is generated only after deployment identity and runtime-authority checks pass.

## Mobile

- CI supplies the `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_FIREBASE_*` build contracts.
- Android export uses the same server/Web/Mobile project-alignment check as local release verification.

## Continuous verification

`.github/workflows/verify.yml` uses Windows and Node.js 22, installs locked dependencies for Server, Web, and Mobile, then runs:

```powershell
npm run verify:release
```

For a real deployment, configure the actual environment values in the deployment provider and run the same command there. After code verification passes, an authorized operator must run the Phase 4 read-only live database audit and confirm `deploymentReady: true` before rollout.
