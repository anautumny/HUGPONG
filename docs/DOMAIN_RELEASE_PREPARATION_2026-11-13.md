# HUGPONG domain and splash preparation

Canonical website and API origin: **https://hugpong.org**. The user supplied `hugpong.org`; the existing architecture serves the Web app, `/auth`, `/api`, `/health` and `/downloads` from one origin, so a separate API subdomain is unnecessary.

**Updated hosting decision:** the user subsequently chose to leave Render and use free hosting only. The Cloudflare migration candidate and current setup steps are in [cloudflare/README.md](../cloudflare/README.md) and [the migration report](CLOUDFLARE_FREE_MIGRATION_2026-11-13.md). The older Render connection instructions below are historical and must not be used for this migration. No hosting cutover has occurred.

## Applied source/configuration changes

### Database / schema

No changes or migrations. Existing Firebase projects, records, identities, offline cache ownership and mutation queues are preserved.

### Server / API

- `server/.env.production.example`: production `CORS_ORIGINS=https://hugpong.org`.
- Local `server/.env`: added `https://hugpong.org` while keeping the existing local development origins. Other environment values were preserved and were not printed.
- Production host environment settings must still be configured on the chosen host; an ignored local `.env` does not change the hosted service. See the Cloudflare migration guide for Worker secrets.

### Web

- The existing relative `/auth`, `/api` and `/downloads` requests automatically use `https://hugpong.org` when the site is hosted there. There is no second hard-coded API origin to introduce.
- `web/react-app/.env.example` documents the canonical same-origin deployment.
- `.github/workflows/verify.yml` uses the new public API origin for release verification.
- Existing release asset URLs and historical deployment notes were preserved. An existing APK download cannot be renamed or represented as containing these changes before a new APK is built and published.

### Mobile

- `mobile/src/screens/auth/SplashScreen.js`: removed the visible **Beta** footer and its unused style; logo, tagline, animations and session restoration remain.
- `mobile/eas.json`: both preview and production profiles use `EXPO_PUBLIC_API_BASE_URL=https://hugpong.org` instead of the old Render hostname.
- Local `mobile/.env`: replaced the previous LAN API origin with the canonical HTTPS origin. Firebase and other environment values were preserved. The separate development example remains available for an intentionally local gateway.
- `mobile/.env.example` and `mobile/.env.production.example`: new canonical origin.
- `mobile/app.config.js`: CI's isolated JavaScript bundle export does not consume a real Android Firebase file. Native EAS profiles still validate and require the matching Android file, including when CI is set. A JavaScript export is not an APK or evidence of native push configuration/delivery.
- The existing branding assertion in `server/tests/runtime-stabilization.test.js` now expects no Beta splash footer. `server/tests/system-notification-clients.test.js` verifies that CI cannot bypass native EAS configuration checks.

## Verification

- Full server suite: **763 passed, 0 failed**, `output/domain-release-server-tests.tap`.
- Full Web suite: **60 passed, 0 failed**, `output/domain-release-web-tests.tap`.
- Web production build passed, `output/domain-release-web-build.txt`.
- Android production bundle export passed, `output/domain-release-android-export.txt`; output is `output/domain-release-android/`. This is not a signed installable APK.
- Bundle inspection confirmed `https://hugpong.org` is included, the old `https://hugpong-beta.onrender.com` API origin is absent, and the splash source no longer contains its Beta label: `output/domain-release-bundle-check.json`.
- Deployment configuration audit reports aligned Firebase projects, the valid public Mobile origin and no violations: `output/domain-release-config-audit.json`. That local configuration check is not a hosted readiness result.
- Runtime authority/client binding audits: zero findings, `output/domain-release-authority.json`, `output/domain-release-bindings.json`.
- Whitespace check passed.

## Domain connection and release work still pending

No DNS, hosting dashboard, live server, GitHub release or installed APK was changed. During this check, the local DNS resolver returned no usable A/AAAA/CNAME destination for the root domain, and HTTPS plus `/health/ready` could not be validated. See `output/domain-release-dns.json`. DNS propagation can change after this check.

For the existing Render service:

1. In the service's **Settings → Custom Domains**, add **hugpong.org**. Adding the root domain makes Render configure the corresponding `www` redirect to the root.
2. At the DNS provider, use the record values required by Render. For the existing repository-configured Render target, the available choices are:

   | Record | Name | Value | Use |
   | --- | --- | --- | --- |
   | ALIAS / ANAME | `@` | `hugpong-beta.onrender.com` | Root option when supported |
   | A | `@` | `216.24.57.1` | Alternative root option for providers without flattening/ALIAS; not Cloudflare |
   | CNAME | `www` | `hugpong-beta.onrender.com` | Optional `www` alias handled by Render's redirect |

   Choose one root method; confirm the current target in the Render dashboard. Cloudflare uses a flattened root CNAME instead of the A-record alternative. The Render hostname here is the DNS hosting target, not the new app's public API URL.
3. Verify the domain in Render and wait for DNS/TLS readiness. Render provisions the certificate after domain verification.
4. Set the hosted production environment to `CORS_ORIGINS=https://hugpong.org` and release the server/Web changes with the required Firestore indexes from the earlier notification work.
5. Build and install the updated APK. Its preview/production configuration now targets the new domain. Confirm `https://hugpong.org/health/ready`, Web sign-in, Android sign-in, the splash, live price updates, verification updates and device push on the deployed builds before declaring rollout complete.

Do not disable the old Render subdomain before older installed APKs have been replaced: those existing builds still target it. Browser sessions/storage belong to their origin, so the new website may require a first sign-in on `hugpong.org`; this is a domain transition rather than a change to the synchronization behavior. Server records are not moved or deleted.

The earlier login, unit, audit PDF, synchronization and notification changes remain in the local working tree and were included in the test/build runs above. They still need release/deployment to reach hosted users. The separate Expo FCM v1 sending credential and physical phone notification delivery remain unverified.

References: [Render custom domains and TLS](https://render.com/docs/custom-domains), [Render DNS records](https://render.com/docs/configure-other-dns).
