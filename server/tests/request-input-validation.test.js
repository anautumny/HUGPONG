'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateRequestInput } = require('../middleware/requestInputValidation');
const { normalizeCustomStages } = require('../domain/customStages');

const root = path.resolve(__dirname, '..', '..');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function validate(overrides = {}) {
  const body = overrides.body ?? {};
  const serialized = JSON.stringify(body);
  const req = {
    method: 'POST',
    originalUrl: '/api/test',
    query: {},
    body,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(serialized)),
      'x-client-platform': 'web'
    },
    is(type) { return String(this.headers['content-type'] || '').split(';', 1)[0].toLowerCase() === type ? type : false; },
    ...overrides
  };
  const res = responseRecorder();
  let continued = false;
  validateRequestInput(req, res, () => { continued = true; });
  return { req, res, continued };
}

test('safe JSON objects pass the global request validation boundary', () => {
  const result = validate({ body: { fieldId: 'FLD-1', amount: 12.5, items: [{ name: 'Fertilizer' }] } });
  assert.equal(result.continued, true);
  assert.equal(result.req.inputValidated, true);
});

test('GET requests without a transport body pass when Express initializes an empty body object', () => {
  const result = validate({
    method: 'GET',
    body: {},
    headers: { 'x-client-platform': 'web' }
  });
  assert.equal(result.continued, true);
  assert.equal(result.req.inputValidated, true);
});

test('unsafe structure, malformed headers, and read bodies fail before route logic', () => {
  const polluted = JSON.parse('{"__proto__":{"admin":true}}');
  const cases = [
    validate({ body: polluted }),
    validate({ headers: { 'content-type': 'text/plain', 'content-length': '2', 'x-client-platform': 'web' } }),
    validate({ method: 'GET', body: { hidden: true } }),
    validate({ headers: { 'content-type': 'application/json', 'content-length': '2', 'x-client-platform': 'desktop' } }),
    validate({ originalUrl: '/api/%ZZ' })
  ];
  for (const result of cases) {
    assert.equal(result.continued, false);
    assert.equal(result.res.statusCode, 400);
    assert.ok(result.res.body.code);
  }
});

test('custom stage input is rebuilt from validated canonical fields', () => {
  const [stage] = normalizeCustomStages([{
    id: 'custom-1', stageNumber: 1, name: 'Preparation', color: '#123ABC',
    benchmarkCost: 100, done: false, active: true, injected: 'discard me', operations: []
  }]);
  assert.equal(stage.name, 'Preparation');
  assert.equal(stage.injected, undefined);
  assert.throws(() => normalizeCustomStages([{ stageNumber: 7, name: 'Invalid' }]), /unique integer/);
  assert.throws(() => normalizeCustomStages([{ stageNumber: 1, name: 'A' }, { stageNumber: 1, name: 'B' }]), /unique integer/);
});

test('the validation boundary runs before sessions, authorization, and routes', () => {
  const server = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
  const validation = server.indexOf('app.use(validateRequestInput)');
  assert.ok(validation > server.indexOf("app.use(express.json({ limit: '1mb' }))"));
  assert.ok(validation < server.indexOf('app.use(session({'));
  assert.ok(validation < server.indexOf("app.use('/auth', authRoutes)"));
  assert.ok(validation < server.indexOf("app.use('/api', requireAuth"));
  assert.doesNotMatch(server, /express\.urlencoded/);
});

test('database write routes do not persist raw request objects', () => {
  const routeFiles = fs.readdirSync(path.join(root, 'server', 'routes')).filter(file => file.endsWith('.js'));
  const source = routeFiles.map(file => fs.readFileSync(path.join(root, 'server', 'routes', file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /(?:create|set|update|add)\([^\n]*req\.body/);
  assert.doesNotMatch(source, /\.\.\.req\.body/);
  const fields = fs.readFileSync(path.join(root, 'server', 'routes', 'fields.js'), 'utf8');
  assert.match(fields, /customStages: normalizeCustomStages\(req\.body\.customStages\)/);
  assert.match(fields, /customOperations: normalizeCustomOperationsPlan\(req\.body\.customOperations \|\| \{\}\)/);
  const operations = fs.readFileSync(path.join(root, 'server', 'services', 'cropCycleOperations.js'), 'utf8');
  assert.match(operations, /changes: authoritativeChanges/);
  assert.doesNotMatch(operations, /changes: amendment\.changes/);
});
