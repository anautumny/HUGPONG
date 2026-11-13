// ══════════════════════════════════════════════════════════════
// HUGPONG Backend — Firebase Admin SDK Initializer
// ══════════════════════════════════════════════════════════════

const { initializeApp, cert, getApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, initializeFirestore, FieldPath, FieldValue } = require('firebase-admin/firestore');
const { isCloudflareRuntime } = require('./services/runtimePlatform');
// Local compatibility facade for existing routes/scripts. All SDK entry points
// are modular; Firebase Admin 14 removed the legacy root namespace.
const admin = { initializeApp, credential: { cert }, app: getApp,
  firestore: Object.assign(getFirestore, { FieldPath, FieldValue }), auth: getAuth };
const { cleanText } = require('./services/diagnosticService');
const fs = require('fs');
const path = require('path');

// Load the validated server environment before resolving Firebase identity.
require('./config');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
const configuredProjectId = String(
  process.env.FIREBASE_PROJECT_ID
  || process.env.GCLOUD_PROJECT
  || process.env.GOOGLE_CLOUD_PROJECT
  || ''
).trim();
let isInitialized = false;
let hasServiceAccount = false;
let db = null;
let auth = null;

try {
  if (isCloudflareRuntime()) {
    // A Worker secret, never a bundled JSON file or a client environment value.
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || 'null');
    if (!serviceAccount?.private_key || !serviceAccount?.client_email || !serviceAccount?.project_id) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain the server Firebase service account.');
    }
    if (configuredProjectId && serviceAccount.project_id !== configuredProjectId) {
      throw new Error('Firebase credential project does not match FIREBASE_PROJECT_ID.');
    }
    const app = initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
    db = initializeFirestore(app, { preferRest: true });
    // Workers' Node HTTP bridge delivers raw compressed bodies to the SDK's
    // streaming REST parser. Request identity encoding for this transport only.
    db.settings({ customHeaders: { 'accept-encoding': 'identity' } });
    isInitialized = true;
    hasServiceAccount = true;
  } else if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    const projectId = String(serviceAccount.project_id || configuredProjectId).trim();
    if (!projectId) throw new Error('Firebase project ID is missing from the service account and environment.');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId
    });
    console.log('[HUGPONG Server] Firebase Admin initialized with serviceAccountKey.json');
    isInitialized = true;
    hasServiceAccount = true;
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp(configuredProjectId ? { projectId: configuredProjectId } : undefined);
    console.log('[HUGPONG Server] Firebase Admin initialized with GOOGLE_APPLICATION_CREDENTIALS');
    isInitialized = true;
    hasServiceAccount = true;
  } else {
    if (!configuredProjectId) {
      throw new Error('FIREBASE_PROJECT_ID is required when Firebase credentials do not provide a project ID.');
    }
    admin.initializeApp({
      projectId: configuredProjectId
    });
    console.log(`[HUGPONG Server] Firebase Admin initialized in standard mode for project: ${configuredProjectId}`);
    console.log('[HUGPONG Server] Tip: Drop serviceAccountKey.json into server/ for elevated Admin credentials');
    isInitialized = true;
    hasServiceAccount = false;
  }

  db ||= admin.firestore();
  auth = admin.auth();
} catch (error) {
  console.warn('[HUGPONG Server] Firebase Admin initialization note:', cleanText(error.message));
  db = null;
  auth = null;
}

module.exports = {
  admin,
  db,
  auth,
  isInitialized,
  hasServiceAccount
};
