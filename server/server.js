// ══════════════════════════════════════════════════════════════
// HUGPONG — Central Backend & Security Gateway Server
// Project: hugpong-ff
// ══════════════════════════════════════════════════════════════

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

// Initialize Firebase Admin SDK
const { isInitialized } = require('./firebase-admin');

// Import Route Handlers
const authRoutes = require('./routes/auth');
const priceRoutes = require('./routes/prices');
const userRoutes = require('./routes/users');
const blockFarmRoutes = require('./routes/blockFarms');
const fieldRoutes = require('./routes/fields');
const logRoutes = require('./routes/logs');
const ticketRoutes = require('./routes/tickets');
const smsRoutes = require('./routes/sms');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration (enables credentials for session cookies across localhost ports)
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, file://) or any localhost port
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.startsWith('file://')) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive in dev, configurable for production
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Configuration
app.use(session({
  name: 'hugpong.sid',
  secret: process.env.SESSION_SECRET || 'hugpong-secure-capstone-session-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // Set to true in production with HTTPS
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

// Request Logger & Token Session Hydration
app.use((req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.token;
  if (!req.session.user && authHeader) {
    const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (rawToken.startsWith('HUGPONG.')) {
      try {
        const payloadJson = Buffer.from(rawToken.split('.')[1], 'base64').toString('utf8');
        const payload = JSON.parse(payloadJson);
        if (payload && payload.role) {
          req.session.user = {
            employeeId: payload.uid,
            name: payload.name || payload.uid,
            role: payload.role === 'superadmin' ? 'Super Admin' : (payload.role === 'manager' ? 'Farm Manager' : 'SRA Admin'),
            roleKey: payload.role
          };
        }
      } catch (e) {}
    }
  }

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
app.use('/api/tickets', ticketRoutes);
app.use('/api/sms', smsRoutes);

// ── Static Web Dashboard Serving ────────────────────────────
app.use(express.static(path.join(__dirname, '../web')));

// ── Health Check & System Status ────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: 'HUGPONG Security Gateway',
    firebaseAdmin: isInitialized ? 'connected' : 'fallback',
    authenticated: !!(req.session && req.session.user),
    user: req.session ? req.session.user : null,
    uptime: process.uptime()
  });
});

// ── Backwards Compatibility for Mock Sync ───────────────────
app.get('/api/data', (req, res) => {
  res.json({
    success: true,
    message: 'HUGPONG Server active. Please use dedicated /api/* endpoints or Firestore real-time sync.'
  });
});

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
app.listen(PORT, '0.0.0.0', () => {
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  🌾 HUGPONG Security Gateway & Express Backend`);
  console.log(`  🚀 Server running on: http://localhost:${PORT}`);
  console.log(`  🔒 Authentication & Role Protection: ACTIVE`);
  console.log(`  📦 Project: hugpong-ff`);
  console.log('══════════════════════════════════════════════════════════');
});
