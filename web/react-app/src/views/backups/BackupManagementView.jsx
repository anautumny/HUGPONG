import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DatabaseBackup,
  Download,
  FileKey2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload
} from 'lucide-react';
import {
  createEncryptedBackup,
  fetchBackupStatus,
  readBackupFile,
  restoreMissingBackupRecords,
  validateBackup
} from '../../services/backupService';
import { PaginationFooter } from '../../components/ui/Table';

const RESTORE_CONFIRMATION = 'RECOVER MISSING RECORDS';
const ACTIVITY_PAGE_SIZE = 10;
const EMPTY_EXPORT_ERRORS = Object.freeze({});
const EMPTY_RESTORE_ERRORS = Object.freeze({});

function fieldClass(hasError, accent = 'primary') {
  const focusClass = accent === 'warning' ? 'focus:border-warning' : 'focus:border-primary';
  return `mt-1.5 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-hug-text outline-none dark:bg-[#121820] ${hasError ? 'border-danger focus:border-danger' : `border-border ${focusClass}`}`;
}

function exportErrorFor(error) {
  if (error?.code === 'INVALID_CURRENT_PASSWORD') return { currentPassword: 'Your current account password is incorrect.' };
  if (['BACKUP_PASSPHRASE_WEAK', 'BACKUP_PASSPHRASE_REUSED'].includes(error?.code)) return { backupPassphrase: error.message };
  return { form: error?.message || 'The encrypted backup could not be created.' };
}

function restoreErrorFor(error) {
  if (error?.code === 'INVALID_CURRENT_PASSWORD') return { currentPassword: 'Your current account password is incorrect.' };
  if (['BACKUP_PASSPHRASE_WEAK', 'BACKUP_PASSPHRASE_REUSED', 'BACKUP_DECRYPTION_FAILED'].includes(error?.code)) {
    return { backupPassphrase: error.message };
  }
  if (['BACKUP_FILE_REQUIRED', 'BACKUP_FILE_EXTENSION', 'BACKUP_FILE_SIZE', 'BACKUP_ARCHIVE_INVALID', 'BACKUP_FORMAT_UNSUPPORTED', 'BACKUP_SCHEMA_UNSUPPORTED', 'BACKUP_PROJECT_MISMATCH', 'BACKUP_INTEGRITY_FAILED', 'BACKUP_EXPORT_REFERENCE_INVALID'].includes(error?.code)) {
    return { file: error.message };
  }
  if (error?.code === 'BACKUP_CONFIRMATION_REQUIRED') return { confirmation: error.message };
  return { form: error?.message || 'The backup could not be validated.' };
}

