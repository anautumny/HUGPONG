// ══════════════════════════════════════════════════════════════
// HUGPONG — Super Admin Workspace & Governance Console
// Role: Super Admin (Capstone Group)
// ══════════════════════════════════════════════════════════════

console.log('[HUGPONG] Initializing Super Admin workspace...');

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
        saveWebAuthSession(user, user.roleKey || 'superadmin');
      } else {
        localStorage.setItem('hugpong_user', JSON.stringify(user));
        localStorage.setItem('hugpong_role', user.roleKey || 'superadmin');
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
    console.warn('[HUGPONG] User requires phone verification before accessing Super Admin workspace.');
    window.location.replace('../../login.html');
    return;
  }

  const roleLower = String(user?.roleKey || user?.role || currentRole || '').toLowerCase();
  if (roleLower.includes('manager')) {
    console.log('[HUGPONG] Routing Farm Manager to designated console...');
    window.location.replace('../farm-manager/dashboard.html');
    return;
  }
  if (roleLower.includes('admin') || roleLower.includes('sra')) {
    console.log('[HUGPONG] Routing SRA Admin to district console...');
    window.location.replace('../sra-admin/dashboard.html');
    return;
  }
  if (!roleLower.includes('super')) {
    console.warn('[HUGPONG] Unauthorized access attempt to Super Admin console.');
    alert('Access Restricted: You do not have Super Admin permissions.');
    window.location.replace('../../login.html');
    return;
  }

  localStorage.setItem('hugpong_role', 'superadmin');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof applyRoleLayout === 'function') applyRoleLayout('superadmin');
      if (typeof renderDashboard === 'function') renderDashboard();
    });
  } else {
    if (typeof applyRoleLayout === 'function') applyRoleLayout('superadmin');
    if (typeof renderDashboard === 'function') renderDashboard();
  }
})();
