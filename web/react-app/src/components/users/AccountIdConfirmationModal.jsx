import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

function displayRole(account = {}) {
  return String(account.canonicalRole || account.role || 'HUGPONG User')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

export default function AccountIdConfirmationModal({ account = null, onAcknowledge }) {
  const [copied, setCopied] = useState(false);
  const accountId = String(account?.accountId || account?.employeeId || account?.id || '').trim();

  useEffect(() => setCopied(false), [accountId]);

  const copyAccountId = async () => {
    if (!accountId) return;
    await navigator.clipboard.writeText(accountId);
    setCopied(true);
  };

  return (
    <Modal
      isOpen={Boolean(account && accountId)}
      title="Account ID Issued"
      subtitle="Show this login ID to the account owner before leaving this screen."
      badge="Account Created"
      icon={CheckCircle2}
      size="sm"
      preventBackdropClose
      preventEscapeClose
      footer={(
        <>
          <Button variant="secondary" onClick={copyAccountId} icon={Copy}>
            {copied ? 'ID Copied' : 'Copy ID'}
          </Button>
          <Button variant="primary" onClick={onAcknowledge}>
            I Have Saved the ID
          </Button>
        </>
      )}
    >
      <div className="rounded-2xl border border-primary/25 bg-primary-bg/60 p-5 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary dark:text-primary-light">
          Permanent Login ID
        </p>
        <p className="mt-2 font-mono text-3xl font-black tracking-[0.18em] text-hug-text" aria-label={`Account ID ${accountId}`}>
          {accountId}
        </p>
        <p className="mt-2 text-xs text-hug-muted">
          This ID is required when signing in to HUGPONG.
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-bg/50 p-4 text-xs">
        <div className="flex items-start justify-between gap-4">
          <dt className="text-hug-muted">Account owner</dt>
          <dd className="text-right font-bold text-hug-text">{account?.displayName || account?.name || 'New account'}</dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="text-hug-muted">Role</dt>
          <dd className="text-right font-bold text-hug-text">{displayRole(account)}</dd>
        </div>
        {account?.phone && (
          <div className="flex items-start justify-between gap-4">
            <dt className="text-hug-muted">Registered mobile</dt>
            <dd className="text-right font-bold text-hug-text">{account.phone}</dd>
          </div>
        )}
      </dl>

      <p className="text-xs leading-relaxed text-hug-muted">
        The account owner should keep this ID in a secure place. The temporary password must be communicated separately and changed on first login when required.
      </p>
    </Modal>
  );
}
