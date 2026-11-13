import { createChangeStream } from './changeStream';
import { invalidateAuthenticatedResources, webClientHeaders } from './apiClient';

export function startRealtimeSync() {
  let stopStream = null;
  let timer = null;
  let reset = false;
  let revision = '';
  const pending = new Set();
  const flush = () => {
    timer = null;
    const resources = reset ? [] : [...pending];
    reset = false;
    pending.clear();
    invalidateAuthenticatedResources(resources, revision);
  };
  const resume = () => {
    if (stopStream || navigator.onLine === false || document.visibilityState === 'hidden') return;
    stopStream = createChangeStream({
      connect: signal => fetch('/api/sync/events', {
        headers: { ...webClientHeaders(), Accept: 'text/event-stream' },
        credentials: 'include', cache: 'no-store', signal
      }),
      onChange: event => {
        if (event.revision) revision = event.revision;
        if (event.reset) reset = true;
        (event.resources || []).forEach(resource => pending.add(resource));
        if (!timer) timer = setTimeout(flush, 100);
      },
      onUnauthorized: () => {
        window.dispatchEvent(new CustomEvent('hugpong:session-recheck'));
      }
    });
  };
  const visibility = () => {
    if (navigator.onLine === false || document.visibilityState === 'hidden') {
      stopStream?.();
      stopStream = null;
    } else resume();
  };
  window.addEventListener('online', visibility);
  window.addEventListener('offline', visibility);
  document.addEventListener('visibilitychange', visibility);
  resume();
  return () => {
    stopStream?.();
    clearTimeout(timer);
    window.removeEventListener('online', visibility);
    window.removeEventListener('offline', visibility);
    document.removeEventListener('visibilitychange', visibility);
  };
}
