'use strict';

// Detect the actual runtime, not a request header or an environment switch.
function isCloudflareRuntime() {
  return typeof navigator !== 'undefined'
    && navigator.userAgent === 'Cloudflare-Workers'
    && typeof WebSocketPair === 'function';
}

module.exports = { isCloudflareRuntime };
