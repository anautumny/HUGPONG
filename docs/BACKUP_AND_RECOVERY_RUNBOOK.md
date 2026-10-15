# HUGPONG Backup and Recovery Runbook

HUGPONG uses Firestore as the authoritative database. The Super Admin web console creates encrypted `.hpbak` logical archives for business-data recovery. Mobile has no backup controls because Super Admin accounts are web-only; restored canonical records become available to both clients through the server API.

## Daily procedure

1. Sign in to the Web Management Console as Super Admin.
2. Open **Backup & Recovery**.
3. Create and download an encrypted backup after daily operations and before deployments or major data changes.
4. Save two copies in separate locations, such as an external drive and a private cloud drive.
5. Store the backup passphrase separately in a password manager. Do not reuse the account password.
6. Confirm that the activity entry shows `READY` or `VERIFIED` and record its reference ID when handing responsibility to another operator.

## Recovery drill

Run this at least every 30 days and after changing the backup passphrase. The
passphrase is a password chosen by the operator (at least 16 characters), not a
system-issued 16-digit code:

1. Select the newest downloaded `.hpbak` file.
2. Enter the current Super Admin password and the archive passphrase.
3. Select **Run recovery drill**.
4. Confirm that validation succeeds, the archive checksum is accepted, and the recovery plan lists existing and missing records.
5. Do not select **Recover missing records** during a routine drill. Validation itself makes no data changes.

## Missing-record recovery

1. Stop normal data entry and identify which canonical records are missing.
2. Validate the intended archive and review its creation time and recovery plan.
3. Type `RECOVER MISSING RECORDS` only when the plan is correct.
4. Run recovery once, record the restore reference ID, and review the Audit Ledger.
5. Verify affected farms, fields, crop cycles, operations, audits, prices, and tickets on both Web and Mobile.

Recovery creates only missing documents. It never overwrites, merges, or deletes an existing document.

## Scope and limitations

- Archives contain user profiles and agricultural/business records.
- They exclude password hashes, login identifiers, Firebase Authentication identities, sessions, throttles, recovery challenges, diagnostics, telemetry, and backup metadata.
- Archives are bound to the same Firebase project that created them.
- This workflow protects against missing business records, not loss of the entire Firebase project or corruption of an existing document.
- If the original project is lost, recreate authentication and security state through the controlled production bootstrap process. A paid Firestore managed-backup plan is required for provider-managed full-project restore capability.

Never place `.hpbak` files, passphrases, Firebase service-account files, or production `.env` files in the repository.
