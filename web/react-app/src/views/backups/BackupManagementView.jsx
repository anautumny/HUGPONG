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

function formatTimestamp(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function statusClass(status) {
  if (['READY', 'SUCCESS', 'VALIDATED'].includes(status)) return 'bg-success-bg text-success border-success/30';
  if (status === 'FAILED') return 'bg-danger-bg text-danger border-danger/30';
  return 'bg-surface-subtle text-hug-muted border-border';
}

export default function BackupManagementView() {
  const [status, setStatus] = useState({ data: [], overdue: true, lastSuccessfulExport: null, policy: null });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [notice, setNotice] = useState(null);
  const [exportForm, setExportForm] = useState({ currentPassword: '', backupPassphrase: '', confirmPassphrase: '' });
  const [creating, setCreating] = useState(false);
  const [file, setFile] = useState(null);
  const [restoreForm, setRestoreForm] = useState({ currentPassword: '', backupPassphrase: '', confirmation: '' });
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

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const response = await fetchBackupStatus();
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
    if (exportForm.backupPassphrase !== exportForm.confirmPassphrase) {
      setNotice({ type: 'error', text: 'The backup passphrases do not match.' });
      return;
    }
    setCreating(true);
    try {
      const response = await createEncryptedBackup(exportForm);
      setNotice({
        type: 'success',
        text: `Encrypted backup downloaded successfully. Store its passphrase separately. Reference ID: ${response.backupId}`
      });
      setExportForm({ currentPassword: '', backupPassphrase: '', confirmPassphrase: '' });
      await refreshStatus();
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setCreating(false);
    }
  };

  const selectFile = event => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setArchiveBase64('');
    setValidation(null);
    setRestoreForm(prev => ({ ...prev, confirmation: '' }));
  };

  const runValidation = async event => {
    event.preventDefault();
    setNotice(null);
    setValidating(true);
    try {
      const encoded = await readBackupFile(file);
      const response = await validateBackup({ archiveBase64: encoded, ...restoreForm });
      setArchiveBase64(encoded);
      setValidation(response);
      setNotice({
        type: 'success',
        text: `Backup verified. ${response.plan.missingCount} missing records can be recovered without changing existing records.`
      });
      await refreshStatus();
    } catch (error) {
      setArchiveBase64('');
      setValidation(null);
      setNotice({ type: 'error', text: error.message });
    } finally {
      setValidating(false);
    }
  };

  const recoverMissing = async () => {
    setNotice(null);
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
      setNotice({ type: 'error', text: error.message });
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
        <button type="button" onClick={refreshStatus} disabled={loadingStatus} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-bold text-hug-text hover:bg-surface-subtle disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loadingStatus ? 'animate-spin' : ''}`} /> Refresh status
        </button>
      </div>

      {notice && (
        <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold ${notice.type === 'success' ? 'border-success/30 bg-success-bg/50 text-success' : 'border-danger/30 bg-danger-bg/40 text-danger'}`}>
          {notice.type === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />}
          <p>{notice.text}</p>
        </div>
      )}

      <section className={`rounded-2xl border p-5 ${status.overdue ? 'border-warning/40 bg-warning-bg/30' : 'border-success/30 bg-success-bg/30'}`}>
        <div className="flex items-start gap-3">
          <Clock3 className={`mt-0.5 h-5 w-5 ${status.overdue ? 'text-warning' : 'text-success'}`} />
          <div>
            <h2 className="font-bold text-hug-text">{status.overdue ? 'A current backup is needed' : 'Manual backup is current'}</h2>
            <p className="mt-1 text-sm text-hug-muted">
              {status.lastSuccessfulExport
                ? `Last successful export: ${formatTimestamp(status.lastSuccessfulExport.completedAt)}`
                : 'No successful encrypted backup has been recorded.'}
              {' '}Create a backup at least every seven days and before significant deployments or data changes.
            </p>
          </div>
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
              <input type="password" value={exportForm.currentPassword} onChange={event => setExportForm(prev => ({ ...prev, currentPassword: event.target.value }))} autoComplete="current-password" required maxLength={256} className="mt-1.5 w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-hug-text outline-none focus:border-primary dark:bg-[#121820]" />
            </label>
            <label className="block text-sm font-semibold text-hug-text">Backup passphrase
              <input type="password" value={exportForm.backupPassphrase} onChange={event => setExportForm(prev => ({ ...prev, backupPassphrase: event.target.value }))} autoComplete="new-password" required minLength={16} maxLength={128} className="mt-1.5 w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-hug-text outline-none focus:border-primary dark:bg-[#121820]" />
              <span className="mt-1 block text-xs font-normal text-hug-muted">Use 16+ characters with uppercase, lowercase, number, and symbol. Do not reuse your login password.</span>
            </label>
            <label className="block text-sm font-semibold text-hug-text">Confirm backup passphrase
              <input type="password" value={exportForm.confirmPassphrase} onChange={event => setExportForm(prev => ({ ...prev, confirmPassphrase: event.target.value }))} autoComplete="new-password" required minLength={16} maxLength={128} className="mt-1.5 w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-hug-text outline-none focus:border-primary dark:bg-[#121820]" />
            </label>
            <button type="submit" disabled={creating} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-50">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {creating ? 'Creating encrypted backup…' : 'Create and download backup'}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-warning-bg p-2.5 text-warning"><Upload className="h-5 w-5" /></div>
            <div><h2 className="font-black text-hug-text">Validate and recover</h2><p className="text-xs text-hug-muted">Dry-run validation is mandatory and expires after ten minutes.</p></div>
          </div>
          <form className="mt-5 space-y-4" onSubmit={runValidation}>
            <label className="block text-sm font-semibold text-hug-text">Encrypted HUGPONG backup
              <input id="backup-file" type="file" accept=".hpbak,application/vnd.hugpong.backup" onChange={selectFile} required className="mt-1.5 block w-full rounded-xl border border-border bg-surface-subtle px-3 py-2.5 text-sm text-hug-text file:mr-3 file:rounded-lg file:border-0 file:bg-primary-bg file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-primary" />
            </label>
            <label className="block text-sm font-semibold text-hug-text">Current account password
              <input type="password" value={restoreForm.currentPassword} onChange={event => { setRestoreForm(prev => ({ ...prev, currentPassword: event.target.value })); setValidation(null); }} autoComplete="current-password" required maxLength={256} className="mt-1.5 w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-hug-text outline-none focus:border-primary dark:bg-[#121820]" />
            </label>
            <label className="block text-sm font-semibold text-hug-text">Backup passphrase
              <input type="password" value={restoreForm.backupPassphrase} onChange={event => { setRestoreForm(prev => ({ ...prev, backupPassphrase: event.target.value })); setValidation(null); }} autoComplete="off" required minLength={16} maxLength={128} className="mt-1.5 w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-hug-text outline-none focus:border-primary dark:bg-[#121820]" />
            </label>
            <button type="submit" disabled={validating || !file} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary-bg px-4 py-3 text-sm font-bold text-primary hover:bg-primary/15 disabled:opacity-50">
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {validating ? 'Validating backup…' : 'Run safe validation'}
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
              <label className="mt-4 block text-sm font-semibold text-hug-text">Type {RESTORE_CONFIRMATION}
                <input type="text" value={restoreForm.confirmation} onChange={event => setRestoreForm(prev => ({ ...prev, confirmation: event.target.value }))} autoComplete="off" className="mt-1.5 w-full rounded-xl border border-warning/40 bg-white px-3.5 py-2.5 font-mono text-sm text-hug-text outline-none focus:border-warning dark:bg-[#121820]" />
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
      </section>
    </div>
  );
}
