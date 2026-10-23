# Release preparation: HUGPONG 1.0.5

The new Mobile candidate is **1.0.5** in `mobile/app.json`. EAS continues to increment the Android build version remotely. No website/APK deployment was performed during preparation. Deployment was subsequently authorized; see the [October 24 deployment record](DEPLOYMENT_1.0.5_2026-10-24.md) for the published Web/API release, database rules, signed APK checks, and remaining physical-device acceptance.

## Database / schema

**Resolved:** after the user created the two operation-log indexes manually, the read-only readiness check passed with all **30 required indexes READY**, zero missing indexes, and zero pending builds. The database-index blocker is cleared. The tested preparation command creates missing definitions only, preserves existing indexes, handles existing builds, and requires Server/Web/Mobile configuration to match the actual credential project.

```powershell
npm run prepare:database
npm run prepare:database -- --apply
npm run verify:database-indexes
```

The first command is read-only. The last returns a nonzero exit code until every configured index is `READY`.

**Earlier apply attempt:** Firestore returned `403 PERMISSION_DENIED` on the agent's first create request. The agent created no index and changed no business record. The user subsequently created these definitions through Firebase Console, and the API readiness check confirmed them:

| Collection | Scope | Fields |
| --- | --- | --- |
| `operation_logs` | Collection | `fieldId ASC`, `status ASC`, `__name__ ASC` |
| `operation_logs` | Collection | `blockFarmId ASC`, `performedOn ASC` (implicit `__name__ ASC`) |

No credential rotation, IAM change, record repair, or index deletion was needed. No further index creation is required for the current manifest.

## Server / API

Operation cursor reads, audit next-period discovery, and monthly source selection now fall back to document-ID scans when Firestore specifically reports a missing index. Every fallback retains the existing authorization filters and reads at most 200 documents per query. Status/month filtering happens inside the API. Operation paging scans far enough to find the requested number of matching records; excluded statuses do not truncate history or terminate pagination early. Other permission errors continue to fail normally.

The fallback preserves functionality while indexing is unavailable; it may examine more scoped history. The preferred release setup still prepares indexes and confirms readiness.

Server configuration and release verification now refuse Node versions outside `>=24.22.1 <25`, including older patches and prereleases. A hosting `NODE_VERSION` override can no longer silently start the API on an unsupported runtime. Confirm the provider's build/runtime settings when deployment is authorized.

## Web

Web consumes the improved central API without changing the operation/page or report contracts. Keep `web/react-app/src/config/androidRelease.json` pointing to the real 1.0.4 artifact until a new APK has been published. Then update its version and URL together and verify `/downloads/android/<version>` before advertising the replacement.

## Mobile

The new candidate version is 1.0.5. The same API fallbacks apply to Mobile, with unchanged cursor/acknowledgement contracts. Postinstall dependency mitigation remains required. The production export is checked by the release gate; no installable signed APK or device acceptance is implied by that export.

ADB inventory returned no connected devices. Fresh-install notification permission, native QR acquisition, process termination during submission, and visual modal acceptance therefore remain device checks before distribution.

## Complete source and release verification

The source candidate package includes Git-visible tracked and untracked project files, excludes generated `output/` content and ignored local files, and passes the credential/secret exposure audit before copying. Its manifest records every file's SHA-256 so new implementation modules can be checked against the exact prepared source. Secrets, local `.env` files, dependency folders, and service-account credentials are not bundled. A source bundle is not a pushed Git revision or a deployed app.

Run `npm run verify:release` for configuration parity, secret/authority/binding audits, Mobile mitigation verification, all Server/Web tests, Web production build, and Android export. The final preparation log is `.tmp/release-preparation-2026-10-24/release-final.log`.

After Firebase permissions/indexes and device acceptance are resolved, include the full local implementation in the intended release revision, deploy the verified Server/Web build, build and test the signed 1.0.5 APK, publish it, and update the download manifest. Do not interpret the successful local build as a completed production rollout.
