# HUGPONG Staging Application Capacity Runbook

Phase 4 measures authenticated HUGPONG behavior through the real server authority boundary. It is deliberately restricted to a staging, test, preview, or beta hostname and must never run against production data.

## Database / schema

- No Firestore schema migration is required.
- The read scenario uses ordinary role-scoped API reads and therefore consumes staging Firestore quota according to the existing server caches and queries.
- The optional duplicate-write scenario creates one ordinary staging operation, confirms that concurrent copies converge on its stable ID, and archives it afterward. The archived operation and its audit history remain in staging for traceability.
- Use a separate Firebase staging project. Never provide a production account or production URL to this command.

## Server / API

The command signs in through `POST /auth/login` and exercises only existing canonical endpoints:

- `GET /api/fields`
- `GET /api/crop-cycles`
- `GET /api/logs?status=ACTIVE&limit=25`
- `GET /api/prices?limit=2`
- Optional: concurrent `POST /api/logs` requests with the same operation ID, followed by `POST /api/logs/archive`

It does not bypass authorization, rate limits, field ownership, crop-cycle validation, area validation, or mutation idempotency. The default limits remain below the existing per-address and per-account security budgets.

## Web implementation

The Web profile uses the production Web request contract: `x-client-platform: web`, browser device metadata, normal login, a server-issued bearer, and the same API paths used by the React client. No load-test controls are exposed in the Web interface.

## Mobile implementation

The Mobile profile uses `x-client-platform: mobile`, Android-style device metadata, the normal server-issued token, and the same API paths used during canonical refresh and outbox replay. The optional write test requires Mobile because the dedicated staging account must own the target field. No load-test controls are included in the installed application.

## Prepare the staging account

1. Create or select a dedicated ACTIVE staging Farm Manager if testing both Web and Mobile reads. Farm Managers are authorized on both platforms.
2. Complete phone verification and the required first-login password change.
3. For the optional write scenario, assign that staging manager as the owner of one ACTIVE field in its managed Block Farm. Alternatively, use a dedicated Farm Member and set the profile to `mobile`.
4. Ensure the field has one ACTIVE Crop Year Cycle.
5. Do not reuse a real person's production password.

## Authenticated read measurement

In PowerShell, configure values without committing them to a file:

```powershell
$env:APPLICATION_LOAD_BASE_URL="https://hugpong-beta.your-host.example"
$env:APPLICATION_LOAD_ENVIRONMENT="staging"
$env:APPLICATION_LOAD_CONFIRM="MEASURE_HUGPONG_STAGING_APPLICATION"
$env:APPLICATION_LOAD_IDENTIFIER="your-dedicated-staging-user"
$env:APPLICATION_LOAD_PASSWORD="your-staging-password"
$env:APPLICATION_LOAD_PROFILE="both"
npm run measure:application
```

Defaults are 40 authenticated reads with concurrency 6. The report contains success rate, p50/p95/p99 latency, request rate, status counts, roles, and platforms. It never prints the identifier, password, or authentication token.

## Optional duplicate-write measurement

Only enable this in the separate staging project:

```powershell
$env:APPLICATION_LOAD_WRITE_CONFIRM="CREATE_AND_ARCHIVE_STAGING_OPERATION"
$env:APPLICATION_LOAD_DUPLICATE_WRITES="8"
npm run measure:application
```

A passing result requires:

- every concurrent request succeeds;
- exactly one response represents the newly created operation;
- every other response is an idempotent replay of that same ID;
- the test operation is archived afterward.

If the archive step fails, archive the operation identified by the `Phase 4 staging concurrency check` name from the staging application before resetting the staging project.

## Interpretation

- A pass establishes a small initial concurrency baseline for the selected host and staging Firebase plan.
- It does not establish unlimited capacity or a production service-level agreement.
- Repeat the measurement after changing queries, authorization, hosting plan, Firebase plan, or expected user count.
- Stop increasing concurrency when rate limits appear. Security limits are part of the production contract and must not be disabled to improve a benchmark.
- Record the date, hosting plan, Firebase plan, request count, concurrency, success rate, and p95 latency for every accepted release.
