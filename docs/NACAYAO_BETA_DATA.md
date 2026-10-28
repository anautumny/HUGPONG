# NACAYAO beta data

The server maintenance CLI prepares one removable batch, `NACAYAO-BETA-2026-01`.
It is an operator command; neither client can invoke it.

## Database / schema

Initialization keeps the existing NACAYAO SMALL FARMERS ASSOCIATION record and
its declared 30.11 hectares, removes the other block farms, and unassigns NACAYAO's
old manager. It removes existing Farm Manager and Farm Member accounts, fields,
cycles, operations, and their reports/compilations and dependent account artifacts.
Related support tickets and notification states are removed; unrelated tickets,
immutable audit history, previous recovery metadata and backup history remain.

All SRA Admins and Super Admins are protected. Matt Daniel Delotavo (`01848867`)
and John Benedict Miranda (`02136633`) must both be present before planning can
proceed. Their account, credential, phone-identifier and existing Firebase identity
contents are checked after execution. All real `sra_prices` documents are retained
and checked for unchanged contents and count.

The five beta members each receive a field and an active `2026-2027` crop cycle
(the CLI derives the annual range from its execution date in Asia/Manila):

| Member | Area (ha) | Current stage | Sample operations |
| --- | ---: | --- | ---: |
| Ramon Garcia Mendoza | 1.00 | Land Preparation | 2 |
| Elena Cruz Villanueva | 1.25 | Planting | 4 |
| Jose Luis Navarro | 1.50 | Basal | 6 |
| Marites Ramos Bautista | 1.75 | Weeding | 8 |
| Roberto Diaz Castillo | 2.00 | Top-Dress | 10 |

The total is 7.5 hectares and 30 submitted operations, using the existing SRA
catalogue and normal validated operation records. Each sample operation has two
workers, one day each, at PHP 500 per worker, totaling PHP 1,000. These are test
expenses; they do not change published sugar/molasses prices. Operations use dates
from execution day back to four days earlier. There are no fabricated photographs,
certified reports or harvest yields. The fifth member can advance to Harvest
through the normal workflow during testing.

Fixtures carry `isBetaData: true` and `betaBatchId`. The private
`system_metadata/beta-nacayao-2026-01` manifest records issued User IDs and Field IDs.
There is no index or rules migration; existing API queries read the same records.
Random mock PH-format phones are recorded in `server/domain/betaPhones.js` and have normal unique
phone-identifier records. These fictional profile values may coincide with real
numbers; they are not verified contacts. The server SMS gateway checks the current
phone owner and rejects delivery while it belongs to a beta fixture. Removing the
fixture and its phone identifier releases that number for normal registration and
recovery without a server restart. Lookup failures stop delivery. Use the issued User IDs and passwords for testing;
SMS verification/recovery is not a beta-fixture test scenario.

## Server / API

Commands run from the repository root:

```powershell
# Read-only initial plan.
npm --prefix server run beta:nacayao:plan

# Initialize once, with an exact project check and verified recovery backup.
npm --prefix server run beta:nacayao:initialize -- --project=hugpong-production

# At the end of testing, review the removal scope.
npm --prefix server run beta:nacayao:remove:plan

# Remove the beta batch while keeping later real accounts and fields.
npm --prefix server run beta:nacayao:remove -- --project=hugpong-production
```

Initialization is recorded permanently. Running it again does not reset or reseed
the database. The first execution performs all Firestore deletions and fixture
creation in one transaction, including protected-data and concurrency checks.
Plans above the atomic write limit and records with nested subcollections are
rejected before database changes.

Firebase authentication cleanup follows the committed database transaction.
Removed users immediately fail the normal API account lookup. A pending UID list
allows the same command to finish Firebase cleanup after a transient error without
repeating the reset. Existing absent Firebase users are handled normally. Later
removal is also repeatable and never reinitializes beta data.

Removal follows batch User IDs and Field IDs, including later cycles, operations,
reports, tickets, notification state, credentials, identifiers, sessions and
recovery records. Operations created by the real manager on beta fields are test
data too. Removal stops for a beta field transferred to a real owner or a report
mixing beta and real field/operation sources. Review those records before retrying.
Keep real activity on separately enrolled real fields, and do not repurpose a beta
member account as a real person's account.

Restart/redeploy the API with this revision before testing to load the placeholder
phone SMS guard and clear any in-memory authentication/assignment/read caches.
This CLI changes the configured database directly; it does not deploy a server or
client build.

