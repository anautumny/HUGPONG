// ══════════════════════════════════════════════════════════════
// HUGPONG — Central Backend & Security Gateway Server
// ══════════════════════════════════════════════════════════════

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { sessionSecret, corsOrigins, isProduction, host, port } = require('./config');
const FirestoreSessionStore = require('./services/firestoreSessionStore');
const { startOperationalCleanup } = require('./services/operationalCleanupService');
const { COLLECTIONS } = require('./schema/firestoreSchema');
const { requireAuth } = require('./middleware/auth');
const { requireAccountReady, requireApiPermission } = require('./middleware/requestPermissions');
const { validateRequestInput, malformedJsonHandler } = require('./middleware/requestInputValidation');
const { safeErrorResponses } = require('./middleware/errorHandling');
const { createEarlyAbuseProtection, createAuthenticatedApiRateLimit } = require('./middleware/abuseProtection');
const {
  LEGACY_ROLE_DASHBOARD_REDIRECTS,
  LEGACY_LEGAL_PAGE_REDIRECTS
} = require('./domain/legacyWebRoutes');

// Initialize Firebase Admin SDK
const { db } = require('./firebase-admin');

// Import Route Handlers
const authRoutes = require('./routes/auth');
const priceRoutes = require('./routes/prices');
const userRoutes = require('./routes/users');
const blockFarmRoutes = require('./routes/blockFarms');
const fieldRoutes = require('./routes/fields');
const logRoutes = require('./routes/logs');
const cropCycleRoutes = require('./routes/cropCycles');
const auditReportRoutes = require('./routes/auditReports');
const ticketRoutes = require('./routes/tickets');
const smsRoutes = require('./routes/sms');
const auditEventRoutes = require('./routes/auditEvents');
const telemetryRoutes = require('./routes/telemetry');
const systemDiagnosticsRoutes = require('./routes/systemDiagnostics');
const diagnosticsRoutes = require('./routes/diagnostics');
const backupRoutes = require('./routes/backups');

const app = express();
app.disable('x-powered-by');
app.set('query parser', 'simple');
if (isProduction) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProduction) {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com");
  }
  next();
});

// Install the safe error envelope before any middleware that can reject a
// request, including CORS and JSON parsing.
app.use(safeErrorResponses(db));

// Reject abusive bursts and oversized declared payloads before CORS, JSON
// parsing, sessions, authentication, logging, or any Firestore operation.
app.use(createEarlyAbuseProtection());

// Credentialed browser requests are restricted to explicitly configured origins.
app.use(cors({
  origin: (origin, callback) => {
    // Native mobile requests have no browser Origin header.
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      const error = new Error('Origin is not allowed by HUGPONG CORS policy.');
      error.status = 403;
      callback(error);
    }
  },
  credentials: true
}));

// Operation photo evidence is resized and capped by both clients before it is
// accepted by the canonical schema. Keep the transport ceiling below the
// Firestore document limit while allowing one compact JPEG attachment.
// Encrypted logical backup uploads are explicitly bounded and validated by the
// backup service. Keep the larger parser isolated from every other endpoint.
app.use('/api/backups', express.json({ limit: '12mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(malformedJsonHandler);
app.use(validateRequestInput);

// Cookie-authenticated writes must originate from an approved browser origin.
// Native clients authenticate with a bearer token and do not send Origin.
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = String(req.headers.origin || '');
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if ((origin && !corsOrigins.includes(origin)) || fetchSite === 'cross-site') {
    return res.status(403).json({ success: false, error: 'Request origin is not authorized.', code: 'ORIGIN_FORBIDDEN' });
  }
  return next();
});

// Health probes must remain outside session middleware. Browser and mobile
// connectivity checks do not need to hydrate a Firestore-backed session.
app.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    status: 'healthy'
  });
});

