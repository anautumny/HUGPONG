# Mobile login and initial-data loading — 14 November 2026

Status: local changes only. The user's deployment hold remains active. No new APK build, publication, deployment or Git push was performed for this change.

## Result and cause

Mobile could navigate to MainTabs as soon as credentials were accepted while the first canonical data request was still running. The screen's empty initial arrays could look like missing account/assignment data. A spinner inside the sign-in button did not explain the subsequent gap.

The existing canonical store now publishes account-scoped, transient loading metadata through its existing subscription mechanism. MainTabs displays a loading view until a confirmed snapshot exists, with separate failure/offline recovery states. No artificial timer delays a ready screen. A confirmed empty result is treated as loaded, so an account with no assigned fields does not spin forever.

- Login shows a spinner and “Signing in…” with an accessible busy state.
- Splash shows “Restoring your account…” while restoration runs.
- First data load shows “Loading your data,” a spinner and static skeleton placeholders.
- Failed first loads show a retry action rather than an indefinite spinner or false empty records. A server-unavailable condition is not presented as a confirmed lack of internet; connectivity checking continues to show progress.
- Cached snapshots remain visible during background refresh. A small notice explains updating, failed updating or offline cached data.
- A complete account-owned cached snapshot is usable offline even if its field list is legitimately empty. Legacy cached fields, drafts and pending work remain accessible offline for their owner; partial legacy data is not presented as a confirmed fresh online snapshot.
- Retry reuses the existing active refresh function, with the existing listener restart as a fallback. No polling loop, second datastore or parallel listener owner was added.
- New loading text is translated into English, Filipino and Hiligaynon. The loading/recovery screen scrolls on small displays or with larger text.

## Database / server / Web / Mobile

Database/schema: unchanged. Loading state is transient presentation metadata, never mutation authority or a cloud data record.

Server/API: no additional API calls, endpoints or permission changes were introduced for loading status. The earlier local session-resilience correction remains separately documented in the system audit.

Web: no application source changes in this follow-up. Web already has its route-loading boundary and feedback. Its existing authorization/data loading behavior remains in place.

Mobile changed files:

- `mobile/src/data/dataStore.js`: account-owned loading lifecycle, successful snapshot tracking, cache-aware startup and reuse of the canonical retry path.
- `mobile/src/domain/initialDataPresentation.js`: separates loading, error, offline and content decisions while rejecting another account's metadata.
- `mobile/src/components/InitialDataLoading.js`: accessible loading, recovery and non-blocking refresh notices.
- `mobile/src/navigation/RootNavigator.js`: initial-data gate and retry integration, preserving native tab and offline workflows.
- `mobile/src/screens/auth/LoginScreen.js` and `SplashScreen.js`: visible sign-in/restoration progress.
- `mobile/src/services/i18n.js`: localized messages.

Existing account guards, backend validation, role/platform policy, scoped queues and QR verification were not weakened. The current audit's unrelated open findings remain open.

## Verification

Executable tests cover delayed first responses, loaded empty results, initial failures, recovery, retaining cached data during refresh/failure, another account's loading metadata, older offline saved work, and the actual Native loading component's progress/retry behavior. The account-switch regression now distinguishes an allowed initial loading-status notification from a forbidden stale data notification.

The final local release gate passed **796 server tests**, **65 Web tests**, production Web compilation and Android JavaScript/Hermes export. Evidence is `output/mobile-loading-release-gate-2026-11-14.txt`. This validates bundle execution/build inputs, not an installed APK or a physical phone's visual timing. Physical Android acceptance remains pending.

## Explanation of the separate QR finding

The audit used a deliberately delayed generator to test `web/react-app/src/components/audit/QRCodeView.jsx`: report A started generating, report B was selected, B finished first, and A finished last. With no selection guard, that forced sequence left B's details beside A's QR. A scan in that scenario would refer to A.

However, inspecting the installed `qrcode/lib/browser.js` and `renderer/svg-tag.js` shows that SVG generation is synchronous inside its Promise. The forced completion inversion is not a confirmed normal-use failure, so A08 has been downgraded. The component does retain the previous SVG until the new selection's effect commits its result, and lacks a guard against delayed or unmounted results. Binding each preview to its selected payload and displaying a loading state until that payload is ready would close that gap. No signature forgery was demonstrated, and no QR fix was made in this follow-up. See A08 in [SYSTEM_WIDE_AUDIT_2026-11-14.md](SYSTEM_WIDE_AUDIT_2026-11-14.md).
