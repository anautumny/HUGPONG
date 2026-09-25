# Development authentication, OTP, and RBAC test setup

For a completely clean environment, run the gated procedure in `DEVELOPMENT_DATABASE_RESET.md` first. Database reset and account bootstrap are separate explicit commands; neither runs during normal startup.

This guide is for local development only. It creates no data on server startup and is deliberately blocked when `NODE_ENV=production`.

## Preconditions

- Configure Firebase Admin credentials as described in [Phase 3 authentication](PHASE_3_AUTHENTICATION.md). The server must be able to create Firebase custom tokens.
- Choose a unique local-development password. It is passed only through `DEVELOPMENT_TEST_PASSWORD`; it is never committed or written to Firestore in plaintext.

## Start the backend in console-SMS mode

In a PowerShell terminal in `server`:

```powershell
$env:NODE_ENV = 'development'
$env:SMS_PROVIDER = 'console'
$env:ALLOW_DEVELOPMENT_TEST_ACCOUNTS = 'true'
$env:DEVELOPMENT_TEST_PASSWORD = '<choose-a-unique-local-password>'
npm.cmd run start
```

`SMS_PROVIDER=console` is rejected when `NODE_ENV=production`. For production, set `SMS_PROVIDER=semaphore` and configure `SEMAPHORE_API_KEY` and `SEMAPHORE_SENDER_NAME` only in the server environment. There is no Semaphore-to-console fallback.

## Create the minimal test topology

Keep the backend running, then run this in a second `server` terminal with the same four environment variables:

```powershell
npm.cmd run bootstrap:dev-test-accounts
```

The explicit command refuses to run if a different Super Admin already exists, if any reserved ID/phone belongs to another record, or if the development gates above are absent. It can re-run only while the reserved accounts still use `DEVELOPMENT_TEST_PASSWORD`; it deliberately never resets a password. After a role completes first-login password change, use that client account for manual testing rather than re-running the bootstrap.

Reserved `DEV-*` Block Farm/Field IDs and fixed development user IDs are accepted only through this gated non-production bootstrap request. Ordinary Web/Mobile creation remains server-generated and cannot submit a canonical ID.

| Role | User ID | Phone | Scope created |
| --- | --- | --- | --- |
| Super Admin | `01000001` | `09170000001` | System-wide |
| SRA Admin | `02000001` | `09170000002` | `block_farms/DEV-BF-001` |
| Farm Manager | `03000001` | `09170000003` | Manager of `block_farms/DEV-BF-001` |
| Farm Member | `04000001` | `09170000004` | `fields/DEV-FLD-001` |

The sole Block Farm is `DEV-BF-001`; the sole Field is `DEV-FLD-001`. No operation logs, prices, analytics, audit reports, tickets, or other sample records are created. The persisted canonical links are `block_farms.managerUserId`, `fields.blockFarmId`, and `fields.memberUserId`; the account-creation request's Block Farm value is validation input only and is not duplicated on the user document.

## OTP and first login

Sign in on web or mobile with a listed ID and the password set in `DEVELOPMENT_TEST_PASSWORD`.

- The initial Super Admin is already phone-verified and does not require a password change, so it can administer the initial hierarchy.
- The other three accounts deliberately enter the normal first-login flow: request phone verification, read the OTP only from the backend terminal, verify it, then set a new password.
- A console delivery line looks like `[HUGPONG DEV SMS] provider=console destination=09*******02 otp=<six-digit-code> purpose=first-login`. The real destination is masked. The generated OTP is never included in a web/mobile API response.
- The code expires after five minutes, a resend inside one minute is rejected, five bad attempts invalidate it, and a verified/consumed code cannot be used again.

After a successful login, verify that closing and reopening the client restores the authenticated local/Firebase session without a local password comparison. Logging out must clear that local session; protected routes must reject an unauthenticated request.

## RBAC checks

- Super Admin: login succeeds and the complete user directory is available.
- SRA Admin: login succeeds and `DEV-BF-001` is accessible; an attempted Super-Admin-only ticket mutation is denied.
- Farm Manager: login succeeds and sees `DEV-FLD-001`; creating a field under an unassigned Block Farm is denied by the backend.
- Farm Member: login succeeds and lists only `DEV-FLD-001`; the user-directory endpoint is denied.
- For each role, also try an incorrect password and a nonexistent ID: both must be rejected.

The bootstrap command performs the API checks above automatically after it creates/reuses the topology. It does not replace client-level first-login, Firebase session restoration, or OTP entry testing; perform those interactions in each client after the command succeeds.

## Remove access after testing

Do not use this command outside a disposable development Firestore project. Disable or archive the development accounts through the normal server-admin workflow when testing ends, remove the development environment variables, and do not deploy `SMS_PROVIDER=console`.
