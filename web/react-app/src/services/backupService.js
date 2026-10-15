import { authenticatedRead, authenticatedRequest } from './apiClient';

const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;

function backupFileError(message, code) {
  return Object.assign(new Error(message), { code });
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function announceBackupStatusChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('hugpong:backup-status-changed'));
}

export async function fetchBackupStatus({ force = false } = {}) {
  return authenticatedRead('/api/backups', { force, maxAgeMs: 2 * 60 * 1000 });
}

export async function createEncryptedBackup({ currentPassword, backupPassphrase }) {
  const response = await authenticatedRequest('/api/backups/export', {
    method: 'POST',
    body: { currentPassword, backupPassphrase },
    timeoutMs: 120000
  });
  const bytes = base64ToBytes(response.archiveBase64);
  const blob = new Blob([bytes], { type: 'application/vnd.hugpong.backup' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = response.fileName || 'hugpong-backup.hpbak';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  announceBackupStatusChanged();
  return response;
}

export async function readBackupFile(file) {
  if (!file) throw backupFileError('Select a HUGPONG backup file first.', 'BACKUP_FILE_REQUIRED');
  if (!String(file.name || '').toLowerCase().endsWith('.hpbak')) {
    throw backupFileError('Select a .hpbak HUGPONG backup file.', 'BACKUP_FILE_EXTENSION');
  }
  if (file.size < 1 || file.size > MAX_ARCHIVE_BYTES) {
    throw backupFileError('The backup file is empty or exceeds the 8 MB safety limit.', 'BACKUP_FILE_SIZE');
  }
  return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
}

export async function validateBackup({ archiveBase64, currentPassword, backupPassphrase }) {
  const response = await authenticatedRequest('/api/backups/validate', {
    method: 'POST',
    body: { archiveBase64, currentPassword, backupPassphrase },
    timeoutMs: 120000
  });
  announceBackupStatusChanged();
  return response;
}

export async function restoreMissingBackupRecords({
  archiveBase64,
  currentPassword,
  backupPassphrase,
  validationId,
  confirmation
}) {
  const response = await authenticatedRequest('/api/backups/restore-missing', {
    method: 'POST',
    body: { archiveBase64, currentPassword, backupPassphrase, validationId, confirmation },
    timeoutMs: 120000
  });
  announceBackupStatusChanged();
  return response;
}

export default {
  fetchBackupStatus,
  createEncryptedBackup,
  readBackupFile,
  validateBackup,
  restoreMissingBackupRecords
};
