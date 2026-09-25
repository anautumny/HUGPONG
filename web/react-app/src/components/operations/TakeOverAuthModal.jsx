import React, { useState } from 'react';
import { Modal, FormField, PasswordInput, Button } from '../ui';
import { ShieldAlert, Lock } from 'lucide-react';
import { verifySupervisorAuth } from '../../services/operationsService';

export default function TakeOverAuthModal({
  isOpen = false,
  onClose,
  field = null,
  user = {},
  onAuthorized
}) {
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState(null);

  if (!field) return null;

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Account password is required to authorize Manager Takeover.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      // Authenticate with manager credentials
      const authorization = await verifySupervisorAuth({
        password: password.trim(),
        fieldId: field.id
      });

      setIsVerifying(false);
      setPassword('');
      onAuthorized(field, authorization.takeoverGrant, authorization.takeoverGrantExpiresAt);
    } catch (err) {
      console.warn('[TakeOverAuth] Auth note:', err.message);
      // If offline or password check fails
      setError(err.message || 'Invalid password or unauthorized supervisor credentials.');
      setIsVerifying(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="Authorize Manager Takeover"
      subtitle="Enter manager password to supervise this field"
      badge="Supervisor Override"
      icon={Lock}
      preventBackdropClose={isVerifying}
      preventEscapeClose={isVerifying}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isVerifying}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleVerify}
            isLoading={isVerifying}
            loadingText="Verifying password..."
          >
            Authorize Manager Takeover
          </Button>
        </>
      }
    >
      <form onSubmit={handleVerify} className="space-y-4">
        {/* Field Summary Card */}
        <div className="bg-bg dark:bg-[#0C1015] p-3.5 rounded-xl border border-border flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-hug-muted block">
              Target Plot
            </span>
            <span className="text-sm font-mono font-black text-primary">
              {field.id}
            </span>
            <p className="text-xs text-hug-muted mt-0.5">
              Assigned to: <strong>{field.memberName || 'Farm Member'}</strong>
            </p>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            Manager Intervention
          </span>
        </div>

        {/* Security Notice */}
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/50 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            Taking over enables supervisory override. Any operation recorded or stage completed will be stamped with your manager signature in the authoritative SRA audit ledger.
          </p>
        </div>

        {/* Password Input */}
        <FormField
          id="takeover-password-input"
          label="Account Password"
          required
          helperText="Enter your login password to confirm supervisor authorization."
          error={error}
        >
          <PasswordInput
            id="takeover-password-input"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Enter your password"
            disabled={isVerifying}
          />
        </FormField>
      </form>
    </Modal>
  );
}
