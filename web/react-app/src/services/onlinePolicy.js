export function assertWebOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw Object.assign(new Error('The Web console requires an internet connection. Reconnect to continue.'), {
      code: 'WEB_CONNECTION_REQUIRED', isNetworkError: true
    });
  }
}
