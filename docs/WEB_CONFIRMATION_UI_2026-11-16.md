# Web confirmation dialogs

16 November 2026. Status: deployed to https://hugpong.org and live assets verified. No Android update is required for this Web presentation fix.

## User-visible change

The stage-completion prompt used `window.confirm`, which is rendered by the browser and shows the website name with generic OK/Cancel buttons. Web now uses HUGPONG's existing themed confirmation modal with a descriptive title, the selected field, a specific action button and Cancel.

The same replacement covers individual/batch Crop Year Cycle approvals, assisted recovery approval/rejection and clearing all notifications. Existing browser error alerts and reason-entry prompts are separate UI paths and are not changed by this patch.

## Database and API

No schema, index, business mutation, permission or endpoint change. Stage progression, takeover authorization, base-version conflicts, renewal audit coverage, recovery eligibility and notification ownership remain server-authoritative. No new database reads are introduced by displaying a dialog.

## Web

The shared `useConfirmation` hook waits for an explicit decision without blocking browser rendering. Cancel, Escape, account/role/authentication-version changes, navigation/unmount or replacing a pending confirmation resolve the old action as canceled. Each confirmation is settled at most once, and stale callbacks cannot confirm a replacement dialog.

The existing modal receives accessible title/description IDs, retains keyboard focus behavior and prevents dismissal while an existing confirmation action reports loading. Message contrast uses the application's standard supporting-text color. Light/dark previews were inspected with the actual React component and built application CSS in a headless local browser.

## Mobile

Android retains its existing native application confirmation controls and the same authoritative API workflow. The reported browser-specific popup is a Web presentation issue; no APK or Mobile data model change is required.

## Verification

Four new real React DOM tests cover confirm/cancel, double activation, Escape, account/session changes, replaced confirmations and unmounting. Existing recovery-list and notification-controller tests now exercise the real confirmation hook instead of a browser-confirm stub; their 36 client regressions pass. The full local release gate passed **954 server tests and 79 Web tests**, security/configuration/client-binding audits, Web production build and Android production export. Evidence: `output/web-confirmation-release-gate-2026-11-16.txt`.

Visual evidence: `output/web-confirmation-light-2026-11-16.png` and `output/web-confirmation-dark-2026-11-16.png`. Previews contain local fixture fields only; no production record was changed to test a confirmation.

## Deployment

Source commit `79b5e71670abd7ee7c1abb5918ec657660024bc0` was pushed and deployed as Cloudflare version `a73af002-a0c8-4743-9a12-2098e95c11eb`. The previous version `f77b68f3-da82-4fa2-a866-af0de1410beb` remains available for rollback. Public operations HTML and the exact entry/OperationsView bytes match the verified build; the new confirmation labels are present, and readiness returns HTTP 200. Evidence: `output/web-confirmation-cloudflare-deploy-2026-11-16.txt` and `output/web-confirmation-live-verification-2026-11-16.json`.

Reload the Web Console to load the new assets. Live verification did not approve a recovery request, clear real notifications, renew a cycle or complete an actual field stage.
