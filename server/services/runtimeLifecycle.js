'use strict';

const DEFAULT_REQUEST_TIMEOUT_MS = 30 * 1000;
const DEFAULT_SHUTDOWN_GRACE_PERIOD_MS = 10 * 1000;
const KEEP_ALIVE_TIMEOUT_MS = 5 * 1000;
const MAX_REQUESTS_PER_SOCKET = 100;

function createRuntimeLifecycle() {
  let ready = false;
  let draining = false;

  return Object.freeze({
    markReady() {
      if (!draining) ready = true;
    },
    beginDrain() {
      draining = true;
      ready = false;
    },
    isReady() {
      return ready && !draining;
    },
    isDraining() {
      return draining;
    }
  });
}

function configureHttpServer(server, { requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  if (!server) throw new Error('HTTP server is required.');
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 5_000 || requestTimeoutMs > 120_000) {
    throw new Error('Request timeout must be between 5000 and 120000 milliseconds.');
  }

  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = requestTimeoutMs + 5_000;
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.maxRequestsPerSocket = MAX_REQUESTS_PER_SOCKET;
  return server;
}

function installGracefulShutdown({
  server,
  lifecycle,
  cleanup = null,
  gracePeriodMs = DEFAULT_SHUTDOWN_GRACE_PERIOD_MS,
  processTarget = process,
  logger = console
}) {
  if (!server || !lifecycle) throw new Error('Server and runtime lifecycle are required.');
  let shutdownStarted = false;

  function shutdown(signal) {
    if (shutdownStarted) return;
    shutdownStarted = true;
    lifecycle.beginDrain();
    cleanup?.stop?.();
    logger.info(`[Runtime] ${signal} received; readiness disabled while active requests drain.`);

    const deadline = setTimeout(() => {
      logger.error('[Runtime] Graceful shutdown deadline exceeded.');
      server.closeAllConnections?.();
      if (typeof processTarget.exit === 'function') processTarget.exit(1);
      else processTarget.exitCode = 1;
    }, gracePeriodMs);
    deadline.unref?.();

    server.close(error => {
      clearTimeout(deadline);
      if (error) {
        logger.error('[Runtime] HTTP server shutdown failed.');
        if (typeof processTarget.exit === 'function') processTarget.exit(1);
        else processTarget.exitCode = 1;
      } else if (typeof processTarget.exit === 'function') {
        processTarget.exit(0);
      }
    });
    server.closeIdleConnections?.();
  }

  const onSigterm = () => shutdown('SIGTERM');
  const onSigint = () => shutdown('SIGINT');
  processTarget.once('SIGTERM', onSigterm);
  processTarget.once('SIGINT', onSigint);

  return Object.freeze({
    shutdown,
    remove() {
      processTarget.removeListener('SIGTERM', onSigterm);
      processTarget.removeListener('SIGINT', onSigint);
    }
  });
}

module.exports = {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_SHUTDOWN_GRACE_PERIOD_MS,
  KEEP_ALIVE_TIMEOUT_MS,
  MAX_REQUESTS_PER_SOCKET,
  createRuntimeLifecycle,
  configureHttpServer,
  installGracefulShutdown
};
