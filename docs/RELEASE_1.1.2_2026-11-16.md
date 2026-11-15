# HUGPONG 1.1.2 — 16 November 2026

Release requested by the user. Preparation is in progress; publication and deployment results will be recorded below after verification.

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

The existing Cloudflare Worker and same-origin Web assets will be updated for `https://hugpong.org`, preserving the canonical API Durable Object and existing secrets. Android uses `com.hugpong.app`, app version 1.1.2, incremented remote Android version code and the existing signing identity. Install using **Update** over the existing app; do not uninstall or clear storage.

The website continues advertising the verified 1.1.1 APK until the 1.1.2 artifact has passed metadata/signing checks and been published. The version, byte length and artifact URL will then be changed together.

## Validation and limits

Pre-release full local gate passed with 912 server tests and 75 Web tests, plus Web build, Android JavaScript/Hermes export and configuration/authority/security checks (`output/release-1.1.2-verification.txt`). Actual Android/Web PDF previews matched saved Basal values (4 ton at PHP 1,360, full cost PHP 5,440). The emulator QR save succeeded; the saved image decoded to the selected report. Native background, cancellation, concurrency, missing-view and storage-failure cases are covered by tests.

Only the emulator is connected. Physical-phone installation, push delivery and the complete signed-in multi-role/Web/Android acceptance matrix remain device acceptance work. These checks do not establish that every physical device is crash-free. Existing production records will not be changed merely to simulate that matrix.
