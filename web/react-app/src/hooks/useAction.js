import { useCallback, useState } from 'react';

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const run = useCallback(async (action, successMessage = 'Saved successfully.') => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await action();
      setMessage(successMessage);
      return result;
    } catch (cause) {
      setError(cause.message || 'The request could not be completed.');
      throw cause;
    } finally { setBusy(false); }
  }, []);
  return { busy, error, message, run, setError, clear: () => { setError(''); setMessage(''); } };
}
