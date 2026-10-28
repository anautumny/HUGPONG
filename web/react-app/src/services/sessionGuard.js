// A response may affect the browser session only while its generation is current.
// Login, logout, setup completion and revocation invalidate older refreshes.
export function createSessionGuard() {
  let generation = 0;
  let inFlight = null;
  return {
    invalidate() {
      generation += 1;
      inFlight?.controller.abort();
      inFlight = null;
    },
    refresh(work) {
      if (inFlight) return inFlight.promise;
      const controller = new AbortController();
      const requestGeneration = generation;
      const request = { controller, promise: null };
      request.promise = Promise.resolve().then(() => work({
        controller,
        isCurrent: () => requestGeneration === generation
      })).finally(() => {
        if (inFlight === request) inFlight = null;
      });
      inFlight = request;
      return request.promise;
    }
  };
}
