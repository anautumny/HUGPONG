const { assertReleaseEnvironment } = require('./scripts/validateReleaseEnvironment.cjs');

module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (['preview', 'production'].includes(profile) || (!profile && process.env.NODE_ENV === 'production')) {
    assertReleaseEnvironment(process.env);
  }
  return config;
};
