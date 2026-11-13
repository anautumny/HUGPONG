'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeLoginIdentifier } = require('../domain/loginIdentifier');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

function functionBetween(file, start, end, context) {
  const source = read(file);
  const begin = source.indexOf(start);
  assert.ok(begin >= 0, `Missing ${start}`);
  const finish = source.indexOf(end, begin + start.length);
  assert.ok(finish > begin, `Missing ${end}`);
  return vm.runInNewContext(`(${source.slice(begin + start.length, finish).trim().replace(/;$/, '')})`, context);
}

function webForm(login) {
  const state = { errors: {}, messages: [], navigations: [], focused: false, busy: false };
  const context = {
    isSubmitting: false, lockoutRemaining: 0, identifier: '03000001', password: 'wrong', consentChecked: false,
    normalizeLoginIdentifier, navigator: { onLine: true }, login,
    setErrorMessage: value => state.messages.push(value), setFieldErrors: value => { state.errors = value; },
    setIsSubmitting: value => { state.busy = value; },
    setLockoutUntil() {}, setLockoutRemaining() {}, localStorage: { removeItem() {} },
    LOGIN_LOCKOUT_STORAGE_KEY: 'test-lockout',
    document: { getElementById: () => ({ focus() { state.focused = true; } }) },
    navigate: (...args) => state.navigations.push(args)
  };
  const submit = functionBetween('web/react-app/src/views/LoginView.jsx', 'const handleSubmit = ', '// Callback when phone verification', context);
  return { state, submit: () => submit({ preventDefault() {} }) };
}

test('Web actually submits unchecked acknowledgement to validate credentials and displays the resulting error', async () => {
  let attempted = false;
  const form = webForm(async (id, password, acknowledged) => {
    attempted = true;
    assert.equal(id, '03000001');
    assert.equal(password, 'wrong');
    assert.equal(acknowledged, false);
    throw Object.assign(new Error('Invalid credentials.'), { code: 'INVALID_CREDENTIALS' });
  });
  await form.submit();
  assert.equal(attempted, true);
  assert.equal(form.state.messages.at(-1), 'Invalid credentials.');
  assert.deepEqual(form.state.navigations, []);
  assert.equal(form.state.errors.consent, undefined);
  assert.equal(form.state.busy, false);
});

test('Web displays and focuses the acknowledgement error only when the server returns that gate', async () => {
  const form = webForm(async () => { throw Object.assign(new Error('Please acknowledge the Privacy Policy and Terms to continue.'), { code: 'SESSION_ACKNOWLEDGEMENT_REQUIRED' }); });
  await form.submit();
  assert.match(form.state.errors.consent, /Please acknowledge/);
  assert.equal(form.state.focused, true);
  assert.deepEqual(form.state.navigations, []);
});

test('Web auth context forwards acknowledgement and never saves an unsuccessful login response', async () => {
  for (const code of ['INVALID_CREDENTIALS', 'SESSION_ACKNOWLEDGEMENT_REQUIRED']) {
    let saved = 0;
    const context = {
      sessionRequests: { current: { invalidate() {} } }, setSessionExpiredNotice() {},
      AbortController, LOGIN_REQUEST_TIMEOUT_MS: 1000,
      window: { setTimeout, clearTimeout }, setIsLoading() {}, webClientHeaders: () => ({}), getWebClientInstanceId: () => 'TEST',
      fetch: async (url, options) => {
        assert.equal(JSON.parse(options.body).sessionAcknowledged, false);
        return { ok: false, status: code === 'INVALID_CREDENTIALS' ? 401 : 400, json: async () => ({ success: false, code }) };
      },
      responseErrorFromPayload: data => Object.assign(new Error(data.code), { code: data.code }),
      saveSession() { saved++; }
    };
    const login = functionBetween('web/react-app/src/context/AuthContext.jsx', 'const login = ', 'const requestPhoneVerification = ', context);
    await assert.rejects(login('03000001', 'password', false), { code });
    assert.equal(saved, 0);
  }
});

test('Android credentials reach the server before an acknowledgement error and cannot navigate on failure', async () => {
  for (const code of ['INVALID_CREDENTIALS', 'SESSION_ACKNOWLEDGEMENT_REQUIRED']) {
    const errors = {};
    const notices = [];
    const navigations = [];
    let attempted = false;
    const context = {
      loading: false, lockoutSeconds: 0, validate: () => true,
      contactNumber: '03000001', password: 'wrong', sessionAcknowledged: false,
      setAuthError: value => notices.push(value), setLoading() {},
      setErrors: value => Object.assign(errors, value),
      t: (key, fallback) => fallback || key, checkConnectivity: async () => true,
      authenticateUser: async (id, password, acknowledged) => {
        attempted = true;
        assert.equal(acknowledged, false);
        return { success: false, code, error: 'Invalid credentials.' };
      },
      navigation: { replace: value => navigations.push(value) }, API_UNAVAILABLE_MESSAGE: 'Network unavailable'
    };
    const login = functionBetween('mobile/src/screens/auth/LoginScreen.js', 'const handleLogin = ', 'const handleVerifyPhone = ', context);
    await login();
    assert.equal(attempted, true);
    assert.deepEqual(navigations, []);
    if (code === 'INVALID_CREDENTIALS') {
      assert.equal(notices.at(-1), 'Invalid credentials.');
      assert.equal(errors.sessionAcknowledged, undefined);
    } else {
      assert.equal(errors.sessionAcknowledged, 'auth_session_ack_required');
    }
  }
});

test('Android auth service never signs into Firebase or stores a token when acknowledgement is required', async () => {
  let signedIn = 0;
  let stored = 0;
  const source = read('mobile/src/services/authService.js');
  const begin = source.indexOf('export async function loginWithServer');
  const end = source.indexOf('export async function refreshServerSession', begin);
  const login = vm.runInNewContext(`(${source.slice(begin, end).replace(/^export /, '').trim()})`, {
    publicAuthRequest: async (endpoint, body) => {
      assert.equal(body.sessionAcknowledged, false);
      throw Object.assign(new Error('Acknowledgement required'), { code: 'SESSION_ACKNOWLEDGEMENT_REQUIRED' });
    },
    signInToFirebase() { signedIn++; }, saveItem() { stored++; }, STORAGE_KEYS: { AUTH_TOKEN: 'TEST' }
  });
  await assert.rejects(login('03000001', 'password', false), { code: 'SESSION_ACKNOWLEDGEMENT_REQUIRED' });
  assert.equal(signedIn, 0);
  assert.equal(stored, 0);
});
