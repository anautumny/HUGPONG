# HUGPONG Agricultural Management Platform

HUGPONG is an offline-first sugarcane field-operations and regulatory oversight system for Block Farms in Silay City.

## Canonical architecture

- `server/`: Node.js and Express security gateway, authoritative mutation API, role/scope enforcement, and Firestore transactions.
- `web/react-app/`: React, Vite, and Tailwind CSS management console for Farm Managers, SRA Admins, and Super Admins.
- `mobile/`: Expo and React Native Android application for Farm Members, Farm Managers, and SRA Admins.
- `firestore.rules`: least-privilege client read rules; canonical client writes are denied.
- Firestore: canonical cloud persistence.
- AsyncStorage and `@hugpong_outbox`: canonical mobile offline persistence and durable mutation queue.

The crop-cycle contract contains exactly six stages: Land Preparation, Planting, Basal, Weeding, Top-Dress, and Harvest. Submitted field operations use the `ACTIVE` / `ARCHIVED` lifecycle.

## Local development

1. Run `run-server.bat` for the backend API.
2. Run `run-web.bat` to build and serve the React production console at `http://localhost:3000`.
3. Run `run-mobile.bat` to start Expo.

The mobile app requires an explicit `EXPO_PUBLIC_API_BASE_URL` and the `EXPO_PUBLIC_FIREBASE_*` values listed in `mobile/.env.example`. Web requires the matching `VITE_FIREBASE_*` values in `web/react-app/.env.example`, while the server receives its project identity through credentials or `FIREBASE_PROJECT_ID`. Production values belong in the deployment environment. The mobile app never guesses, probes, or caches alternate API hosts. See [`docs/MOBILE_API_CONNECTIVITY_AND_DEPLOYMENT.md`](docs/MOBILE_API_CONNECTIVITY_AND_DEPLOYMENT.md).

Development reset and test-account creation are explicit, separately gated server scripts. Runtime login screens do not contain mock-session or role-bypass controls.

Before release, run `npm run verify:release` from the repository root. It checks deployment configuration parity, runtime authority, server and Web tests, the Web production build, and the Android Expo export. The same gate runs in continuous verification. The separate live database audit remains `npm --prefix server run audit:legacy-data`. See [`docs/PHASE_5_RELEASE_READINESS.md`](docs/PHASE_5_RELEASE_READINESS.md) and [`docs/PHASE_6_DEPLOYMENT_AUTOMATION.md`](docs/PHASE_6_DEPLOYMENT_AUTOMATION.md).
