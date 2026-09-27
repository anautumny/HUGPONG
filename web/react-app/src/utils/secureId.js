export function secureToken(length = 20) {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, length).toUpperCase();
}

export function createClientRecordId(prefix, context = '') {
  const cleanPrefix = String(prefix || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const cleanContext = String(context || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return `${cleanPrefix}${cleanContext ? `-${cleanContext}` : ''}-${secureToken(20)}`;
}
