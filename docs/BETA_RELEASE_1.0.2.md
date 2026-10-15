# Beta 1.0.2 release record

Released 16 October 2026 (Asia/Manila). Android source commit: `0d88a5a5cdbee263ee38bb4768a34e78fcea3d88`. The subsequent release-manifest commit points Web/API to the published APK and records the completed import; it does not change native application code.

## Database / schema

The production project `hugpong-production` now contains the 39 supplied historical weekly price records, 4 January through 27 September 2026. Import batch: `SRA-HISTORY-09C7CE4AB02251E0`. The transaction created 39 records, removed the selected mock `PRC-03166D5FFE6A490AA622`, and wrote an audit event. The original backup/plan remains in the ignored local `.tmp/beta-audit/historical-price-plan.json`.

Independent read-back verified every imported field against the source dataset, the missing mock, and the nullable latest prices with both statuses `MILLING_ENDED`. June means were verified as PHP 2,239.58/Lkg Sugar (3/4 reported weeks) and PHP 19,887.50/MT Molasses (2/4). No October record was fabricated. See [historical-price behavior and source limitations](HISTORICAL_SRA_PRICES.md).

## Server / API

The deployed API provides authoritative status-aware price analytics. `/downloads/android/1.0.2` streams the checked-in release artifact as an APK attachment, without sending the browser to GitHub. The fixed repository manifest prevents client-selected download destinations. Existing registration eligibility and SMS/review authorization remain server-owned.

## Web

Verification methods are visible selection buttons with a separate Continue action. The landing page uses the same-origin, versioned download endpoint. Prices and analytics display quotation statuses, dated last reports, chart gaps, and reported-week counts. The visible product label is **Molasses**.

## Mobile

Android 1.0.2, version code 4, package `com.hugpong.app`, uses the existing signing key and can be installed over the previous beta. Registration and first-login verification use the shared method-selection buttons. Home/Market support the new nullable-price schema; users of older APKs should update.

- EAS build: `a4ff10db-7ff3-4876-a1b0-2d68bc07393f`
- APK size: `116486724` bytes
- SHA-256: `4a3ee3052fd51c7a33683dd9566c399b0d184f9be62c91d695821695fe07635b`
- [Published release](https://github.com/anautumny/HUGPONG/releases/tag/Beta-1.0.2)
- [Website download](https://hugpong-beta.onrender.com/downloads/android/1.0.2)

The uploaded artifact's digest and size matched the local APK. A public byte-range request verified the published file's total size and ZIP header. APK bundle inspection confirmed the hosted HTTPS API, milling-ended handling, and verification-method prompt.

## Validation and remaining acceptance

The complete release gate passed 546 server tests, 38 Web tests, the production Web build, and Android Hermes export. GitHub CI passed for the native source commit. After updating the release manifest, all 38 Web tests and the production build passed again. The cloud Android build completed successfully.

Physical-device installation, real SMS delivery, and interactive registration/browser acceptance remain manual checks. Automated checks do not establish that the system has no bugs. See [interface behavior](BETA_1.0.2_INTERFACE_CHANGES.md) for the download and selection details.
