import legacy from '../../server/domain/legacyWebRoutes.js';

const legacyPaths = new Set([
  ...Object.keys(legacy.LEGACY_ROLE_DASHBOARD_REDIRECTS),
  ...Object.keys(legacy.LEGACY_LEGAL_PAGE_REDIRECTS)
]);

export function isGatewayPath(path) {
  return /^\/(?:api|auth|health|downloads)(?:\/|$)/.test(path) || legacyPaths.has(path);
}

export function needsBackgroundWake(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;
  const path = new URL(request.url).pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '');
  // These producers can enqueue the three durable notification audit types.
  // Log uploads, telemetry, token renewal and inbox state cannot create delivery
  // intents. Retention keeps its own durable alarm even without these wakeups.
  return /^\/api\/(?:prices|users)(?:\/|$)/.test(path)
    || (request.method === 'POST' && ['/auth/register', '/auth/request-phone-verification-review'].includes(path));
}

export function preflightRejection(request, mode) {
  if (!['preflight', 'active'].includes(mode)) throw new Error('GATEWAY_MODE must be preflight or active.');
  const read = ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  const readiness = ['/health', '/health/ready'].includes(new URL(request.url).pathname);
  if (mode !== 'preflight' || read && !readiness) return null;
  // Deployment-not-ready is expected, so do not send this through the server's
  // application-error diagnostic writer. Liveness still runs the actual app.
  return Response.json({ success: false, status: 'preflight',
    error: 'HUGPONG is being updated. Sign-in and submissions will be available shortly.',
    code: 'GATEWAY_PREFLIGHT' }, { status: 503, headers: {
      'Cache-Control': 'no-store', 'Retry-After': '60', 'X-Hugpong-Gateway-Mode': 'preflight'
    } });
}

export function trustedProxyRequest(request) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set('x-forwarded-proto', url.protocol.slice(0, -1));
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') || '127.0.0.1');
  headers.delete('forwarded');
  return new Request(request, { headers });
}

export function preserveDownloadLength(request, response, context, FixedStream = globalThis.FixedLengthStream) {
  if (request.method !== 'GET' || !/^\/downloads\/android\/\d+\.\d+\.\d+$/.test(new URL(request.url).pathname)
    || ![200, 206].includes(response.status) || !response.body || !FixedStream) return response;
  const declared = response.headers.get('x-hugpong-download-length') || response.headers.get('content-length');
  if (!/^\d+$/.test(declared || '')) return response;
  const length = Number(declared);
  if (!Number.isSafeInteger(length) || length <= 0) return response;
  const fixed = new FixedStream(length);
  const transfer = response.body.pipeTo(fixed.writable);
  const completion = transfer.catch(() => {});
  context?.waitUntil?.(completion);
  const headers = new Headers(response.headers);
  headers.delete('transfer-encoding'); headers.delete('x-hugpong-download-length');
  headers.set('Content-Length', String(length));
  headers.set('Cache-Control', 'public, max-age=300, no-transform');
  return new Response(fixed.readable, { status: response.status, statusText: response.statusText, headers });
}