### Optional beta Farm Manager

The operator can add **Miguel Santos Reyes** with the requested real phone number
without an OTP, using the existing account schema and normal password hashing:

```powershell
npm --prefix server run beta:nacayao:add-manager -- --phone=09293794717
npm --prefix server run beta:nacayao:add-manager -- --phone=09293794717 --execute --project=hugpong-production
```

The account is ACTIVE, phone verification is waived explicitly for this beta
account, and there is no first-login password-change gate. Both Web and Mobile use
the standard Farm Manager login, role claims and NACAYAO assignment. No global
verification policy or client login behavior changes. The password and issued User
ID are saved in a new private `manager-credentials.json` beside the recovery backup.
Creating the account and assigning the farm happen in one transaction. An existing
phone owner or farm manager is never replaced.

The manager joins the same removable beta batch. End-of-beta removal clears the
farm's manager reference if it still points to that beta account, and preserves a
later real manager assignment. The beta phone identifier and credentials are also
removed. Repeating the add-manager command reports the existing account and its
credential file without changing its password.

Names use fictional full names at the user's request. To apply those names and
the random mock member phone values to an existing initialized beta batch, use
`node server/scripts/updateNacayaoBetaProfiles.js --execute --project=hugpong-production`.
It preserves User IDs, passwords, manager phone `09293794717` and farm data,
replaces the members' unique phone identifiers atomically, and refreshes the private
credential handouts. Both clients display these server-owned profile fields.

## Web implementation / verification

The six beta accounts share the user-requested password `Test1234`. Change only
this active beta batch with
`node server/scripts/setNacayaoBetaPasswords.js --password=Test1234 --execute --project=hugpong-production`.
The script uses the normal salted password hashes, retains verified-phone state,
disables the first-login password-change prompt and revokes previous API sessions.
It updates private login handouts and verifies the normal login handler for the
manager on Web/Mobile and all five members on Mobile. Administrators, agricultural
data and prices are preserved. No schema or client-login changes are needed.

The existing Web client reads the cleaned authoritative API data. No mock session,
client mutation shortcut or Web-only data source is added. Members retain their
existing mobile-only role restriction. The SRA account can see the five members,
fields, operations and retained price history. The Super Admin retains its normal
governance access.

After the server restarts, sign out/in or reload the Web console. Create the real
Farm Manager using the existing account workflow and assign that account to the
existing NACAYAO block farm. Do not create a duplicate NACAYAO record.

## Mobile implementation / verification

Use each issued beta User ID and its individual password on the normal mobile
login screen. The existing API returns the member's own field and operations;
other members' fields remain outside that member's scope. SRA Mobile uses the same
cleaned database. The real manager can use the same canonical NACAYAO assignment
on Web and Mobile once created.

On devices with old test data, use **Profile > Clear Local Cache**, then reconnect
and sign in to refresh. Finish or discard old-account drafts before switching
accounts; do not replay them into a real account. No phone reset or OTP is needed
for these fixtures. Enrollment of the later real member uses the normal account
and field workflow on the same NACAYAO farm.

## Private credentials and recovery

Each execution creates a unique directory under `output/private-beta/` (ignored
by Git). A successful initialization contains:

- `beta-credentials.json`: the five issued User IDs, individual random passwords,
  Field IDs, areas and stages. Share only the relevant member's credentials.
- `result.json`: verified final counts and the exact backup location.
- `recovery.hpbeta`: AES-256-GCM encrypted, gzip-compressed recovery payload.
- `recovery.key`: encryption key. Keep a separate protected copy of it and the
  archive before moving or deleting the local files.

The archive is read back and authenticated before any writes. It includes the
original top-level Firestore documents, including credentials/identifiers, Firebase
Auth exports, the planned change summary, and proposed fixture records. This is a
maintenance-specific archive, not the normal UI `.hpbak` format. Recovery requires
an operator to decrypt with `recovery.key`, decode Firestore typed values with
`backupService._test.decodeValue`, and review/reconcile the exact affected records.
Do not restore server sessions/OTP challenges or blindly overwrite subsequent real
data. Firebase custom-token identities can be recreated at the normal next login
once the original application account and its credential have been restored.

Run `node --test server/tests/nacayao-beta-data.test.js` for the behavioral
maintenance tests. The full server suite also covers Web/Mobile authorization,
normal account provisioning, operation workflows, and price handling.
