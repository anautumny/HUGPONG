'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSafeErrorEnvelope } = require('../services/diagnosticService');

test('Web and Mobile background telemetry respects Retry-After across repeated screen updates', async () => {
  for (const mobile of [false, true]) {
    let clock = 10000, calls = 0, fail = true;
    class Clock extends Date { static now() { return clock; } }
    const session = JSON.stringify({ canonicalRole: 'MEMBER_FARMER' });
    const context = vm.createContext({ Date: Clock, console: { warn() {} },
      Platform: { OS: 'android', Version: 'test', constants: {} },
      STORAGE_KEYS: { SESSION: 'session' }, getItem: async () => JSON.parse(session), getMobileClientInstanceId: async () => 'DEVICE',
      localStorage: { getItem: key => key === 'hugpong_web_client_instance_id' ? 'DEVICE' : session },
      sessionStorage: { getItem: () => session }, navigator: { onLine: true },
      authenticatedRequest: async () => {
        calls++;
        if (fail) throw Object.assign(new Error('Busy'), { status: 429, retryAfterMs: 70000 });
        return { success: true };
      }
    });
    const file = mobile ? 'mobile/src/services/telemetryService.js' : 'web/react-app/src/services/telemetryService.js';
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), context);
    const activity = () => mobile ? context.reportMobileActivity('LOGIN') : context.reportWebActivity({ force: true });
    await activity().catch(() => null);
    for (let index = 0; index < 25; index++) {
      await (mobile ? context.reportMobileSync({ pendingMutationCount: index }) : context.reportWebSync({ pendingMutationCount: index }));
      await activity();
    }
    assert.equal(calls, 1, 'screen updates do not amplify a background failure');
    clock += 69999; await activity(); assert.equal(calls, 1);
    clock++; fail = false; await activity(); assert.equal(calls, 2);
    (mobile ? context.resetMobileTelemetryState : context.resetWebTelemetryState)();
    await activity(); assert.equal(calls, 3, 'new account/login lifecycle can establish fresh telemetry');
    let rejectOld;
    context.authenticatedRequest = async () => { calls++; return new Promise((_resolve, reject) => { rejectOld = reject; }); };
    const previousAccount = activity().catch(() => null); await new Promise(resolve => setImmediate(resolve));
    (mobile ? context.resetMobileTelemetryState : context.resetWebTelemetryState)();
    context.authenticatedRequest = async () => { calls++; return { success: true }; };
    rejectOld(Object.assign(new Error('Old account cooldown'), { status: 429, retryAfterMs: 70000 })); await previousAccount;
    const before = calls; await activity();
    assert.equal(calls, before + 1, 'a late failure from the previous account cannot impose its cooldown on the new account');
  }
});

test('ordinary request throttles are not described as password attempts', () => {
  for (const code of ['', 'RATE_LIMITED', 'USER_RATE_LIMITED', 'GLOBAL_RATE_LIMITED']) {
    const result = createSafeErrorEnvelope({ status: 429, payload: { code }, req: { method: 'GET', originalUrl: '/api/fields' } });
    assert.doesNotMatch(result.message, /attempts/i); assert.match(result.message, /requests/i);
  }
  assert.match(createSafeErrorEnvelope({ status: 429, payload: { code: 'PASSWORD_CHECK_RATE_LIMITED' } }).message, /incorrect password attempts/i);
});
