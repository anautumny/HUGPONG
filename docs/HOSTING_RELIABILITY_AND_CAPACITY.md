# HUGPONG Hosting Reliability and Capacity Runbook

Phase 3 prepares the HUGPONG gateway for managed hosting and provides a safe, repeatable hosting-capacity measurement. Firestore remains the canonical database and all business validation and mutations remain server-authoritative.

## Database / schema

- No Firestore collection or document migration is required.
- Liveness, readiness, and the hosting smoke test do not read or write Firestore, so routine platform probes do not consume the Firebase daily read quota.
- Business-data capacity is still limited by the selected Firebase plan and must be measured separately in a non-production Firebase project before a larger launch.

## Server / API

The server exposes three public, non-identifying probes:

- `GET /health/live` returns HTTP 200 while the Node.js process is running. Use it as a liveness or restart probe.
- `GET /health/ready` returns HTTP 200 only while the instance accepts new traffic. Use it as the hosting health check.
- `GET /health` remains a compatibility alias for readiness.

The server stops reporting ready as soon as `SIGTERM` or `SIGINT` is received, stops background cleanup, rejects new routing through the hosting load balancer, and gives active requests a bounded period to complete. Request, header, keep-alive, and per-socket limits prevent abandoned connections from occupying an instance indefinitely.

Recommended production values are included in `server/.env.production.example`:

```text
REQUEST_TIMEOUT_MS=30000
SHUTDOWN_GRACE_PERIOD_MS=10000
```

Configure the managed host to:

1. Start the application with `npm start` from the repository root.
2. Use `/health/ready` as its health-check path.
3. Send `SIGTERM` and allow at least 15 seconds before forcibly terminating an old instance.
4. Restart the process after a crash or failed liveness probe.
5. Keep at least one instance running if the provider and budget support it. Free services that sleep can have a cold-start delay; application code cannot guarantee continuous availability while a host suspends the instance.

## Web implementation

The Web connectivity monitor uses `/health/ready`. During a rolling deployment it pauses reconnect work instead of sending queued work to an instance that is shutting down. Normal authenticated reads and mutations continue to use the canonical server API.

## Mobile implementation

Android uses the same `/health/ready` signal before automatic synchronization. Local records and the durable outbox remain on the device while no ready server is available, then the existing idempotent replay resumes after a healthy response.

## Post-deployment hosting measurement

Run the smoke test only against a HUGPONG deployment you own:

```powershell
$env:LOAD_TEST_BASE_URL="https://your-hugpong-host.example"
$env:LOAD_TEST_CONFIRM="MEASURE_HUGPONG_HOSTING"
npm run measure:hosting
```

The default run sends 75 requests with concurrency 10 to `/health/ready`. It stays below the gateway's per-address burst ceiling, and passes when at least 99% succeed and p95 latency is at most 1500 ms. It reports request rate, p50/p95/p99 latency, failures, and HTTP status counts. It does not authenticate and does not consume Firestore reads or writes.

Optional bounded settings:

```powershell
$env:LOAD_TEST_REQUESTS="90"        # 10-90; bounded below the security burst ceiling
$env:LOAD_TEST_CONCURRENCY="20"     # 1-50
$env:LOAD_TEST_MAX_P95_MS="1500"
npm run measure:hosting
```

Record the result with the deployment date and hosting plan. Run it after deployment, after changing the hosting plan, and before increasing the user group. Do not interpret this gateway-only result as proof of Firestore write capacity. A later staging test must exercise representative authenticated reads and idempotent writes without touching production data.

## Acceptance checklist

- Release verification passes.
- The deployed `/health/live` and `/health/ready` routes return HTTP 200.
- Stopping or redeploying the instance changes readiness before termination.
- Web and Android report the server unavailable while readiness is false and recover without an application restart.
- The hosting smoke report passes on the chosen hosting plan.
- The backup and recovery drill from Phase 2 is current.
