'use strict';

const fs = require('node:fs');
const path = require('node:path');

function androidPushConfiguration(config, environment, projectRoot = path.resolve(__dirname, '..')) {
  const localFile = path.join(projectRoot, 'google-services.json');
  const supplied = environment.GOOGLE_SERVICES_JSON || environment.GOOGLE_SERVICES_FILE
    || config.android?.googleServicesFile || (fs.existsSync(localFile) ? './google-services.json' : null);
  if (!supplied) return null;
  const filename = path.resolve(projectRoot, supplied);
  let value;
  try { value = JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch { throw new Error('The Android Firebase google-services.json configuration file is unavailable or invalid.'); }
  if (value.private_key || value.type === 'service_account') throw new Error('A service account private key cannot be included in an Android app. Use the Android google-services.json configuration.');
  const matches = Array.isArray(value.client) && value.client.some(client => client.client_info?.android_client_info?.package_name === config.android?.package);
  if (!matches || !value.project_info?.project_id || !value.project_info?.project_number) throw new Error('The Android Firebase configuration does not match the HUGPONG Android package.');
  if (environment.EXPO_PUBLIC_FIREBASE_PROJECT_ID && value.project_info.project_id !== environment.EXPO_PUBLIC_FIREBASE_PROJECT_ID) throw new Error('Android push and HUGPONG Firebase project IDs must match.');
  if (environment.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID && String(value.project_info.project_number) !== environment.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) throw new Error('Android push and HUGPONG Firebase sender IDs must match.');
  return supplied;
}

module.exports = { androidPushConfiguration };
