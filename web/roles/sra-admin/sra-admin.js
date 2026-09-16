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
      currentRole = webRoleKeyFromUser(user, data.roleKey);
      if (!currentRole) {
        window.location.replace('../../login.html');
        return;
      }
      if (data.firebaseCustomToken && typeof window.signInHugpongWithCustomToken === 'function') {
        await window.signInHugpongWithCustomToken(data.firebaseCustomToken);
      }
      if (typeof saveWebAuthSession === 'function') {
        saveWebAuthSession(user, currentRole, data.token);
      } else {
        localStorage.setItem('hugpong_user', JSON.stringify(user));
        localStorage.setItem('hugpong_role', currentRole);
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

  const roleKey = webRoleKeyFromUser(user, currentRole);
  if (roleKey !== 'admin') {
    window.location.replace(getWebDashboardPath(roleKey) || '/login.html?role=member');
    return;
  }

  localStorage.setItem('hugpong_role', roleKey);
  document.documentElement.classList.remove('auth-pending');

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
