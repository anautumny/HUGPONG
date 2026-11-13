import { fetch as streamingFetch } from 'expo/fetch';
import { createChangeStream } from './changeStream';
import { mobileStreamHeaders } from './authService';
import { getApiBaseUrl } from '../config/apiConfig';

export function startRealtimeSync(onChange, onUnauthorized, { setupOnly = false } = {}) {
  return createChangeStream({
    connect: async signal => streamingFetch(`${getApiBaseUrl()}${setupOnly ? '/auth/session/events' : '/api/sync/events'}`, {
      headers: await mobileStreamHeaders(), signal
    }),
    onChange,
    onUnauthorized
  });
}
