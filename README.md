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

The mobile app has one required, non-secret API setting: `EXPO_PUBLIC_API_BASE_URL`. Supply an explicit development origin in an uncommitted `mobile/.env`; production builds must receive the public HTTPS API origin from the build service environment. The app never guesses, probes, or caches alternate hosts. See [`docs/MOBILE_API_CONNECTIVITY_AND_DEPLOYMENT.md`](docs/MOBILE_API_CONNECTIVITY_AND_DEPLOYMENT.md).

Development reset and test-account creation are explicit, separately gated server scripts. Runtime login screens do not contain mock-session or role-bypass controls.
