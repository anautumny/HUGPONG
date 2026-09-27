// ══════════════════════════════════════════════════════════════
// HUGPONG Backend — Firebase Admin SDK Initializer
// ══════════════════════════════════════════════════════════════

const admin = require('firebase-admin');
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
  if (fs.existsSync(serviceAccountPath)) {
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

  db = admin.firestore();
  auth = admin.auth();
} catch (error) {
  console.warn('[HUGPONG Server] Firebase Admin initialization note:', error.message);
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
