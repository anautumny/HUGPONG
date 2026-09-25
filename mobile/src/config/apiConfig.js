const PUBLIC_API_ENV_NAME = 'EXPO_PUBLIC_API_BASE_URL';
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

const isDevelopmentBuild = typeof __DEV__ !== 'undefined'
  ? __DEV__
  : process.env.NODE_ENV !== 'production';

function isPrivateOrLocalHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;
  if (normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)) return true;

  const octets = normalized.split('.').map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  return octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

function normalizeApiBaseUrl(value) {
  const candidate = String(value || '').trim().replace(/\/+$/, '');
  if (!candidate) return null;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (_) {
    throw new Error(`${PUBLIC_API_ENV_NAME} must be an absolute HTTP(S) origin.`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${PUBLIC_API_ENV_NAME} must use HTTP or HTTPS.`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) {
    throw new Error(`${PUBLIC_API_ENV_NAME} must contain only the API origin, without credentials, a path, query, or fragment.`);
  }
  if (!isDevelopmentBuild && parsed.protocol !== 'https:') {
    throw new Error(`${PUBLIC_API_ENV_NAME} must use HTTPS in production.`);
  }
  if (!isDevelopmentBuild && isPrivateOrLocalHostname(parsed.hostname)) {
    throw new Error(`${PUBLIC_API_ENV_NAME} must use a publicly reachable hostname in production.`);
  }
  return parsed.origin;
}

let configuredApiBaseUrl = null;
let configurationError = null;
try {
  configuredApiBaseUrl = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
  if (!configuredApiBaseUrl) {
    throw new Error(`${PUBLIC_API_ENV_NAME} is required. Configure the public HTTPS HUGPONG API before building the app.`);
  }
} catch (error) {
  configurationError = error;
}

export const API_BASE_URL = configuredApiBaseUrl;
export const API_REQUEST_TIMEOUT_MS = DEFAULT_REQUEST_TIMEOUT_MS;
export const API_ENVIRONMENT = isDevelopmentBuild ? 'development' : 'production';
export const API_UNAVAILABLE_MESSAGE = 'The HUGPONG server is temporarily unavailable. Please try again.';
export const NO_INTERNET_MESSAGE = 'No internet connection. Connect to the internet and try again.';

export function getApiBaseUrl() {
  if (configurationError) {
    const error = new Error('HUGPONG server configuration is unavailable. Contact the system administrator.');
    error.code = 'API_CONFIGURATION_ERROR';
    if (isDevelopmentBuild) error.cause = configurationError;
    throw error;
  }
  return configuredApiBaseUrl;
}

export function logApiDiagnostic(message, error = null) {
  if (!isDevelopmentBuild) return;
  if (error) console.warn(`[HUGPONG API] ${message}`, error);
  else console.info(`[HUGPONG API] ${message}`);
}

export { normalizeApiBaseUrl };
