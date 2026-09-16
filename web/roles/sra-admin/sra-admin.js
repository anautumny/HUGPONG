// ══════════════════════════════════════════════════════════════
// HUGPONG — SRA Administrator Console
// Role: SRA Admin (Silay Sugar Regulatory Administration)
// ══════════════════════════════════════════════════════════════

console.log('[HUGPONG] Initializing SRA Admin workspace...');

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
    const res = await fetch('/auth/session', { headers, credentials: 'include' });
    const data = await res.json();
    if (data.authenticated && data.user) {
      user = data.user;
      if (data.firebaseCustomToken && typeof window.signInHugpongWithCustomToken === 'function') {
        await window.signInHugpongWithCustomToken(data.firebaseCustomToken);
      }
      if (typeof saveWebAuthSession === 'function') {
        saveWebAuthSession(user, user.roleKey || 'admin', data.token);
      } else {
        localStorage.setItem('hugpong_user', JSON.stringify(user));
        localStorage.setItem('hugpong_role', user.roleKey || 'admin');
      }
    } else {
      window.location.replace('../../login.html');
      return;
    }
  } catch (e) {
    const firebaseUser = window.hugpongFirebaseAuthReady
      ? await window.hugpongFirebaseAuthReady
      : window.firebaseAuth?.currentUser;
    const token = localStorage.getItem('hugpong_auth_token');
    if (!user || !token || !firebaseUser || firebaseUser.uid !== user.employeeId) {
      window.location.replace('../../login.html');
      return;
    }
    console.warn('[HUGPONG] Express is unreachable; restoring the previously authenticated Firebase session offline.');
  }

  // Security Gate: Check for required phone verification on first login / deferred accounts
  if (user && (user.phoneVerified === false || user.pendingFirstLoginVerification === true)) {
    console.warn('[HUGPONG] User requires phone verification before accessing SRA Admin workspace.');
    window.location.replace('../../login.html');
    return;
  }

  const roleLower = String(user?.roleKey || user?.role || currentRole || '').toLowerCase();
  if (roleLower.includes('manager')) {
    console.log('[HUGPONG] Routing Farm Manager to designated console...');
    window.location.replace('../farm-manager/dashboard.html');
    return;
  }
  if (roleLower.includes('super')) {
    console.log('[HUGPONG] Routing Super Admin to central console...');
    window.location.replace('../super-admin/dashboard.html');
    return;
  }
  if (!roleLower.includes('admin') && !roleLower.includes('sra')) {
    console.warn('[HUGPONG] Unauthorized access attempt to SRA Admin console.');
    alert('Access Restricted: You do not have SRA Administrator permissions.');
    window.location.replace('../../login.html');
    return;
  }

  localStorage.setItem('hugpong_role', 'admin');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof applyRoleLayout === 'function') applyRoleLayout('admin');
      if (typeof renderDashboard === 'function') renderDashboard();
      if (user && user.requiresPasswordChange === true && user.passwordChanged !== true) {
        if (typeof openFirstLoginChangePasswordModal === 'function') openFirstLoginChangePasswordModal(user);
      }
    });
  } else {
    if (typeof applyRoleLayout === 'function') applyRoleLayout('admin');
    if (typeof renderDashboard === 'function') renderDashboard();
    if (user && user.requiresPasswordChange === true && user.passwordChanged !== true) {
      if (typeof openFirstLoginChangePasswordModal === 'function') openFirstLoginChangePasswordModal(user);
    }
  }
})();
