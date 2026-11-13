// Shared transport contract with Mobile. One owner per authenticated client;
// screens continue subscribing to the existing API/store, never to Firestore.
export function createChangeStream({ connect, onChange, onUnauthorized = () => {}, retryMs = 1000 }) {
  let stopped = false;
  let controller = null;
  let retryTimer = null;
  let watchdog = null;
  let attempt = 0;
  let lastRevision = null;

  async function run() {
    if (stopped) return;
    const current = new AbortController();
    controller = current;
    const touch = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => current.abort(), 45000);
    };
    touch();
    let reader;
    try {
      const response = await connect(current.signal);
      if (stopped || current.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        stopped = true;
        onUnauthorized(response.status);
        return;
      }
      if (!response.ok || !response.body?.getReader) throw new Error('Change stream unavailable.');
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!stopped && !current.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        touch();
        attempt = 0;
        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
        if (buffer.length > 65536) throw new Error('Invalid change stream frame.');
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const event = JSON.parse(line.slice(6));
            if (event.reset === true || Array.isArray(event.resources)) {
              if (!(event.reset && event.revision && event.revision === lastRevision)) onChange(event);
              if (event.revision) lastRevision = event.revision;
            }
          }
        }
      }
    } catch {
      // Retain existing replicas. Reopening always requests a full revalidation.
    } finally {
      clearTimeout(watchdog);
      current.abort();
      try { await reader?.cancel(); } catch { /* Already disconnected. */ }
      if (controller === current) controller = null;
      if (!stopped) {
        const delay = Math.min(30000, retryMs * 2 ** Math.min(attempt++, 5));
        retryTimer = setTimeout(run, delay + Math.floor(Math.random() * delay * 0.2));
      }
    }
  }

  void run();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    clearTimeout(watchdog);
    controller?.abort();
  };
}
