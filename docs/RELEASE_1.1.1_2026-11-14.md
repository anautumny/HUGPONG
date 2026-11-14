# HUGPONG 1.1.1 release

The user lifted the deployment/build/publication hold on 14 November 2026 and requested the latest Web, API and Android version before final presentation testing. **Web/API deployment and stable Android APK publication are complete.** The live site, API protection and public attachment download were checked. Signed-in physical-device/presentation acceptance remains the user's next testing stage.

## Included changes

- Restore Mobile identity, assignments and saved data correctly after app restarts; show account-restoration, initial-data loading and retry feedback.
- Isolate unrelated failed reads in both clients, retain coherent field snapshots and recover automatically without manual data refresh.
- Preserve account-owned drafts/outboxes/uncertain intents when clearing downloaded cache.
- Fence delayed credential responses to their originating authentication context and serialize credential transitions.
- Reuse durable Web/Mobile price-publication intent and atomic server receipts to prevent lost-response retries creating duplicate prices/audits/notifications.
- Honor Retry-After, retain invalidations received during cooldown, canonicalize invalidation paths and batch notification reviewer lookups.
- Bind the Web QR preview to the selected report and ignore obsolete completions/errors.

## Database / server / Web / Mobile

Firebase remains `hugpong-production`, with the existing canonical API and domain `https://hugpong.org`. No business-record migration, deletion, index changes, secret changes or paid-service activation is required. Price receipts use the existing mutation-receipt collection.

Web and API reuse the existing Cloudflare Worker and single named Durable Object. Render remains suspended. Android retains `com.hugpong.app` and the existing EAS signing credentials; release credentials are frozen during the build. The APK must be installed over the existing app, preserving its data.

## Verification before rollout

The full local release gate passed **812 server tests and 66 Web tests**, source/configuration/credential checks, Web compilation and Android JavaScript/Hermes export. It passed again after aligning final 1.1.1 package metadata and the APK download manifest. The Cloudflare Worker dry run also passed. Evidence: `output/audit-fixes-release-gate-2026-11-14.txt`, `output/release-1.1.1-final-verification.txt` and `output/release-1.1.1-worker-dry-run.txt`.

## Android artifact

- Version **1.1.1**, Android code **13**, package **com.hugpong.app**.
- EAS build: [d397d80e-891a-4ffd-89bc-7ba552ed1fa8](https://expo.dev/accounts/anautumny/projects/hugpong/builds/d397d80e-891a-4ffd-89bc-7ba552ed1fa8).
- APK source commit: `9e4950320dd96b331b11ddc20c7ee1d8f3784fca`, on `main`. Functional fixes are in parent commit `dbabedcd237995f0a4cd780b7fb2d0819bb265af`; the subsequent source change excludes Git metadata from Android archives.
- Upload archive: 136 files / 2,950,400 uncompressed bytes, matching the new Mobile source, with zero excluded-file violations. Public Android Firebase configuration is present; server credentials and repository history are absent.
- APK size: **112,694,343 bytes**. SHA-256: `c6bcb571afe1f3f3ccf4d498644f3d0642b241ee2ec8f06327ef806680cefb17`.
- Passive manifest/bundle inspection confirms the correct version/package/domain, with no old Render API embedded. The certificate fingerprint matches the existing EAS signing identity. Independent cryptographic APK signature verification was not performed; no previously declined native verification tools were installed or run.
- Expo remains on the **Free** plan and build credentials were frozen. Existing published APK assets are retained.

## Initial production activation

Worker version `5d461796-c169-4421-a825-06a7fddbbecf`, deployment `2e1f9b0e-189c-46ba-b30d-6b9beb94cffe`, first activated the verified Web/API fixes. Homepage, Prices and Fields returned 200 and the same `/assets/index-BrqiJWME.js` entry, which matched the local build byte-for-byte. API readiness returned 200 in active mode.

## Final rollout and live verification

- Final Worker version: **`8b017b2c-82da-4c0d-a574-a79f0ed8cfb7`**; deployment **`aa955b54-87ee-4761-acf9-2c458701b2ab`**, active at 100%.
- Website/API: [hugpong.org](https://hugpong.org). Homepage, Prices and Fields returned 200 with `/assets/index-D9R2QjSz.js`, matching the final local Web build byte-for-byte.
- Liveness/readiness returned 200 in active mode. Unauthenticated session/fields/prices requests returned 401. `www.hugpong.org` redirected to the canonical domain with 308.
- Stable public [v1.1.1 release](https://github.com/anautumny/HUGPONG/releases/tag/v1.1.1), with the APK and checksum. GitHub's APK digest and size match the inspected local artifact.
- [Same-origin APK download](https://hugpong.org/downloads/android/1.1.1): HEAD 200, attachment filename `HUGPONG-1.1.1.apk`, expected 112,694,343-byte size; a four-byte request returned 206 with the APK ZIP header. The landing page's button selects this version.
- Release source/tag: **`a6a82bbb0a94c92a966b1b2ba5a88a09302755e8`**, on `main`. It adds final version/download metadata to the APK's verified functional source. [GitHub verification run 43596964197](https://github.com/anautumny/HUGPONG/actions/runs/43596964197) completed successfully for this release; APK-source and functional-fix commits also passed verification.
- No business-record migration/deletion, secret rotation, paid-plan activation or Render restart was performed. Existing bindings, signing identity and canonical API authority remain in use.
- Evidence: `output/release-1.1.1-live-verification.json`, `output/release-1.1.1-cloudflare-current.json`, `output/release-1.1.1-publication.json`, `output/release-1.1.1-publication-check.json`, `output/release-1.1.1-apk-code-checks.json` and the final local verification log.

Before final testing, reload an already-open browser once to load the new application code and install 1.1.1 over the existing Android app. Keep app data; do not uninstall or clear storage. This one-time software update is separate from the automatic data refresh behavior being tested. Physical push, account-switch/offline conflicts, multi-role/device updates and presentation workflows remain unverified until exercised on the actual devices.

Root causes, modified application files, behavioral regressions and remaining audit risks are documented in [AUDIT_RECOVERY_FIXES_2026-11-14.md](AUDIT_RECOVERY_FIXES_2026-11-14.md). Physical phone testing, native push delivery, signed-in multi-role/device mutation/reconnect workflows and representative hosting load remain acceptance work; successful deployment does not establish those results.
