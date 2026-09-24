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

For Expo Go on a physical phone, keep the phone and computer on the same network and configure `mobile/.env` with the computer's LAN API address, for example:

```text
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:3000
```

Use `http://10.0.2.2:3000` only for an Android emulator. Restart Expo after changing the environment file.

Development reset and test-account creation are explicit, separately gated server scripts. Runtime login screens do not contain mock-session or role-bypass controls.
