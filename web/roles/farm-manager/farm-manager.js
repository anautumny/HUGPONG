// ══════════════════════════════════════════════════════════════
// HUGPONG — Farm Manager Operations Workspace
// Role: Farm Manager (Jose Reyes · Nacayao Block Farm)
// ══════════════════════════════════════════════════════════════

console.log('[HUGPONG] Initializing Farm Manager workspace...');

(async function verifyRoleAccess() {
  const session = typeof getWebAuthSession === 'function' ? getWebAuthSession() : null;
  let user = session?.user;
  let currentRole = session?.roleKey;

  if (!user) {
    const userJson = localStorage.getItem('hugpong_user');
    try { user = userJson ? JSON.parse(userJson) : null; } catch (e) {}
    currentRole = localStorage.getItem('hugpong_role') || user?.roleKey || user?.role;
  }

  // Verify against backend session if server is reachable
  try {
    const token = localStorage.getItem('hugpong_auth_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch('http://localhost:3000/auth/session', { headers, credentials: 'include' });
    const data = await res.json();
    if (data.authenticated && data.user) {
      user = data.user;
      if (typeof saveWebAuthSession === 'function') {
        saveWebAuthSession(user, user.roleKey || 'manager');
      } else {
        localStorage.setItem('hugpong_user', JSON.stringify(user));
        localStorage.setItem('hugpong_role', user.roleKey || 'manager');
      }
    } else if (!user) {
      window.location.replace('../../login.html');
      return;
    }
  } catch (e) {
    // Offline mode: verify local user profile exists
    if (!user) {
      window.location.replace('../../login.html');
      return;
    }
  }

  // Security Gate: Check for required phone verification on first login / deferred accounts
  if (user && (user.phoneVerified === false || user.pendingFirstLoginVerification === true)) {
    console.warn('[HUGPONG] User requires phone verification before accessing Farm Manager workspace.');
    window.location.replace('../../login.html');
    return;
  }

  const roleLower = String(user?.roleKey || user?.role || currentRole || '').toLowerCase();
  if (!roleLower.includes('manager') && !roleLower.includes('admin') && !roleLower.includes('super')) {
    console.warn('[HUGPONG] Unauthorized access attempt to Farm Manager workspace.');
    alert('Access Restricted: You do not have Farm Manager permissions.');
    window.location.replace('../../login.html');
    return;
  }

  localStorage.setItem('hugpong_role', 'manager');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof applyRoleLayout === 'function') applyRoleLayout('manager');
      if (typeof renderDashboard === 'function') renderDashboard();
      if (user && user.requiresPasswordChange === true && user.passwordChanged !== true) {
        if (typeof openFirstLoginChangePasswordModal === 'function') openFirstLoginChangePasswordModal(user);
      }
    });
  } else {
    if (typeof applyRoleLayout === 'function') applyRoleLayout('manager');
    if (typeof renderDashboard === 'function') renderDashboard();
    if (user && user.requiresPasswordChange === true && user.passwordChanged !== true) {
      if (typeof openFirstLoginChangePasswordModal === 'function') openFirstLoginChangePasswordModal(user);
    }
  }
})();