// Session Configuration
app.use(session({
  name: 'hugpong.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  ...(isProduction ? { store: new FirestoreSessionStore(db, { collectionName: COLLECTIONS.SERVER_SESSIONS }) } : {}),
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

// Log successful traffic once it completes. Rejected traffic is handled by
// the bounded diagnostic aggregator so a bot cannot amplify one request into
// one console line and one Firestore diagnostic write indefinitely.
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.once('finish', () => {
    if (res.statusCode >= 400) return;
    const endpoint = String(req.originalUrl || '').split(/[?#]/, 1)[0];
    if (!endpoint.startsWith('/api/') && !endpoint.startsWith('/auth/')) return;
    const timestamp = new Date().toLocaleTimeString();
    const sessionRole = req.authUser?.role || req.session?.user?.role || 'Guest';
    console.log(`[${timestamp}] ${req.method} ${endpoint} ${res.statusCode} ${Date.now() - startedAt}ms [${sessionRole}]`);
  });
  next();
});

// ── Mount Primary API Routes ────────────────────────────────
app.use('/auth', authRoutes);
// Every application-data request is re-authorized against the live account,
// onboarding state, client platform, and an explicit method/path role policy.
// Unknown API routes fail closed until a policy is deliberately added.
app.use('/api', requireAuth, createAuthenticatedApiRateLimit(), requireAccountReady, requireApiPermission);
app.use('/api/prices', priceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/block-farms', blockFarmRoutes);
app.use('/api/fields', fieldRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/crop-cycles', cropCycleRoutes);
app.use('/api/audit-reports', auditReportRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/audit-events', auditEventRoutes);
app.use('/api/terminal-diagnostics', telemetryRoutes);
app.use('/api/system-diagnostics', systemDiagnosticsRoutes);
app.use('/api/diagnostics', diagnosticsRoutes);
app.use('/api/backups', backupRoutes);

// ── Static Web Serving (React Production SPA + Legacy Web Fallback) ──────
const reactDistPath = path.join(__dirname, '../web/react-app/dist');

// Legacy entry redirect: direct legacy HTML routes to modern React SPA
app.get(['/login.html', '/index.html'], (req, res) => {
  res.redirect(301, '/login');
});

// Phase 4 compatibility bridge: keep old bookmarks working while React owns
// the active role dashboards. Temporary redirects avoid permanently caching
// this migration until the legacy deletion gate is complete.
app.get(Object.keys(LEGACY_ROLE_DASHBOARD_REDIRECTS), (req, res) => {
  res.redirect(302, LEGACY_ROLE_DASHBOARD_REDIRECTS[req.path]);
});

app.get(Object.keys(LEGACY_LEGAL_PAGE_REDIRECTS), (req, res) => {
  res.redirect(302, LEGACY_LEGAL_PAGE_REDIRECTS[req.path]);
});

if (fs.existsSync(reactDistPath)) {
  app.use(express.static(reactDistPath));
}

// ── Health Check & System Status ────────────────────────────
// Legacy client status route.
// Compatibility health endpoint retained for deployed clients.
app.get('/api/data', (req, res) => {
  res.json({
    success: true,
    message: 'HUGPONG Server active. Please use dedicated /api/* endpoints or Firestore real-time sync.'
  });
});

// SPA Fallback: Serve React index.html for non-API client GET requests
if (fs.existsSync(reactDistPath)) {
  app.get('*', (req, res, next) => {
    if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/auth') || req.originalUrl.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(reactDistPath, 'index.html'));
  });
}

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: isProduction ? 'Endpoint not found.' : `Endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Error Handler
app.use((err, req, res, next) => {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.locals.diagnosticError = err;
  res.status(status).json({
    success: false,
    error: err.message || 'Internal Server Error',
    code: err.code || (status === 403 ? 'ORIGIN_FORBIDDEN' : 'SERVER_ERROR')
  });
});

// Start Server
const server = app.listen(port, host, () => {
  console.log('══════════════════════════════════════════════════════════');
console.log(`  HUGPONG Security Gateway & Express Backend`);
console.log(`  Server listening on ${host}:${port}`);
console.log(`  Authentication & Role Protection: ACTIVE`);
  console.log('══════════════════════════════════════════════════════════');
});

const operationalCleanup = isProduction && db ? startOperationalCleanup(db) : null;
server.on('close', () => operationalCleanup?.stop());

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[HUGPONG Server Error] Port ${port} is already in use by another process.`);
    console.error(`To free port ${port}, close the conflicting process or run run-web.bat.\n`);
    process.exit(1);
  } else {
    console.error('[HUGPONG Server Error]', err);
    process.exit(1);
  }
});
