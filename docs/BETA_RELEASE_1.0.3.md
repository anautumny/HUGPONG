# Beta 1.0.3 release record

Source commit: `10d080ec0a79cde918993b4ee9b8c4522b87bcca`. Web rollout verified on 16 October 2026 (Asia/Manila). The Android build and artifact publication are tracked below.

## Database / schema

No database changes or data migrations. The 39 imported weekly price records, quotation statuses, and provenance remain intact.

## Server / API

No business logic, authorization, or analytics changes. Price availability and monthly averages remain server-owned. The release manifest selects the published 1.0.3 APK for the existing versioned attachment endpoint.

## Web

The deployed chart uses up to eight short horizontal date labels across the entire reporting period, including unquoted weeks. Larger text, stronger contrast, selectable point details, horizontal scrolling on narrow screens, and an expandable full price table replace the crowded labels. Source links, source descriptions, and reference footers are removed from price displays.

Live checks confirmed readiness and the updated Analytics, Prices, and shared price-card assets. Browser-based visual inspection was unavailable in the agent environment; markup checks exercised the 39-week series, monthly averages, single-point, empty, and unquoted periods, including label spacing and source-detail removal.

## Mobile

Android version 1.0.3, version code 5, package `com.hugpong.app`, uses the existing signing key. Price cards omit source-bulletin links and reference footers. Market history stacks the period and product prices with larger text.

EAS build `2059600e-4fad-43b6-ad79-f6147b84c90c` completed successfully. APK size: `116486456` bytes. SHA-256: `a08aaae023dce371b5e5fcf146cf0da8a7385c7855802d574ed1a81e0acc59bf`. Download length and ZIP header were checked. Bundle inspection confirmed the hosted HTTPS API, updated Market history and price description, and absence of the source-bulletin link. GitHub's uploaded artifact digest and size matched the local APK; a public byte-range request verified the published artifact's total size and ZIP header.

- [Published release](https://github.com/anautumny/HUGPONG/releases/tag/Beta-1.0.3)
- [Direct website download](https://hugpong-beta.onrender.com/downloads/android/1.0.3)

Install over the previous beta to retain the existing app installation. The release-manifest commit only changes Web/API download selection and this release record; the native source remains the commit listed above.

## Validation

546 server tests, 38 Web tests, the production Web build, and Android Hermes export passed. GitHub CI passed for the source commit. The 38 Web tests and production build passed again after updating the release manifest. Physical-device installation and interactive acceptance remain manual checks.
