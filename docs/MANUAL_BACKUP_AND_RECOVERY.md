# HUGPONG Manual Backup and Recovery

## Scope

HUGPONG provides a no-Blaze logical backup workflow for the Super Admin web
interface. It is a budget-conscious safeguard, not a replacement for Firestore
native scheduled backups or point-in-time recovery.

The Web client may request an operation and download an encrypted result. The
Express backend remains the sole Firestore authority. Mobile has no backup
route, screen, credential, or restore capability.

## Export workflow

1. A Super Admin opens **Backup & Recovery** and supplies the current account
   password plus a separate backup passphrase.
2. The backend re-authorizes the live account and applies a persistent rate
   limit.
3. The backend reads only the allowlisted business collections: `users`,
   `block_farms`, `fields`, `crop_cycles`, `operation_logs`, `audit_reports`,
   `audit_logs`, `sra_prices`, and `support_tickets`.
4. The backend creates a manifest with the schema version, timestamp, Firebase
   project ID, collection counts, document count, and SHA-256 integrity digest.
5. The manifest and records are compressed in memory and encrypted using
   AES-256-GCM. The encryption key is derived from the passphrase with scrypt
   and a random salt; every archive also uses a random IV.
6. The encrypted `.hpbak` file is returned once to the browser for download.
   Neither the archive nor its passphrase is stored in Firestore.
7. Metadata is written to `backup_operations`, and `BACKUP_EXPORTED` is written
   to the separate Audit Ledger.

The passphrase cannot be recovered by HUGPONG. Keep it separately from the
archive. A backup stored only on the HUGPONG server is not disaster recovery;
keep an encrypted copy on an external device or another protected location.

## Exclusions

The logical archive deliberately excludes `user_credentials`,
`account_identifiers`, `server_sessions`, `security_rate_limits`,
`password_recovery_challenges`, `terminal_diagnostics`, `diagnostic_events`, and
`backup_operations`. It also excludes environment files, service-account keys,
API keys, tokens, and private server logs.

Because authentication secrets are excluded, this workflow protects business
records rather than serving as a complete Firebase Authentication disaster
snapshot. Accounts whose credential records are also lost require controlled
credential recovery or reprovisioning.

## Validation and recovery

1. Select the `.hpbak` file and enter its passphrase plus the current Super
   Admin password.
2. The backend verifies the envelope, encryption authentication tag, project
   identity, supported schema, collection allowlist, unique document IDs,
   document count, size limits, and manifest checksum.
3. The backend compares the archive with the live database and returns a dry-run
   plan showing missing and already-existing documents. The validation receipt
   is actor-bound and expires after ten minutes.
4. To proceed, type `RECOVER MISSING RECORDS` exactly.
5. The backend re-verifies the archive and validation receipt, then uses
   create-only Firestore writes. Missing documents are recreated; existing
   documents are skipped without modification.
6. The result is written to `backup_operations` and the Audit Ledger.

This workflow never performs a full rollback. It cannot overwrite corrupt
current documents or delete documents created after the backup. Those actions
require a separately reviewed maintenance procedure or Firestore managed
restore when available.

## Operational policy

- Create an archive at least every seven days and before releases, migrations,
  resets, or large administrative changes.
- Keep the latest seven usable archives and at least one copy outside the
  computer hosting HUGPONG.
- Test validation regularly. Test recovery only against disposable data or an
  approved emergency scenario.
- Never place `.hpbak` archives or passphrases in Git, source code, screenshots,
  chat messages, diagnostic exports, or ordinary support tickets.
- If a backup or validation operation fails, use its reference ID in the Super
  Admin Diagnostics Console. Technical details remain in restricted logs.

## Limits

- Maximum 10,000 documents per archive.
- Maximum encrypted archive size: 8 MB.
- Maximum uncompressed logical payload: 24 MB.
- The operation consumes Firestore reads and therefore counts toward the Spark
  plan's free daily quota.
- Backup generation and recovery require the HUGPONG backend and Firestore to be
  available.
