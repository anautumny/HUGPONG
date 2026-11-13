const { assertReleaseEnvironment } = require('./scripts/validateReleaseEnvironment.cjs');
const { androidPushConfiguration } = require('./scripts/androidPushConfiguration.cjs');

module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE;
  // CI exports JavaScript against an isolated Firebase configuration; it does
  // not build an APK. EAS native builds always validate the actual Android file.
  const ciBundleOnly = process.env.CI === 'true' && !profile;
  // EAS file environment variables resolve to a temporary file path, never
  // to the server service-account credential or an embedded private key.
  const googleServicesFile = ciBundleOnly ? null : androidPushConfiguration(config, process.env);
  if (['preview', 'production'].includes(profile) || (!profile && process.env.NODE_ENV === 'production')) {
    assertReleaseEnvironment(process.env);
    if (!googleServicesFile && !ciBundleOnly) throw new Error('Android push notifications require the Firebase Android google-services.json file. Set the EAS file variable GOOGLE_SERVICES_JSON; never use serviceAccountKey.json.');
  }
  return { ...config, android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) } };
};
