const TOKEN_KEY = 'hugpong_auth_token';
const USER_KEY = 'hugpong_user';
const ROLE_KEY = 'hugpong_role';
const FORBIDDEN = new Set(['password', 'passwordHash', 'credentialHash', 'salt', 'resetToken', 'resetTokenHash']);

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !FORBIDDEN.has(key)).map(([key, child]) => [key, sanitize(child)]));
}

export function saveSession(user, roleKey, token) {
  const safeUser = sanitize(user);
  const session = { user: safeUser, roleKey, token: token || null };
  localStorage.setItem(USER_KEY, JSON.stringify(safeUser));
  localStorage.setItem(ROLE_KEY, roleKey);
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  return session;
}

export function getSession() {
  try {
    const user = sanitize(JSON.parse(localStorage.getItem(USER_KEY) || 'null'));
    const roleKey = localStorage.getItem(ROLE_KEY) || '';
    const token = localStorage.getItem(TOKEN_KEY);
    return user && roleKey && token ? { user, roleKey, token } : null;
  } catch (error) {
    clearSession();
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem('hugpong_user_name');
}

