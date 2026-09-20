// ══════════════════════════════════════════════════════════════
// HUGPONG — Central Backend & Security Gateway Server
// Project: hugpong-ff
// ══════════════════════════════════════════════════════════════

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { sessionSecret, corsOrigins, isProduction } = require('./config');

// Initialize Firebase Admin SDK
const { isInitialized } = require('./firebase-admin');

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

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration (enables credentials for session cookies across localhost ports)
app.use(cors({
  origin: (origin, callback) => {
    // Native mobile requests have no browser Origin header.
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origin is not allowed by HUGPONG CORS policy.'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (isProduction) app.set('trust proxy', 1);

// Session Configuration
app.use(session({
  name: 'hugpong.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

// Request Logger. Protected routes hydrate bearer sessions in requireAuth.
app.use((req, res, next) => {
  const timestamp = new Date().toLocaleTimeString();
  const sessionUser = req.session && req.session.user ? `[${req.session.user.name} (${req.session.user.role})]` : '[Guest]';
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl} ${sessionUser}`);
  next();
});

// ── Mount Primary API Routes ────────────────────────────────
app.use('/auth', authRoutes);
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

// ── Static Web Serving (React Production SPA + Legacy Web Fallback) ──────
const reactDistPath = path.join(__dirname, '../web/react-app/dist');
const legacyWebPath = path.join(__dirname, '../web');

// Legacy entry redirect: direct legacy HTML routes to modern React SPA
app.get(['/login.html', '/index.html'], (req, res) => {
  res.redirect(301, '/login');
});

if (fs.existsSync(reactDistPath)) {
  app.use(express.static(reactDistPath));
}
app.use(express.static(legacyWebPath));

// ── Health Check & System Status ────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: 'HUGPONG Security Gateway',
    firebaseAdmin: isInitialized ? 'connected' : 'unavailable',
    authenticated: !!(req.session && req.session.user),
    user: req.session ? req.session.user : null,
    uptime: process.uptime()
  });
});

// Legacy client status route.
// Compatibility health endpoint retained for deployed clients.
app.get('/api/data', require('./middleware/auth').requireAuth, (req, res) => {
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
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('[HUGPONG Server Error]', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Start Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  🌾 HUGPONG Security Gateway & Express Backend`);
  console.log(`  🚀 Server running on: http://localhost:${PORT}`);
  console.log(`  🔒 Authentication & Role Protection: ACTIVE`);
  console.log(`  📦 Project: hugpong-ff`);
  console.log('══════════════════════════════════════════════════════════');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[HUGPONG Server Error] Port ${PORT} is already in use by another process.`);
    console.error(`To free port ${PORT}, close the conflicting process or run run-web.bat.\n`);
    process.exit(1);
  } else {
    console.error('[HUGPONG Server Error]', err);
    process.exit(1);
  }
});
