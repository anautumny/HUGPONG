# Mobile API Connectivity and Production Deployment

## Authority and request flow

HUGPONG keeps validation, authentication, role enforcement, SMS actions, QR/audit verification, synchronization, and all canonical mutations in the Express gateway and Firestore. The Web console uses same-origin `/auth/*` and `/api/*` requests. Every Mobile server request passes through `mobile/src/services/authService.js`, which reads the single origin exported by `mobile/src/config/apiConfig.js`.

The installed Mobile app does not discover a Metro host and does not probe emulator, loopback, or LAN fallbacks. Changing Wi-Fi therefore does not change the selected API. A failed origin is never cached: every health check and request reads the same build-time origin, and the connectivity monitor retries the gateway after network transitions and while internet access is present.

## Environment separation

`EXPO_PUBLIC_API_BASE_URL` is required and contains only an origin, with no path, credentials, query, or fragment.

- Development: copy `mobile/.env.development.example` to the uncommitted `mobile/.env`, then replace its placeholder with the one intentionally reachable development origin. HTTP is accepted only in development builds.
- Production: use `mobile/.env.production.example` as the build-service contract and configure `EXPO_PUBLIC_API_BASE_URL=https://api.your-hugpong-domain.example` in the Expo/EAS production environment before building. Production rejects HTTP.
- The value is public application configuration, not a secret. Firebase Admin credentials, session secrets, SMS provider keys, and all privileged material stay on the server.

After changing the environment, restart Metro for development or create a new installed build for production. Do not add host arrays or runtime fallback probing.

## Express deployment contract

Deploy the repository to a managed Node.js host or container behind a public TLS endpoint. Use these commands from the repository root:

```text
npm --prefix server ci
npm --prefix web/react-app ci
npm --prefix web/react-app run build
npm start
```

Use `server/.env.production.example` as the contract and set the following server environment values in the hosting provider:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=<provider-assigned port>
CORS_ORIGINS=https://app.your-hugpong-domain.example
SESSION_SECRET=<random value of at least 32 characters>
SMS_PROVIDER=semaphore
SEMAPHORE_API_KEY=<secret>
SEMAPHORE_SENDER_NAME=<approved sender>
GOOGLE_APPLICATION_CREDENTIALS=<provider-managed credential path, when workload identity is unavailable>
```

The server binds to the injected `PORT` on `0.0.0.0`, trusts one TLS proxy in production, uses secure HTTP-only cookies, and rejects browser origins not explicitly listed in `CORS_ORIGINS`. Native Mobile requests do not send a browser Origin header and authenticate with bearer tokens. `/health` is deliberately public and returns only a minimal status document with `Cache-Control: no-store`.

Use workload identity or the hosting provider's secret store for Firebase Admin credentials. Never put a Firebase service-account private key, `SESSION_SECRET`, bootstrap password, or Semaphore key in Web/Mobile environment variables or source control.

## Runtime behavior

The Mobile monitor combines operating-system internet reachability with the configured gateway health check:

- `NO_INTERNET`: Wi-Fi/mobile-data reachability is absent. Login explains that an internet connection is required.
- `SERVER_UNAVAILABLE`: general internet is present but the configured HUGPONG API is not responding. Login presents a server-specific retry message.
- `ONLINE`: `/health` succeeded. Only then may automatic outbox replay begin.

Cached records, drafts, and the durable mutation outbox remain local during either unavailable state. A network change, foreground transition, manual retry, or scheduled gateway retry performs a fresh health check. Successful recovery triggers the existing idempotent synchronization path without requiring an app restart.

## Release verification checklist

Before publishing an installed build:

1. Deploy the Express gateway and confirm `https://<public-api>/health` returns HTTP 200 with `{ "success": true, "status": "healthy" }`.
2. Set the exact Web origin in server `CORS_ORIGINS` and verify Web login, authenticated reads, mutations, SMS, RBAC, QR/audit verification, and logout.
3. Set the public HTTPS origin in the Mobile production build environment and produce a new build.
4. Install the build on a physical device. Verify login on one Wi-Fi network, switch to another Wi-Fi network, then switch to cellular data. The same public origin must work without restarting the app.
5. Disable all internet access and confirm the UI reports `NO_INTERNET`, local field work/outbox persistence continues, and login does not count the connectivity failure as a bad-password attempt.
6. Restore internet while the API is intentionally stopped and confirm the UI reports `SERVER_UNAVAILABLE`, exposes no hostname/IP or stack trace, and offers retry behavior.
7. Restore the API and confirm health recovery plus automatic outbox replay without duplicate records.

The repository cannot supply the real production hostname, TLS certificate, provider secrets, or an installed-device network test. Those are release-operator steps and must be completed before claiming end-to-end production availability.
