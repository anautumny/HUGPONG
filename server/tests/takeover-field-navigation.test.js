'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const mobileRequire = createRequire(path.join(root, 'mobile/package.json'));
const babel = mobileRequire('@babel/core');
const { issueTakeoverGrant, verifyTakeoverGrant, TAKEOVER_GRANT_TTL_MS } = require('../security/takeoverGrant');
const actor = () => ({ employeeId: 'MANAGER-1', role: 'Farm Manager', authVersion: 1 });

function hooks() {
  const slots = [];
  let cursor = 0, effects = [], dirty = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const React = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], update => {
        const next = typeof update === 'function' ? update(slots[index]) : update;
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
      }];
    },
    useRef(initial) { return slots[cursor++] ||= { current: initial }; },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, value: factory() };
      return slots[index].value;
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      if (!same(slots[index]?.dependencies, dependencies)) {
        const previous = slots[index];
        slots[index] = { dependencies };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
      }
    }
  };
  return { React, render(component) {
    let result, passes = 0;
    do {
      assert.ok(++passes < 20, 'controller render converges');
      dirty = false; cursor = 0; effects = [];
      result = component(); effects.forEach(effect => effect());
    } while (dirty);
    return result;
  }, unmount() { slots.forEach(slot => slot?.cleanup?.()); } };
}

function controller(platform) {
  const native = platform === 'mobile', runtime = hooks();
  let clock = 100000, requestCount = 0, deferAuthorization = null;
  const timers = new Map(), alerts = [];
  class Clock extends Date { static now() { return clock; } }
  const inputs = { user: actor(), session: actor(), selectedFieldId: 'FIELD-A', selectedField: { id: 'FIELD-A' }, safeField: { id: 'FIELD-A', memberUserId: 'MEMBER' }, deviceOnline: true,
    fieldsData: { fields: [{ id: 'FIELD-A' }, { id: 'FIELD-B' }, { id: 'FIELD-C' }] } };
  const context = { inputs, React: runtime.React, ...runtime.React, Date: Clock, console,
    setTimeout: (callback, delay) => { const id = {}; timers.set(id, { callback, deadline: clock + delay }); return id; }, clearTimeout: id => timers.delete(id),
    getNetworkStatus: () => inputs.deviceOnline, operationEditorReturnTarget: null, showHistoryModal: false,
    setOperationEditorReturnTarget() {}, restoreLedgerTarget() {}, setShowHistoryModal() {}, Alert: { alert: (...args) => alerts.push(args) },
    exitConfirmOpen: false,
    setServerError() {}, setPendingSubmission() {}, setExitConfirmOpen() {}, setAuthModalOpen() {}, navigate() {},
    verifyCurrentPassword: async (_password, fieldId) => {
      requestCount++;
      if (deferAuthorization) return new Promise(resolve => { deferAuthorization.resolve = resolve; });
      return { takeoverGrant: `GRANT-${fieldId}`, takeoverGrantExpiresAt: clock + TAKEOVER_GRANT_TTL_MS };
    }
  };
  vm.createContext(context);
  vm.runInContext(read(`${native ? 'mobile' : 'web/react-app'}/src/domain/operationAuthorization.js`).replace(/export /g, ''), context);
  let code;
  if (native) {
    const source = read('mobile/src/screens/FieldOpsScreen.js');
    const start = source.indexOf('  const [takeoverSessions,');
    const end = source.indexOf('  const checkTakeOverRequired =', start);
    assert.ok(start > 0 && end > start);
    code = `const { session, selectedField, safeField, deviceOnline } = inputs;
      const sessionUserId = session.employeeId, activeRole = session.role;
      ${source.slice(start, end)}
      return { sessions: takeoverSessions, active: isTakeOver, grant: takeoverGrant, error: takeOverAuthError,
        setPassword: setTakeOverAuthPassword, authorize: handleConfirmTakeOverAuth, exit: handleInitiateTakeOver };`;
  } else {
    const source = read('web/react-app/src/views/operations/TakeOverView.jsx');
    const ast = babel.parseSync(source, { filename: 'TakeOverView.jsx', configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
    const body = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration.body.body;
    const names = new Set(['takeoverSessions', 'takeoverActorKey', 'takeoverActorRef', 'currentField', 'takeoverSession', 'isAuthorized', 'takeoverGrant', 'takeoverExpiresAt', 'confirmExit']);
    const selected = body.filter(node => {
      if (node.type === 'VariableDeclaration') return node.declarations.some(item => names.has(item.id.name) || item.id.elements?.some(part => names.has(part?.name)));
      if (node.type !== 'ExpressionStatement' || node.expression?.callee?.name !== 'useEffect') return false;
      const text = source.slice(node.start, node.end);
      return text.includes('takeoverActorRef.current') || text.includes('Object.values(takeoverSessions)');
    });
    let callback;
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'JSXOpeningElement' && node.name?.name === 'TakeOverAuthModal') callback = node.attributes.find(item => item.name?.name === 'onAuthorized').value.expression;
      Object.values(node).forEach(value => { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value); });
    }
    visit(ast.program);
    assert.ok(callback);
    code = `const { user, selectedFieldId, fieldsData } = inputs;
      const roleKey = user.role, isManager = normalizeRole(user) === 'FARM_MANAGER';
      ${selected.map(node => source.slice(node.start, node.end)).join('\n')}
      return { sessions: takeoverSessions, active: isAuthorized, grant: takeoverGrant,
        authorize: ${source.slice(callback.start, callback.end)}, exit: confirmExit };`;
  }
  const component = vm.runInContext(`(function() { ${code} })`, context);
  const render = () => runtime.render(component);
  return { context, inputs, render, timers, alerts, requests: () => requestCount, now: () => clock, unmount: runtime.unmount,
    select(fieldId) { inputs.selectedFieldId = fieldId; inputs.selectedField = { id: fieldId }; inputs.safeField = { id: fieldId, memberUserId: 'MEMBER' }; return render(); },
    async authorize() {
      let view = render();
      if (native) { view.setPassword('correct password'); view = render(); await view.authorize(); }
      else { requestCount++; view.authorize({ id: inputs.selectedFieldId }, `GRANT-${inputs.selectedFieldId}`, clock + TAKEOVER_GRANT_TTL_MS); }
      return render();
    },
    advance(milliseconds) {
      clock += milliseconds;
      for (const [id, timer] of [...timers]) if (timer.deadline <= clock) { timers.delete(id); timer.callback(); }
      return render();
    },
    defer() { deferAuthorization = {}; return deferAuthorization; }
  };
}

