import React, { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

// Await an application dialog without blocking rendering or accepting a
// confirmation left open by a previous account/session.
export default function useConfirmation(user) {
  const scope = JSON.stringify([user?.employeeId || user?.id || user?.uid || '',
    user?.canonicalRole || user?.roleKey || user?.role || '', user?.authVersion || 1]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const pending = useRef(null);
  const sequence = useRef(0);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    setDialog(null);
    return () => {
      pending.current?.resolve(false);
      pending.current = null;
    };
  }, [scope]);

  const request = useCallback(settings => new Promise(resolve => {
    pending.current?.resolve(false);
    const id = ++sequence.current;
    pending.current = { id, scope: currentScope.current, resolve };
    setDialog({ id, settings });
  }), []);

  const settle = useCallback((id, accepted) => {
    const entry = pending.current;
    if (!entry || entry.id !== id) return;
    pending.current = null;
    setDialog(null);
    entry.resolve(accepted && entry.scope === currentScope.current);
  }, []);

  return [request, dialog ? <ConfirmDialog key={dialog.id} {...dialog.settings} isOpen
    onConfirm={() => settle(dialog.id, true)} onCancel={() => settle(dialog.id, false)} /> : null];
}
