# Field-specific takeover retention

16 November 2026. Implemented locally; no deployment or APK publication performed.

## Result and root cause

The user requested keeping each field authorized while browsing other fields, until explicit exit or expiry. Both clients previously held one authorization and cleared it whenever the selected field changed. Mobile also constructed the authorization's field identity from the currently selected field, so removing that reset alone would have risked applying the previous grant to a different field in the UI.

Web and Mobile now retain server-issued grants separately by normalized field ID in the current workspace's memory. Each entry preserves its original manager ID, field ID, authentication version and server-provided expiry. A different field remains unauthorized until it receives its own server authorization. Returning to an authorized field reuses its existing grant without another password check or server call. Browsing never extends a deadline.

The server's existing five-minute expiry remains unchanged. Expired grants are removed by one timer for the next deadline, and current-time validation also rejects stale entries when deriving capabilities. Account, role or authentication-version changes clear the workspace's grants. No grant is written to local storage, an offline queue or a new database collection. Leaving/unmounting the workspace or restarting the app does not persist elevated authorization.

## Database / schema

Unchanged. No migration, index, record deletion, mock application data or production business-data write was required.

## Server / API

No permission or endpoint change. The existing password-verification endpoint issues field/actor-bound signed takeover grants. The API still validates signatures, purpose, expiry, the authenticated actor, field scope and current assignments on mutations. Client retention does not authorize a new field, bypass password verification, extend server expiry or allow offline takeover. Existing authorization/action audit records continue through their original server paths.

## Mobile implementation

- `mobile/src/screens/FieldOpsScreen.js`: replaces the single field-independent authorization state with an in-memory map of field-specific grants. Current-field capability checks use the stored grant's original field rather than rebinding it to the selected field. Changing fields keeps other valid grants. Explicit Exit Manager Takeover ends only the currently selected field. Routed takeover entry can reuse only that field's still-valid grant. Pending requests/actions are still invalidated on scope changes; a late response cannot authorize a different field. Offline state disables takeover even while a grant remains unexpired.
- `mobile/src/domain/operationAuthorization.js`: pure presentation helpers to remember, select, forget and prune scoped grants. Existing operation capability and personal-field rules remain in use.

## Web implementation

- `web/react-app/src/views/operations/TakeOverView.jsx`: matching field-specific grant retention, owner/version cleanup and expiry handling. Field selection clears pending confirmation state but does not erase valid authorizations. Exit Field Takeover removes only the selected entry. The existing workspace exit still returns to Fields and explicitly ends all grants in that workspace; confirmation text now explains this. The controls wrap at narrow widths. Expiry of a different field does not incorrectly display an expiry error on the selected authorized field.
- `web/react-app/src/domain/operationAuthorization.js`: identical retention helpers and field-scope checks.

## Verification

- Focused runtime/component/security suites: **48 passed**, zero failures. New tests execute the actual Mobile authorization/lifecycle handlers and Web retention handlers with controlled time, plus the full rendered Web component in the existing component harness.
- Covered A to B to A, independent authorization of B, locked C, no repeated password request when returning to A, original deadlines, A expiring while B remains valid, individual field exit, workspace exit, owner/role/authVersion changes, offline Mobile restrictions, missing/invalid grant metadata and delayed old-field authorization results.
- Existing signed-grant/server mutation tests still reject wrong-field, wrong-manager, expired and tampered grants. A new test also places a real server-issued signed grant in each client's retained state and verifies it cannot authorize another field or outlive the server deadline.
- Full `npm run verify:release`: **869 server tests and 67 Web tests passed**, zero failures or skipped tests. Configuration parity, secret exposure, authority, client bindings, Web production build and Android production JavaScript/Hermes export passed. No deployment or new native APK is implied by this export.
- Tests: `server/tests/takeover-field-navigation.test.js` (new), `server/tests/takeover-review-regressions.test.js`, updated `server/tests/mobile-ui-pagination.test.js`, and existing operation authorization/takeover round-trip and draft-boundary suites.
- Evidence: `output/takeover-field-retention-focused-2026-11-16.tap`, `output/takeover-retention-release-gate-2026-11-16.txt`. Whitespace checks passed.

## Remaining live acceptance check

### Exit confirmation follow-up

Both clients now confirm individual field exits before removing an authorization. Stay Here/cancel leaves it active; Exit Takeover ends only the named field's authorization and preserves saved operations. Mobile ignores a confirmation left over after changing account or field. Web binds the confirmation to the original actor, field and grant so it cannot remove another field's or a replacement authorization. The existing Web workspace exit confirmation remains and explains that it ends all workspace authorizations. Database and server/API behavior are unchanged.

After this UI follow-up, the 48 focused runtime/component/security tests passed again, including cancel versus confirm and preservation of the other field's authorization. Evidence: `output/takeover-exit-confirmation-2026-11-16.tap`. Whitespace checks passed. The full release gate above predates this confirmation-only follow-up; no new deployment or APK build was performed.

The current emulator account was a Member; a live Manager password authorization was not performed or impersonated. In the local Web and emulator Manager workspace, authorize field A, browse B without authorizing it, return to A, authorize B separately, exit only A, and confirm B remains authorized. Wait for the original five-minute deadlines and confirm expiry still requires new authorization. Confirm server-authorized operations are attributed to their own field and manager. These live Manager/device results are not claimed from component tests or a successful build. Use approved test records because the local API still uses the existing Firebase project.
