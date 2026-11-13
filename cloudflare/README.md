# HUGPONG on Cloudflare Free

This is a **migration candidate, not a completed production release**. It serves the existing React application and routes the existing Express API through one SQLite-backed Durable Object. Firebase remains the authoritative database and identity provider. No Containers, Workers Paid subscription, replacement business database, client-authoritative writes or periodic synchronization poll is introduced.

## Current status

The preflight Worker is deployed at **https://hugpong.mattue4444.workers.dev**, using **hugpong-production at the user's explicit request**. `GATEWAY_MODE=preflight` blocks submissions, login writes, notification sending and cleanup. `/health/live` runs the actual imported API; readiness deliberately reports preflight until activation. Cloudflare accepted the backend with startup below one second. DNS and Render remain unchanged at this preparation stage.

The existing Firebase, session and SMS values are stored as server-only Worker secrets. The user copied Render's existing session secret into the local server environment and the Worker secret was updated from that file. Both previously missing Firestore indexes are now READY. The release target is **1.1.0**, without Beta branding. Native build/publication, domain cutover and installed-device acceptance are tracked in [the release report](../docs/RELEASE_1.1.0_2026-11-13.md).

From the repository root, verify the CLI, or reconnect later if needed:

```powershell
node cloudflare/node_modules/wrangler/bin/wrangler.js login
node cloudflare/node_modules/wrangler/bin/wrangler.js whoami
```

Click **Allow** in Cloudflare's browser authorization flow. Keep Workers on **Free**. Do not paste credentials into chat or commit them.

## Configuration and build

Use repository Node 24.22.1 for build tools. The Worker itself uses Cloudflare's Node compatibility APIs; the standalone Node server still enforces the original Node version policy.

```powershell
npm.cmd ci --prefix server
npm.cmd ci --prefix web/react-app
npm.cmd ci --prefix cloudflare
npm.cmd --prefix cloudflare run build
npm.cmd --prefix cloudflare run check
```

The last command is a **dry run**, with no upload or domain changes. Web Firebase environment values must match the target Firebase project. Existing public Web environment variables are described in `web/react-app/.env.example`.

Worker variables in `wrangler.jsonc` specify production mode, `https://hugpong.org` CORS and the existing IPROG SMS provider. Before a deployment, configure these **server-only Worker secrets** in the intended environment:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete existing server Firebase service-account JSON, stored as a Worker secret. It must never be placed in public Web/Mobile variables, assets or bundles. Android `google-services.json` is a different public client configuration file.
- `SESSION_SECRET`: preserve the existing production signing secret through migration.
- `IPROG_SMS_API_TOKEN`: preserve the existing server-only provider credential.
- `EXPO_PUSH_ACCESS_TOKEN`: only if enhanced Expo push security is enabled for the existing project.
- `FIREBASE_PROJECT_ID`: recommended explicit matching project ID. Runtime refuses a mismatch with the credential project.

Use Cloudflare **Workers & Pages → HUGPONG Worker → Settings → Variables and Secrets** for secret values, or Wrangler's interactive `secret put` command. Local `.dev.vars` and `.wrangler` files are ignored. This configuration intentionally has no automatic production custom-domain route: connecting the live domain is a separate cutover after staging validation.

## Validation and activation

The user declined a separate Firebase staging project and explicitly selected `hugpong-production`. Hosted preflight checks therefore avoid business-data mutations and test-record insertion. Unit/integration tests use isolated test boundaries. This does not establish the live role/device mutation matrix; real authorized account acceptance remains part of rollout.

Before connecting `hugpong.org`, verify in that environment:

1. Cloudflare upload/startup validation, HTTPS, secure Web sessions, Mobile bearer sessions, credential/acknowledgement order, account revocation, RBAC and origin protection.
2. Real account create/update/assign/submit/archive/delete broadcasts in both directions between Web and Android; all permitted Member, Farm Manager, SRA Admin and Super Admin platform combinations. Preserve the existing Super Admin Mobile restriction.
3. Offline queues, account switching, takeover conflicts and reconnect recovery on physical installed APKs.
4. Price and phone-verification push delivery, a suspended/closed Android app, Expo receipts, network reconnection and durable alarm recovery after eviction/deployment. The separate EAS FCM v1 credential still needs verification.
5. Audit PDF/QR, analytics, APK streaming, backup/export/restore and representative data-volume tests. Workers Free permits 50 external subrequests per invocation and 128 MiB memory; large pre-existing bulk/report/backup workflows are not yet proven within these limits.

The local startup profiler could not reproduce the namespace binding, but actual Cloudflare deployment subsequently passed remote startup validation (381 ms initially, 316 ms for the later backend build). Hosted page/liveness/readiness-gate and legacy redirect checks passed. These results are recorded in `output/cloudflare-hosted-preflight.json` and `output/cloudflare-preflight-deployment.txt`.

## Cutover after the gate passes

1. Deploy the verified production Worker and Web assets with the matching Firebase project and server-only secrets. Keep `GATEWAY_MODE=preflight` while preparing the handover. Set **Workers Free**, not Containers or a paid upgrade.
2. In that Worker's **Settings → Domains & Routes → Add → Custom Domain**, add `hugpong.org`. Cloudflare manages the matching DNS and TLS. Add `www.hugpong.org` only if wanted; the Worker redirects it to the canonical root. Avoid conflicting manually created DNS records and do not use Render DNS targets for this migration.
3. Confirm `https://hugpong.org/health/ready`, Web sign-in and installed APK sign-in before opening normal production traffic. Do not cache `/auth`, `/api`, `/health` or authenticated SSE responses through a Cache Everything rule.
4. Coordinate the cutover to a **single API writer**. The Worker uses direct fanout from its canonical named object; it does not observe mutations from a simultaneously active old Render backend. Stop old backend mutation traffic before setting `GATEWAY_MODE=active` and deploying that activation. Do not shard the object name by user/device or deploy a second production writer to the same Firebase project.
5. Build and distribute a newly signed APK using the existing Android package/signing identity. Preview/production already target `https://hugpong.org` and the splash Beta footer has been removed locally. Existing installed APKs retain their compiled old origin until upgraded. Preserve their local offline queues through the update, and verify reconnection against the new host.
6. After Web/Android production smoke tests, retire Render. Keep the prior deployment configuration available for rollback, with only one writer enabled at any time. No business records need to be moved, reset or deleted.

The website's first visit at a new origin may require sign-in because browser cookies/storage are origin-bound. That domain transition is separate from subsequent automatic data updates.

## Free plan constraints

SQLite-backed Durable Objects are available on Workers Free. The current free quotas include 100,000 Worker requests/day, 100,000 Durable Object requests/day and 13,000 GB-s/day of object duration; alarms also count as requests. This configuration invokes the Worker for static requests too, to preserve redirects and security headers. Exceeding free quotas causes service errors rather than enabling a paid plan automatically. Existing Firebase/Expo/SMS service configurations and their quotas are separate.

Official references: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Durable Object pricing and free quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Full implementation and test evidence: [migration report](../docs/CLOUDFLARE_FREE_MIGRATION_2026-11-13.md).
