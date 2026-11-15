# Web notification controls and audit footer - 15 November 2026

Status: implemented and verified locally with the pending release. Not deployed; no new APK published.

## Result and modified files

- `web/react-app/src/components/audit/AuditDossierCard.jsx`: certification text and applied seal form a status row. Download PDF and Print Audit Document occupy their own aligned action row, stacking at narrow widths. PDF errors appear below the controls. Certification/submission authorization and existing handlers remain in use.
- `web/react-app/src/components/layout/NotificationBell.jsx`: individual Mark read and Clear controls, Mark all as read, confirmed Clear all, busy feedback, immediate duplicate-click guards, Close and inline errors. Bulk actions include older inbox pages. Loading older notifications now reconciles server read/dismissed state before displaying them. Monotonic local state prevents delayed older responses from restoring cleared/unread items. Account/lifecycle checks reject late updates after switching accounts.
- The notification subscription now uses the existing shared authenticated loader for inbox plus state. Failure of the secondary state query therefore participates in the existing retry/cooldown lifecycle instead of leaving the screen stale until another event.
- `web/react-app/src/services/notificationService.js`: bulk actions scan the existing authorized, paginated inbox on explicit user action, including empty authorization-filtered pages. They submit at most 100 IDs per existing state request, validate acknowledgements, stop on account changes and reject broken/repeated cursors. No polling or second notification system.

## Other layers

- Database/schema: unchanged. Clearing sets this account's dismissed/read flags; it does not delete source notifications, prices, audits or other business records.
- Server/API: reuse existing authenticated `/api/notifications/inbox`, `/api/notifications/state/query` and `/api/notifications/state`. The expected-user precondition, account-owned state hashes, monotonic read/dismissal rules, authorization and change-feed invalidation remain authoritative. No route or permission expansion.
- Mobile: existing Mark all read/Clear controls and account-scoped offline state continue using the same API. A regression executes Web bulk clear through the real state route fixture, then loads those states through the actual Mobile state client; all 125 cleared IDs are read/dismissed on Mobile. No Mobile layout change is required for this Web footer.

## Verification and remaining checks

- Focused notification/component suites: **44 passed, zero failures**. Includes individual read/clear behavior, repeat taps, busy indicators, stale projections, older-page dismissal/read state, bulk confirmation, account switching, bounded batches across unloaded and empty pages, malformed acknowledgements, cursor loops and Mobile state parity.
- Full `npm run verify:release`: **847 server tests and 66 Web tests passed**, zero failures. Configuration/authority/binding/secret checks, Web production build and Android JavaScript/Hermes export passed. `git diff --check` passed.
- Tests: `server/tests/mobile-ui-pagination.test.js` and `server/tests/notification-lifecycle.test.js`.
- Evidence: `output/notification-actions-regressions-2026-11-15.tap` and `output/notification-actions-release-gate-2026-11-15.txt`.
- No production notification states were changed during verification. Live browser appearance at actual screen sizes and Web-to-phone notification state synchronization remain checks for the pending release; a physical-device or browser screenshot result is not claimed from the component harness/build.