for (const platform of ['mobile', 'web']) {
  test(`${platform}: switching fields retains independent authorizations without extending their server deadlines`, async t => {
    const runtime = controller(platform); t.after(runtime.unmount);
    assert.equal(runtime.render().active, false);
    const first = await runtime.authorize();
    const originalExpiry = first.sessions['FIELD-A'].expiresAt;
    assert.equal(first.grant, 'GRANT-FIELD-A');
    assert.equal(runtime.select('FIELD-B').active, false, 'Field A never authorizes Field B');
    assert.equal(runtime.select('FIELD-A').grant, 'GRANT-FIELD-A');
    assert.equal(runtime.requests(), 1, 'returning to A does not verify a password again');
    runtime.advance(1000); runtime.select('FIELD-B'); await runtime.authorize();
    assert.equal(runtime.render().grant, 'GRANT-FIELD-B');
    assert.equal(Object.keys(runtime.render().sessions).length, 2);
    assert.equal(runtime.select('FIELD-A').sessions['FIELD-A'].expiresAt, originalExpiry);
    assert.equal(runtime.select('FIELD-C').active, false);
    assert.equal(runtime.select('FIELD-B').grant, 'GRANT-FIELD-B');
    runtime.advance(TAKEOVER_GRANT_TTL_MS - 1000);
    assert.equal(runtime.select('FIELD-A').active, false, 'A expires at its original deadline while browsing elsewhere');
    assert.equal(runtime.select('FIELD-B').active, true, 'B keeps its own later deadline');
    runtime.advance(1000);
    assert.equal(runtime.render().active, false); assert.equal(Object.keys(runtime.render().sessions).length, 0);
    assert.equal(runtime.requests(), 2);
  });

  test(`${platform}: explicit exit, role/owner changes and revocation version changes do not preserve authorization`, async t => {
    const runtime = controller(platform); t.after(runtime.unmount);
    await runtime.authorize(); runtime.select('FIELD-B'); await runtime.authorize(); runtime.select('FIELD-A');
    runtime.render().exit();
    if (platform === 'mobile') {
      assert.equal(runtime.render().active, true, 'opening confirmation keeps takeover active');
      const buttons = runtime.alerts.at(-1)[2];
      assert.equal(buttons[0].style, 'cancel');
      buttons[0].onPress?.();
      assert.equal(runtime.render().active, true, 'canceling keeps takeover active');
      buttons.find(button => button.style === 'destructive').onPress();
    }
    assert.equal(runtime.render().active, false);
    if (platform === 'mobile') assert.equal(runtime.select('FIELD-B').active, true, 'exiting A leaves B alone');
    else assert.equal(Object.keys(runtime.render().sessions).length, 0, 'exiting the Web takeover workspace ends its grants');
    for (const change of [{ employeeId: 'ANOTHER-MANAGER' }, { role: 'SRA Admin' }, { authVersion: 2 }]) {
      runtime.inputs.user = actor(); runtime.inputs.session = actor(); runtime.render();
      await runtime.authorize();
      runtime.inputs.user = { ...actor(), ...change }; runtime.inputs.session = { ...actor(), ...change };
      const next = runtime.render();
      assert.equal(next.active, false); assert.equal(Object.keys(next.sessions).length, 0);
    }
  });
}