function formatTimestamp(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function statusClass(status) {
  if (['READY', 'VERIFIED', 'SUCCESS', 'VALIDATED', 'USED'].includes(status)) return 'bg-success-bg text-success border-success/30';
  if (status === 'FAILED') return 'bg-danger-bg text-danger border-danger/30';
  return 'bg-surface-subtle text-hug-muted border-border';
}

export default function BackupManagementView() {
  const [status, setStatus] = useState({
    data: [], overdue: true, exportOverdue: true, drillOverdue: true,
    lastSuccessfulExport: null, lastRecoveryDrill: null, policy: null
  });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [notice, setNotice] = useState(null);
  const [exportForm, setExportForm] = useState({ currentPassword: '', backupPassphrase: '', confirmPassphrase: '' });
  const [exportErrors, setExportErrors] = useState(EMPTY_EXPORT_ERRORS);
  const [creating, setCreating] = useState(false);
  const [file, setFile] = useState(null);
  const [restoreForm, setRestoreForm] = useState({ currentPassword: '', backupPassphrase: '', confirmation: '' });
  const [restoreErrors, setRestoreErrors] = useState(EMPTY_RESTORE_ERRORS);
  const [validation, setValidation] = useState(null);
  const [archiveBase64, setArchiveBase64] = useState('');
  const [validating, setValidating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const activityTotalPages = Math.max(1, Math.ceil(status.data.length / ACTIVITY_PAGE_SIZE));
  const validActivityPage = Math.min(activityPage, activityTotalPages);
  const pagedActivity = useMemo(() => {
    const start = (validActivityPage - 1) * ACTIVITY_PAGE_SIZE;
    return status.data.slice(start, start + ACTIVITY_PAGE_SIZE);
  }, [status.data, validActivityPage]);

  const refreshStatus = useCallback(async ({ force = false } = {}) => {
    setLoadingStatus(true);
    try {
      const response = await fetchBackupStatus({ force });
      setStatus(response);
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  const createBackup = async event => {
    event.preventDefault();
    setNotice(null);
    setExportErrors(EMPTY_EXPORT_ERRORS);
    if (exportForm.backupPassphrase !== exportForm.confirmPassphrase) {
      setExportErrors({ confirmPassphrase: 'The two backup passphrases do not match.' });
      return;
    }
    setCreating(true);
    try {
      const response = await createEncryptedBackup(exportForm);
      setNotice({
        type: 'success',
        text: `Encrypted backup downloaded. Save two separate copies and store its passphrase separately. Reference ID: ${response.backupId}. SHA-256: ${response.metadata?.archiveSha256 || 'available in activity history'}`
      });
      setExportForm({ currentPassword: '', backupPassphrase: '', confirmPassphrase: '' });
      await refreshStatus();
    } catch (error) {
      setExportErrors(exportErrorFor(error));
    } finally {
      setCreating(false);
    }
  };

  const selectFile = event => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setArchiveBase64('');
    setValidation(null);
    setRestoreErrors(EMPTY_RESTORE_ERRORS);
    setRestoreForm(prev => ({ ...prev, confirmation: '' }));
  };

  const runValidation = async event => {
    event.preventDefault();
    setNotice(null);
    setRestoreErrors(EMPTY_RESTORE_ERRORS);
    setValidating(true);
    try {
      const encoded = await readBackupFile(file);
      const response = await validateBackup({ archiveBase64: encoded, ...restoreForm });
      setArchiveBase64(encoded);
      setValidation(response);
      setNotice({
        type: 'success',
        text: `Recovery drill passed. The downloaded archive is authentic and readable. ${response.plan.missingCount} missing records can be recovered without changing existing records.`
      });
      await refreshStatus();
    } catch (error) {
      setArchiveBase64('');
      setValidation(null);
      setRestoreErrors(restoreErrorFor(error));
    } finally {
      setValidating(false);
    }
  };

  const recoverMissing = async () => {
    setNotice(null);
    setRestoreErrors(EMPTY_RESTORE_ERRORS);
    setRestoring(true);
    try {
      const response = await restoreMissingBackupRecords({
        archiveBase64,
        ...restoreForm,
        validationId: validation.validationId
      });
      setNotice({
        type: 'success',
        text: `${response.result.restoredCount} missing records recovered; ${response.result.skippedExistingCount} existing records preserved. Reference ID: ${response.restoreId}`
      });
      setValidation(null);
      setArchiveBase64('');
      setFile(null);
      setRestoreForm({ currentPassword: '', backupPassphrase: '', confirmation: '' });
      const input = document.getElementById('backup-file');
      if (input) input.value = '';
      await refreshStatus();
    } catch (error) {
      setRestoreErrors(restoreErrorFor(error));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary dark:text-primary-light">Disaster Recovery</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-hug-text sm:text-3xl">Manual Backup & Recovery</h1>
          <p className="mt-1 max-w-3xl text-sm text-hug-muted">
            Create encrypted business-data archives and recover only records that are missing. Existing live records are never overwritten or deleted.
          </p>
        </div>
        <button type="button" onClick={() => void refreshStatus({ force: true })} disabled={loadingStatus} aria-busy={loadingStatus} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-bold text-hug-text hover:bg-surface-subtle disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loadingStatus ? 'animate-spin' : ''}`} aria-hidden="true" /> {loadingStatus ? 'Refreshing…' : 'Refresh status'}
        </button>
      </div>

      {notice && (
        <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold ${notice.type === 'success' ? 'border-success/30 bg-success-bg/50 text-success' : 'border-danger/30 bg-danger-bg/40 text-danger'}`}>
          {notice.type === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />}
          <p>{notice.text}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className={`rounded-2xl border p-5 ${status.exportOverdue ? 'border-warning/40 bg-warning-bg/30' : 'border-success/30 bg-success-bg/30'}`}>
          <div className="flex items-start gap-3">
            <Clock3 className={`mt-0.5 h-5 w-5 ${status.exportOverdue ? 'text-warning' : 'text-success'}`} />
            <div>
              <h2 className="font-bold text-hug-text">{status.exportOverdue ? 'Daily backup is due' : 'Daily backup is current'}</h2>
              <p className="mt-1 text-sm text-hug-muted">
                {status.lastSuccessfulExport
                  ? `Last successful export: ${formatTimestamp(status.lastSuccessfulExport.completedAt)}`
                  : 'No successful encrypted backup has been recorded.'}
                {' '}Create one every 24 hours and before significant deployments or data changes.
              </p>
              {status.nextExportDueAt && !status.exportOverdue ? <p className="mt-2 text-xs font-semibold text-hug-muted">Next due: {formatTimestamp(status.nextExportDueAt)}</p> : null}
            </div>
          </div>
        </section>

        <section className={`rounded-2xl border p-5 ${status.drillOverdue ? 'border-warning/40 bg-warning-bg/30' : 'border-success/30 bg-success-bg/30'}`}>
          <div className="flex items-start gap-3">
            <ShieldCheck className={`mt-0.5 h-5 w-5 ${status.drillOverdue ? 'text-warning' : 'text-success'}`} />
            <div>
              <h2 className="font-bold text-hug-text">{status.drillOverdue ? 'Recovery drill is due' : 'Recovery drill is current'}</h2>
              <p className="mt-1 text-sm text-hug-muted">
                {status.lastRecoveryDrill
                  ? `Last verified archive: ${formatTimestamp(status.lastRecoveryDrill.completedAt)}`
                  : 'No downloaded backup has completed a recovery validation drill.'}
                {' '}Validate the newest saved file at least every 30 days.
              </p>
              {status.nextDrillDueAt && !status.drillOverdue ? <p className="mt-2 text-xs font-semibold text-hug-muted">Next due: {formatTimestamp(status.nextDrillDueAt)}</p> : null}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-black text-hug-text">Operational backup checklist</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface-subtle p-4"><p className="text-xs font-black uppercase tracking-wide text-primary">1. Export daily</p><p className="mt-2 text-sm text-hug-muted">Download the encrypted <span className="font-mono">.hpbak</span> file after daily operations and before deployments.</p></div>
          <div className="rounded-xl border border-border bg-surface-subtle p-4"><p className="text-xs font-black uppercase tracking-wide text-primary">2. Keep two copies</p><p className="mt-2 text-sm text-hug-muted">Keep copies in two separate places. Store the passphrase separately in a password manager.</p></div>
          <div className="rounded-xl border border-border bg-surface-subtle p-4"><p className="text-xs font-black uppercase tracking-wide text-primary">3. Run a drill</p><p className="mt-2 text-sm text-hug-muted">Select the downloaded file below and validate it. Validation reads and checks the archive without changing live data.</p></div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary-bg p-2.5 text-primary"><DatabaseBackup className="h-5 w-5" /></div>
            <div><h2 className="font-black text-hug-text">Create encrypted backup</h2><p className="text-xs text-hug-muted">The passphrase is never stored by HUGPONG.</p></div>
          </div>
          <form className="mt-5 space-y-4" onSubmit={createBackup}>
            <label className="block text-sm font-semibold text-hug-text">Current account password
              <input id="backup-export-current-password" type="password" value={exportForm.currentPassword} onChange={event => { setExportForm(prev => ({ ...prev, currentPassword: event.target.value })); setExportErrors(prev => ({ ...prev, currentPassword: undefined, form: undefined })); }} autoComplete="current-password" required maxLength={256} aria-invalid={Boolean(exportErrors.currentPassword)} aria-describedby={exportErrors.currentPassword ? 'backup-export-current-password-error' : undefined} className={fieldClass(exportErrors.currentPassword)} />
              {exportErrors.currentPassword && <span id="backup-export-current-password-error" className="mt-1 block text-xs font-semibold text-danger">{exportErrors.currentPassword}</span>}
            </label>
            <label className="block text-sm font-semibold text-hug-text">Create a backup passphrase
              <input id="backup-export-passphrase" type="password" value={exportForm.backupPassphrase} onChange={event => { setExportForm(prev => ({ ...prev, backupPassphrase: event.target.value })); setExportErrors(prev => ({ ...prev, backupPassphrase: undefined, form: undefined })); }} autoComplete="new-password" required minLength={16} maxLength={128} aria-invalid={Boolean(exportErrors.backupPassphrase)} aria-describedby={exportErrors.backupPassphrase ? 'backup-export-passphrase-error' : 'backup-export-passphrase-help'} className={fieldClass(exportErrors.backupPassphrase)} />
              {exportErrors.backupPassphrase && <span id="backup-export-passphrase-error" className="mt-1 block text-xs font-semibold text-danger">{exportErrors.backupPassphrase}</span>}
              <span id="backup-export-passphrase-help" className="mt-1 block text-xs font-normal text-hug-muted">This is a password you create, not a 16-digit code. Use at least 16 characters with uppercase, lowercase, a number, and a symbol. Do not reuse your login password.</span>
            </label>
            <label className="block text-sm font-semibold text-hug-text">Confirm backup passphrase
              <input id="backup-export-confirm-passphrase" type="password" value={exportForm.confirmPassphrase} onChange={event => { setExportForm(prev => ({ ...prev, confirmPassphrase: event.target.value })); setExportErrors(prev => ({ ...prev, confirmPassphrase: undefined, form: undefined })); }} autoComplete="new-password" required minLength={16} maxLength={128} aria-invalid={Boolean(exportErrors.confirmPassphrase)} aria-describedby={exportErrors.confirmPassphrase ? 'backup-export-confirm-passphrase-error' : undefined} className={fieldClass(exportErrors.confirmPassphrase)} />
              {exportErrors.confirmPassphrase && <span id="backup-export-confirm-passphrase-error" className="mt-1 block text-xs font-semibold text-danger">{exportErrors.confirmPassphrase}</span>}
            </label>
            {exportErrors.form && <p role="alert" className="rounded-xl border border-danger/30 bg-danger-bg/40 p-3 text-sm font-semibold text-danger">{exportErrors.form}</p>}
            <button type="submit" disabled={creating} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-50">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {creating ? 'Creating encrypted backup…' : 'Create and download backup'}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-warning-bg p-2.5 text-warning"><Upload className="h-5 w-5" /></div>
            <div><h2 className="font-black text-hug-text">Validate and recover</h2><p className="text-xs text-hug-muted">Validation is the safe recovery drill and expires after ten minutes.</p></div>
          </div>
          <form className="mt-5 space-y-4" onSubmit={runValidation}>
            <label className="block text-sm font-semibold text-hug-text">Encrypted HUGPONG backup
              <input id="backup-file" type="file" accept=".hpbak,application/vnd.hugpong.backup" onChange={selectFile} required aria-invalid={Boolean(restoreErrors.file)} aria-describedby={restoreErrors.file ? 'backup-file-error' : undefined} className={`mt-1.5 block w-full rounded-xl border bg-surface-subtle px-3 py-2.5 text-sm text-hug-text file:mr-3 file:rounded-lg file:border-0 file:bg-primary-bg file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-primary ${restoreErrors.file ? 'border-danger' : 'border-border'}`} />
              {restoreErrors.file && <span id="backup-file-error" className="mt-1 block text-xs font-semibold text-danger">{restoreErrors.file}</span>}
            </label>
            <label className="block text-sm font-semibold text-hug-text">Current account password
              <input id="backup-restore-current-password" type="password" value={restoreForm.currentPassword} onChange={event => { setRestoreForm(prev => ({ ...prev, currentPassword: event.target.value })); setValidation(null); setRestoreErrors(prev => ({ ...prev, currentPassword: undefined, form: undefined })); }} autoComplete="current-password" required maxLength={256} aria-invalid={Boolean(restoreErrors.currentPassword)} aria-describedby={restoreErrors.currentPassword ? 'backup-restore-current-password-error' : undefined} className={fieldClass(restoreErrors.currentPassword)} />
              {restoreErrors.currentPassword && <span id="backup-restore-current-password-error" className="mt-1 block text-xs font-semibold text-danger">{restoreErrors.currentPassword}</span>}
            </label>
            <label className="block text-sm font-semibold text-hug-text">Backup passphrase for this file
              <input id="backup-restore-passphrase" type="password" value={restoreForm.backupPassphrase} onChange={event => { setRestoreForm(prev => ({ ...prev, backupPassphrase: event.target.value })); setValidation(null); setRestoreErrors(prev => ({ ...prev, backupPassphrase: undefined, form: undefined })); }} autoComplete="off" required minLength={16} maxLength={128} aria-invalid={Boolean(restoreErrors.backupPassphrase)} aria-describedby={restoreErrors.backupPassphrase ? 'backup-restore-passphrase-error' : 'backup-restore-passphrase-help'} className={fieldClass(restoreErrors.backupPassphrase)} />
              {restoreErrors.backupPassphrase && <span id="backup-restore-passphrase-error" className="mt-1 block text-xs font-semibold text-danger">{restoreErrors.backupPassphrase}</span>}
              <span id="backup-restore-passphrase-help" className="mt-1 block text-xs font-normal text-hug-muted">Enter the separate passphrase that was created when this .hpbak file was downloaded.</span>
            </label>
            {restoreErrors.form && <p role="alert" className="rounded-xl border border-danger/30 bg-danger-bg/40 p-3 text-sm font-semibold text-danger">{restoreErrors.form}</p>}
            <button type="submit" disabled={validating || !file} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary-bg px-4 py-3 text-sm font-bold text-primary hover:bg-primary/15 disabled:opacity-50">
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {validating ? 'Validating backup…' : 'Run recovery drill'}
            </button>
          </form>

          {validation && (
            <div className="mt-5 rounded-2xl border border-warning/30 bg-warning-bg/30 p-4">
              <div className="flex items-center gap-2 font-bold text-hug-text"><FileKey2 className="h-4 w-4 text-warning" /> Recovery plan</div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-hug-muted">Missing</dt><dd className="font-black text-hug-text">{validation.plan.missingCount}</dd></div>
                <div><dt className="text-xs text-hug-muted">Already existing</dt><dd className="font-black text-hug-text">{validation.plan.existingCount}</dd></div>
                <div><dt className="text-xs text-hug-muted">Backup created</dt><dd className="font-semibold text-hug-text">{formatTimestamp(validation.backupCreatedAt)}</dd></div>
                <div><dt className="text-xs text-hug-muted">Validation expires</dt><dd className="font-semibold text-hug-text">{formatTimestamp(validation.expiresAt)}</dd></div>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-hug-muted">Recovery creates missing documents only. It will not overwrite, merge, or delete existing documents.</p>
              <label className="mt-4 block text-sm font-semibold text-hug-text">To prevent an accidental recovery, type <span className="font-mono">{RESTORE_CONFIRMATION}</span> exactly
                <input id="backup-restore-confirmation" type="text" value={restoreForm.confirmation} onChange={event => { const confirmation = event.target.value; setRestoreForm(prev => ({ ...prev, confirmation })); setRestoreErrors(prev => ({ ...prev, confirmation: confirmation && confirmation !== RESTORE_CONFIRMATION ? `Type ${RESTORE_CONFIRMATION} exactly.` : undefined, form: undefined })); }} autoComplete="off" aria-invalid={Boolean(restoreErrors.confirmation)} aria-describedby={restoreErrors.confirmation ? 'backup-restore-confirmation-error' : undefined} className={`${fieldClass(restoreErrors.confirmation, 'warning')} font-mono`} />
                {restoreErrors.confirmation && <span id="backup-restore-confirmation-error" className="mt-1 block text-xs font-semibold text-danger">{restoreErrors.confirmation}</span>}
              </label>
              <button type="button" onClick={recoverMissing} disabled={restoring || validation.plan.missingCount === 0 || restoreForm.confirmation !== RESTORE_CONFIRMATION} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-warning px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {restoring ? 'Recovering missing records…' : 'Recover missing records'}
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-black text-hug-text">Backup activity</h2>
        <p className="mt-1 text-xs text-hug-muted">Metadata only. Backup contents and passphrases are never stored here.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-hug-muted"><tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Operation</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Records</th><th className="px-3 py-2">Reference ID</th></tr></thead>
            <tbody className="divide-y divide-border/70">
              {!loadingStatus && status.data.length === 0 && <tr><td colSpan="5" className="px-3 py-8 text-center text-hug-muted">No backup activity has been recorded.</td></tr>}
              {pagedActivity.map(item => (
                <tr key={item.id}><td className="px-3 py-3 text-hug-muted">{formatTimestamp(item.completedAt || item.createdAt)}</td><td className="px-3 py-3 font-semibold text-hug-text">{item.operation.replaceAll('_', ' ')}</td><td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusClass(item.status)}`}>{item.status}</span></td><td className="px-3 py-3 text-hug-text">{item.result?.restoredCount ?? item.documentCount ?? 0}</td><td className="px-3 py-3 font-mono text-xs text-hug-muted">{item.referenceId}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loadingStatus && status.data.length > 0 && (
          <div className="-mx-5 -mb-5 mt-4 overflow-hidden rounded-b-2xl">
            <PaginationFooter
              currentPage={validActivityPage}
              totalPages={activityTotalPages}
              totalItems={status.data.length}
              onPageChange={setActivityPage}
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface-subtle p-5 text-sm text-hug-muted">
        <h2 className="font-bold text-hug-text">Security scope</h2>
        <p className="mt-2 leading-relaxed">The archive contains business records needed for recovery, including user profiles, farms, fields, crop cycles, operations, audit reports, the Audit Ledger, prices, and support tickets. It excludes password hashes, login identifiers, sessions, throttles, recovery challenges, telemetry, diagnostic logs, and backup metadata. Store the encrypted file separately from its passphrase.</p>
        <p className="mt-2 leading-relaxed">Recovery is intentionally limited to missing records in the same Firebase project. It does not overwrite corrupted records or recreate Firebase Authentication identities and credentials.</p>
      </section>
    </div>
  );
}
