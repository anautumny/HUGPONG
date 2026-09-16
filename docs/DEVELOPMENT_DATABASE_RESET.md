# Controlled Development Firestore Reset

The HUGPONG Firestore development/test records are disposable. Resetting them is a deliberate administrative operation and never runs during server or client startup.

## Safety boundary

The reset command:

- refuses `NODE_ENV=production`;
- requires an explicit enable flag and confirmation phrase;
- requires the expected Firebase project ID to exactly match the Admin SDK project;
- inventories every Firestore top-level collection, including obsolete/unknown legacy collections;
- recursively deletes their documents and verifies Firestore is empty;
- does not call Firebase Authentication deletion APIs;
- does not change Firebase web/Android/iOS application registrations or Firebase configuration;
- does not bootstrap users or sample domain data.

## Plan and execute

Set the gates only for the terminal running the reset:

```powershell
$env:ALLOW_DEVELOPMENT_DATABASE_RESET = 'true'
$env:DEVELOPMENT_DATABASE_RESET_CONFIRM = 'RESET_HUGPONG_DEVELOPMENT_DATA'
$env:HUGPONG_EXPECTED_FIREBASE_PROJECT_ID = 'hugpong-ff'
```

Inventory without deleting:

```powershell
cd server
npm.cmd run reset:dev-firestore:plan
```

After confirming the printed project ID and counts:

```powershell
npm.cmd run reset:dev-firestore
```

Run the plan command again to independently verify `Firestore is already empty.` Disable or unset the reset gate afterward.

## Client cache epoch

The reset introduced new web and mobile cache-schema epochs. On first launch after deployment:

- mobile removes prior HUGPONG replicas, sessions, drafts, notification state, and the mutation outbox before initializing synchronization;
- web removes the prior database replica and authenticated-session keys before creating an empty canonical cache;
- language and onboarding choices remain local installation preferences;
- realtime Firestore listeners populate the empty replica without creating mutations.

This prevents an old installation from treating pre-reset cached records as current state or replaying a pre-reset outbox.

## Explicit bootstrap

An empty Firestore database remains empty until an administrator explicitly runs the existing development bootstrap. The normal server startup never calls it.

```powershell
$env:ALLOW_DEVELOPMENT_TEST_ACCOUNTS = 'true'
$env:DEVELOPMENT_TEST_PASSWORD = '<choose-your-own-password>'
$env:SMS_PROVIDER = 'console'
npm.cmd run bootstrap:dev-test-accounts
```

That separate command creates only the four development role accounts and the minimum Block Farm/Field topology documented in `DEVELOPMENT_AUTH_RBAC_TESTING.md`. It does not create operations, prices, analytics, audit reports, tickets, or unrelated demonstration data.

## Reset execution record

On 2026-09-17, the controlled reset was executed against Firebase project `hugpong-ff` after the dry-run project check succeeded.

| Collection | Top-level documents removed |
| --- | ---: |
| `audit_logs` | 78 |
| `audit_reports` | 4 |
| `block_farms` | 2 |
| `crop_cycles` | 1 |
| `fields` | 2 |
| `operation_logs` | 20 |
| `sra_prices` | 4 |
| `terminal_diagnostics` | 3 |
| `user_credentials` | 4 |
| `users` | 8 |
| **Total** | **126** |

Recursive deletion also covered any nested subcollections. Independent inventories immediately after the reset and after an empty-state backend startup both reported that Firestore contained no documents. The development bootstrap was deliberately not run. Firebase Authentication users and Firebase application registrations remained outside the reset.
