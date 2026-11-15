# HUGPONG 1.1.2 — 16 November 2026

Status: **deployed and published** on 16 November 2026 (Asia/Manila). Website/API: https://hugpong.org. Android download: https://hugpong.org/downloads/android/1.1.2. Stable release: https://github.com/anautumny/HUGPONG/releases/tag/v1.1.2.

## Included changes

- Web/Mobile synchronization recovery, retained account state and offline work, request backoff and ordinary-browsing rate-limit fixes.
- Header-only Mobile sync feedback, login loading, per-field manager takeover authorization retention, exit confirmation and keyboard/loading improvements.
- Price comparisons, notification identity and inbox actions, authentication restoration and download progress metadata.
- Audit PDFs with actual selected quantities/units, full-operation costs including labor, weighted rates for grouped operations, continued crop-cycle month columns and certified date-range compilation.
- Source quantity/unit validation before submission and compilation, preserving signed historical reports and queued work.
- Shared native PDF/QR export handling with duplicate-request prevention, cancellation/error recovery, background-activity guards and bounded QR bitmap capture.
- Audit Inbox empty content remains directly below its heading when the panel height changes.

## Database / API / Web / Mobile

No existing business records are migrated, deleted or rewritten. Firebase remains authoritative; existing API mutations, authentication, RBAC, offline queues and QR verification are retained. New date-range compilation metadata uses existing collections and is saved only when an authorized user requests a compilation. Incomplete new operation submissions/audit compilations receive validation errors and retain their source work.

The existing Cloudflare Worker and same-origin Web assets were updated for `https://hugpong.org`, preserving the canonical API Durable Object and existing secrets. Android uses `com.hugpong.app`, app version 1.1.2, remote Android version code **14** and the existing signing identity. Install using **Update** over the existing app; do not uninstall or clear storage.

The website's release manifest was updated only after the 1.1.2 artifact passed metadata/signature checks and was published. Version, byte length and artifact URL were changed together. The APK is **112,782,083 bytes** (112.8 MB decimal). The previous 1.1.1 artifact remains available on GitHub.

## Release identity

- APK source commit: `b9662fdb8e0c79ca74213f3e3a56a48701c7555e` on main.
- Verification/tag commit: `f0b7b88383cd99f70ee1dd175d0b92448cc33d54`; this adds only the CI dependency-order correction to the APK source. GitHub verification run `43759074666` passed.
- Deployed Web/API/download metadata commit: `502a0cf60113c15599319b8efe7e2a61d91bb3cc` on main; the exact full commit is also recorded in `output/release-1.1.2-deployment.json`.
- EAS build: `4e627eb0-ccf3-4898-8f7e-7355db51025b`, FINISHED, version 1.1.2, code 14.
- Cloudflare version: `73b6611e-2bca-4450-a299-24e96f04c2df`; existing `hugpong` Worker, active mode, `hugpong-production` Firebase project.
- Previous Cloudflare version retained for rollback: `8b017b2c-82da-4c0d-a574-a79f0ed8cfb7`.
- APK SHA-256: `71512f1fcc0ad0807189b999bd1190e2dbcf07384e290a264c923ea5047a13db`.
- Signing-certificate SHA-256: `88cba6d11aa4e849639eb8ad2d0ed08e459703b50ba20d5389ac29d8bd5ab83d`, identical to the independently verified 1.1.1 APK certificate. Android apksigner verified both signatures.

## Validation and limits

Pre-release full local gate passed with 912 server tests and 75 Web tests, plus Web build, Android JavaScript/Hermes export and configuration/authority/security checks (`output/release-1.1.2-verification.txt`). Actual Android/Web PDF previews matched saved Basal values (4 ton at PHP 1,360, full cost PHP 5,440). The emulator QR save succeeded; the saved image decoded to the selected report. Native background, cancellation, concurrency, missing-view and storage-failure cases are covered by tests.

The final local gate with the published APK manifest passed again: **912 server tests and 75 Web tests**, zero failures (`output/release-1.1.2-final-verification.txt`). Cloudflare dry run passed and production upload/startup/activation succeeded (`output/release-1.1.2-worker-dry-run.txt`, `output/release-1.1.2-cloudflare-deploy.txt`). The initial GitHub workflow failed because Cloudflare test tools were installed after the new Workers test; moving the install before the gate resolved that setup issue. The corrected CI run passed.

The inspected Android upload archive contained current source with no excluded/private file findings. APK inspection confirmed production API origin, absence of the old Render origin, native export/background guards, bounded QR rendering and full-operation rate logic. Evidence: `output/release-1.1.2-archive-audit.json`, `output/release-1.1.2-apk-inspection.json`, `output/release-1.1.2-apk-signature.txt`, `output/release-1.1.2-publication.json`.

Live read-only public verification passed:

- `/`, `/prices` and `/fields`: HTTP 200 with the new entry; entry bytes and Audit Center/PDF/Login feature chunks match the local verified build.
- `/health` and `/health/ready`: HTTP 200 in active gateway mode.
- Anonymous `/auth/session`, `/api/fields` and `/api/prices`: HTTP 401, preserving authentication requirements.
- `www.hugpong.org`: HTTP 308 to the canonical domain.
- APK HEAD: HTTP 200, correct attachment filename and Content-Length 112,782,083.
- APK resumed GET: HTTP 206, correct 4-byte length and ZIP signature.
- Full hosted APK GET: HTTP 200, declared and received lengths both 112,782,083, SHA-256 identical to the signed source artifact. This verifies actual streamed download lengths rather than HEAD metadata alone.

Evidence: `output/release-1.1.2-live-verification.json` and `output/release-1.1.2-live-after.json`.

No emulator or physical phone was connected during the final deployed signed-in check, so that check was unavailable. Physical-phone installation, push delivery and the complete signed-in multi-role/Web/Android acceptance matrix remain device acceptance work. These checks do not establish that every physical device is crash-free. No existing production business record was changed merely to simulate that matrix, and no local app storage or pending work was cleared.
