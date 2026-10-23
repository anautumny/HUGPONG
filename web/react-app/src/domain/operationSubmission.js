// A lost response does not prove that a write failed. Keep one stable operation
// identity while retrying the same form, using the server's idempotent create.
export function createOperationSubmission(send, makeId, { storageKey, storage } = {}) {
  let attempt = null;
  let inFlight = null;
  let recoveryError = null;
  try {
    if (storageKey && storage === undefined) storage = globalThis.localStorage;
    const saved = storageKey && storage?.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed?.payload?.id || !parsed.signature) throw new Error('Invalid saved submission');
      attempt = { ...parsed, uncertain: true };
    }
  } catch { recoveryError = new Error('The saved submission could not be recovered. Check the operation ledger before recording this activity again.'); }
  const persist = () => {
    if (!storageKey) return;
    if (!storage) throw new Error('Device storage is unavailable. Enable browser storage before submitting.');
    if (attempt) storage.setItem(storageKey, JSON.stringify({ ...attempt, uncertain: true }));
    else storage.removeItem(storageKey);
  };
  const fingerprint = payload => JSON.stringify(payload, (key, value) => key === 'laborEntryId' ? undefined : value);
  const submission = {
    pending() { return attempt ? structuredClone(attempt.payload) : null; },
    retry(grant) {
      if (!attempt) return Promise.reject(recoveryError || new Error('No unconfirmed operation to retry.'));
      return submission.submit(attempt.payload, grant, true);
    },
    submit(payload, grant, retrying = false) {
      if (inFlight) return inFlight;
      if (recoveryError) return Promise.reject(recoveryError);
      const signature = fingerprint(payload);
      if (attempt && !retrying && attempt.signature !== signature) {
        return Promise.reject(new Error('The previous submission has not been confirmed. Restore its details and retry, or check the operation ledger before starting another record.'));
      }
      if (!attempt) attempt = { signature, payload: { ...payload, id: payload.id || makeId() } };
      try { persist(); } catch (error) { return Promise.reject(error); }
      inFlight = Promise.resolve().then(() => send(attempt.payload, grant))
        .then(result => {
          const confirmed = attempt;
          attempt = null;
          try { persist(); } catch (error) { attempt = confirmed; throw error; }
          return result;
        })
        .catch(error => {
          // A definitive rejection permits correcting the form. Network errors
          // and server failures retain the ID in case the write already landed.
          const definitive = error.status >= 400 && error.status < 500 && error.status !== 408;
          if (definitive && !attempt.uncertain) attempt = null;
          else attempt.uncertain = true;
          persist();
          throw error;
        })
        .finally(() => { inFlight = null; });
      return inFlight;
    },
  };
  return submission;
}
