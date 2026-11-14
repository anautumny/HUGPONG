// Loading metadata is presentation only. API authorization and the canonical
// store remain responsible for account access and record validity.
export function initialDataPresentation(session, state, online) {
  const owner = String(session?.employeeId || session?.id || '');
  const current = owner && state?.ownerUserId === owner ? state : {};
  if (current.hasSnapshot || (!online && current.hasSavedData)) {
    return { showContent: true, notice: !online ? 'offline' : current.phase === 'LOADING'
      ? 'updating' : current.phase === 'ERROR' ? 'error' : null };
  }
  return { showContent: false, mode: !online ? 'offline' : current.phase === 'ERROR' ? 'error' : 'loading' };
}
