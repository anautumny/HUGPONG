# Deployment readiness - 25 October 2026

**Decision: the current source passes automated release verification and is ready for a controlled staging deployment. A full production rollout is not yet cleared.** No new application defect was reproduced in this pass. These checks do not establish that all defects are absent.

No application source was changed, no code was deployed, and no production business records were modified during this check. External checks were read-only.

## Database / schema

The live, project-validated inventory confirms all **30 required indexes ready**, zero missing definitions, and zero pending builds. The audit fixes use optional server-owned fields and existing versions, without a new collection migration. This pass did not re-deploy or independently compare deployed Firestore rules.

## Server / API

- Backend suite: **644 passed, zero failed**.
- Full release gate: **passed**, including production configuration parity, authority/secret/binding audits, dependency mitigation verification, tests, web build, and Android production export.
- Authority audit: 242 files, zero findings. Secret audit: 564 files, zero findings. Client binding audit: zero findings. Diff whitespace check passed.
- Fresh npm production-dependency audit: **zero reported backend advisories**.
- Public `/health/ready`: **200**, `success: true`, `status: ready`. Unauthenticated `/api/logs`: **401**. Concurrent requests took approximately **33 seconds** each; the cause of the delay was not established.

The public probes check the existing deployed revision. They do not prove that the local fixes are deployed, verify authenticated workflows, or inspect hosting environment/runtime settings.

## Web

- Web suite: **46 passed, zero failed**.
- Production Vite build passed.
- Fresh npm production-dependency audit: **zero reported web advisories**.

Signed-in role, account-review, audit, report, and takeover acceptance remains required against the release candidate. Browser visual acceptance was not performed during this pass.

## Mobile

**Android and iOS production exports passed.** The configured EAS HTTPS API origin was accepted. This supersedes the earlier development-origin export limitation in the audit notes. Exports validate production bundling; they are not signed installable APK/IPA builds.

The published 1.0.5 APK predates these local fixes. A new identified candidate must be built, installed, and tested before replacing the download artifact. Camera permission recovery, scanner framing, filter gestures, back navigation, QR share sizing, report appearance, and preservation of pending offline work during upgrades still require physical-device acceptance.

The fresh npm production-dependency audit reports **five high-severity package entries** in the Expo dependency graph, including node-forge and Zod. The node-forge postinstall mitigation check passed and its regression is covered by the backend suite; npm still flags the upstream version. Zod exposure/mitigation remains an unresolved release-review item. This is not a clean mobile dependency audit. No force update or dependency downgrade was applied.

## Remaining release gates

1. Resolve or document actual exposure from the remaining mobile dependency findings before approving production distribution.
2. Include all required tracked and untracked source files in a specific release revision. Release matching API, web, and mobile changes together: older clients omitting mandatory record versions will receive precondition errors. Preserve outbox IDs, queued work, and version metadata during upgrades.
3. Build a new signed mobile candidate and complete device smoke tests, including an in-place upgrade with pending offline work followed by manager takeover and reconnection. Verify that duplicates are prevented and conflicts remain reviewable.
4. Test authenticated end-to-end behavior against the deployed candidate, verify report years and exported appearance, confirm actual hosting configuration, and recheck readiness. Publish the APK and update its download manifest after the artifact passes acceptance.

## Evidence

- `output/release-check-gate.log`: complete release verifier, exit 0.
- `output/release-check-server-tests.log`, `output/release-check-web-tests.log`: independent fresh suites.
- `output/release-check-ios.log`: iOS production export, exit 0.
- `output/release-check-indexes.log`, `output/release-check-live.json`: read-only external checks.
- `output/release-check-{server,web,mobile}-dependencies.json`: fresh registry audits.
- `output/release-check-{authority,secrets,bindings}.log`: static audits.

Initial external checks were blocked by sandbox networking. These results come from successful network-enabled retries.
