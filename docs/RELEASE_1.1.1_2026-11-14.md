# HUGPONG 1.1.1 release

The user lifted the deployment/build/publication hold on 14 November 2026 and requested the latest Web, API and Android version before final presentation testing. Rollout is in progress; live verification and APK publication details will be added after completion.

## Included changes

- Restore Mobile identity, assignments and saved data correctly after app restarts; show account-restoration, initial-data loading and retry feedback.
- Isolate unrelated failed reads in both clients, retain coherent field snapshots and recover automatically without manual data refresh.
- Preserve account-owned drafts/outboxes/uncertain intents when clearing downloaded cache.
- Fence delayed credential responses to their originating authentication context and serialize credential transitions.
- Reuse durable Web/Mobile price-publication intent and atomic server receipts to prevent lost-response retries creating duplicate prices/audits/notifications.
- Honor Retry-After, retain invalidations received during cooldown, canonicalize invalidation paths and batch notification reviewer lookups.
- Bind the Web QR preview to the selected report and ignore obsolete completions/errors.

## Database / server / Web / Mobile

Firebase remains `hugpong-production`, with the existing canonical API and domain `https://hugpong.org`. No business-record migration, deletion, index changes, secret changes or paid-service activation is required. Price receipts use the existing mutation-receipt collection.

Web and API reuse the existing Cloudflare Worker and single named Durable Object. Render remains suspended. Android retains `com.hugpong.app` and the existing EAS signing credentials; release credentials are frozen during the build. The APK must be installed over the existing app, preserving its data.

## Verification before rollout

The full local release gate passed **812 server tests and 66 Web tests**, source/configuration/credential checks, Web compilation and Android JavaScript/Hermes export. The Cloudflare Worker dry run also passed. Evidence: `output/audit-fixes-release-gate-2026-11-14.txt` and `output/release-1.1.1-worker-dry-run.txt`.

Root causes, modified application files, behavioral regressions and remaining audit risks are documented in [AUDIT_RECOVERY_FIXES_2026-11-14.md](AUDIT_RECOVERY_FIXES_2026-11-14.md). Physical phone testing, native push delivery, signed-in multi-role/device mutation/reconnect workflows and representative hosting load remain acceptance work; successful deployment does not establish those results.
