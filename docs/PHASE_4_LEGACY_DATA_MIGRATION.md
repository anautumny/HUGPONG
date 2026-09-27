# Phase 4 — Legacy Data Migration and Deployment Gate

Phase 4 closes the gap between the current server-authoritative schema and records created before the security and integrity phases. The migration is dry-run-first, non-destructive, and intended for an authorized deployment operator.

## Database / schema

The audit reads these canonical collections:

- `users`
- `account_identifiers`
- `user_credentials`
- `block_farms`
- `fields`
- `crop_cycles`
- `operation_logs`

It reports malformed or duplicate phones, conflicting or orphaned phone reservations, missing/orphaned credentials, invalid roles, and broken manager, member, farm, field, cycle, and operation relationships.

The only automatic repair is creating a missing `account_identifiers/{sha256(normalizedPhone)}` reservation for an existing user whose phone is valid and unique. The migration never overwrites or deletes documents, invents credentials, or guesses relationship repairs. Every created reservation receives an atomic audit event.

## Server / operator workflow

Run the read-only audit first:

```powershell
cd server
npm run audit:legacy-data
```

Execution requires all three deliberate confirmations:

1. the `--execute` script;
2. `HUGPONG_ALLOW_LEGACY_MIGRATION=true`;
3. `HUGPONG_MIGRATION_PROJECT_ID` exactly matching the active Firebase project.

```powershell
$env:HUGPONG_ALLOW_LEGACY_MIGRATION = 'true'
$env:HUGPONG_MIGRATION_PROJECT_ID = '<exact-active-project-id>'
npm run migrate:legacy-data
Remove-Item Env:HUGPONG_ALLOW_LEGACY_MIGRATION
Remove-Item Env:HUGPONG_MIGRATION_PROJECT_ID
```

The executor re-reads each user and reservation inside a transaction. A changed phone or newly conflicting claim stops execution. It then runs the full audit again; unresolved integrity findings produce a non-zero deployment-gate result.

## Web implementation

No browser migration code is added. Web continues to create and update accounts through authenticated server endpoints, and it cannot read or write `account_identifiers` or `user_credentials`.

## Mobile implementation

No device migration code is added. Mobile continues to use the authenticated API and account-scoped cache. It receives no phone hashes, credential records, or migration controls.

## Deployment rule

Do not deploy the new account-creation flow against a legacy database until the dry-run report has been reviewed. A successful identifier backfill is not sufficient when missing credentials or broken relationships remain; `deploymentReady` must be `true` after verification.