test('Mobile stays view-only offline and ignores an authorization response after switching fields', async t => {
  const runtime = controller('mobile'); t.after(runtime.unmount);
  await runtime.authorize();
  runtime.inputs.deviceOnline = false;
  assert.equal(runtime.render().active, false);
  runtime.inputs.deviceOnline = true;
  assert.equal(runtime.render().active, true, 'reconnection never extends the original grant');
  runtime.select('FIELD-B'); const delayed = runtime.defer();
  let view = runtime.render(); view.setPassword('correct'); view = runtime.render();
  const pending = view.authorize();
  runtime.select('FIELD-C');
  delayed.resolve({ takeoverGrant: 'OBSOLETE-B', takeoverGrantExpiresAt: runtime.now() + TAKEOVER_GRANT_TTL_MS }); await pending;
  assert.equal(runtime.select('FIELD-B').active, false);
  assert.equal(runtime.select('FIELD-A').grant, 'GRANT-FIELD-A');
});

test('Web and Mobile retention helpers preserve signed field boundaries and expiration', () => {
  const now = Date.now(), user = actor();
  for (const directory of ['mobile', 'web/react-app']) {
    const domain = vm.runInNewContext(read(`${directory}/src/domain/operationAuthorization.js`).replace(/export /g, '')
      + '\n({ rememberFieldTakeover, fieldTakeoverSession, forgetFieldTakeover })');
    const grant = issueTakeoverGrant({ actorId: user.employeeId, fieldId: 'FIELD-A' }, now);
    const sessions = domain.rememberFieldTakeover({}, user, 'field-a', grant, now + TAKEOVER_GRANT_TTL_MS, now);
    assert.ok(verifyTakeoverGrant(sessions['FIELD-A'].grant, { actorId: user.employeeId, fieldId: 'FIELD-A', now: now + 1 }));
    assert.equal(verifyTakeoverGrant(sessions['FIELD-A'].grant, { actorId: user.employeeId, fieldId: 'FIELD-B', now: now + 1 }), null);
    assert.equal(domain.fieldTakeoverSession(sessions, user, 'FIELD-A', now + TAKEOVER_GRANT_TTL_MS), null);
    assert.throws(() => domain.rememberFieldTakeover({}, { role: 'Farm Manager' }, 'FIELD-A', grant, now + 1000, now));
    assert.throws(() => domain.rememberFieldTakeover({}, user, 'FIELD-A', '', now + 1000, now));
    assert.throws(() => domain.rememberFieldTakeover({}, user, 'FIELD-A', grant, NaN, now));
    assert.equal(domain.forgetFieldTakeover(sessions, 'FIELD-B'), sessions);
  }
});
