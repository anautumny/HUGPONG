'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { allowedRolesForRequest, requireApiPermission } = require('../middleware/requestPermissions');
const { ROLES } = require('../schema/firestoreSchema');

const root = path.resolve(__dirname, '../..');
const webRoot = path.join(root, 'web/react-app/src');
const mobileRequire = createRequire(path.join(root, 'mobile/package.json'));
const babel = mobileRequire('@babel/core');

// Evaluate the actual route guards and rendered navigation without starting
// Firebase, opening sessions, or performing data mutations. Effects are inert.
function navigationRuntime(roleKey) {
  const modules = new Map();
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Component: class {}, Fragment: 'Fragment', Suspense: 'Suspense',
    useState: value => [typeof value === 'function' ? value() : value, () => {}],
    useRef: value => ({ current: value }), useMemo: factory => factory(), useEffect() {},
    forwardRef: component => component, useCallback: callback => callback, useDeferredValue: value => value,
  };
  const empty = () => null;
  const auth = { useAuth: () => ({ roleKey, user: { employeeId: 'TEST' }, isLoading: false }), AuthProvider: empty };
  function load(filename) {
    if (!path.extname(filename)) filename = ['.js', '.jsx', '/index.js'].map(ext => filename + ext).find(fs.existsSync);
    if (modules.has(filename)) return modules.get(filename);
    if (filename.endsWith('.json')) return JSON.parse(fs.readFileSync(filename, 'utf8'));
    const compiled = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename, configFile: false, babelrc: false,
      plugins: [mobileRequire.resolve('@babel/plugin-transform-react-jsx'), mobileRequire.resolve('@babel/plugin-transform-modules-commonjs')],
    }).code;
    const module = { exports: {} };
    const requireMock = name => {
      if (name === 'react') return React;
      if (name === 'react-router-dom') return {
        Link: 'Link', NavLink: 'NavLink', Navigate: 'Navigate', Route: 'Route', Routes: 'Routes', BrowserRouter: 'BrowserRouter',
        useLocation: () => ({ pathname: '/dashboard' }), useNavigate: () => () => {},
      };
      if (name === 'lucide-react') return new Proxy({}, { get: (_target, key) => key });
      if (name.endsWith('/AuthContext')) return auth;
      if (name.endsWith('/ThemeContext')) return { ThemeProvider: empty, useTheme: () => ({ theme: 'light', setTheme() {} }) };
      if (name.endsWith('/SyncContext')) return { SyncProvider: empty };
      if (name.endsWith('/lazyWithRecovery')) return { lazyWithRecovery: () => empty };
      if (name.endsWith('/clientDiagnostics')) return {};
      if (name.endsWith('/pricesService')) return {};
      if (name.endsWith('/firestoreSchema')) return { fromPrice: (id, row) => ({ ...row, id }) };
      if (name.endsWith('/AppShell') || name.startsWith('./views/') || name.endsWith('/PublishPriceModal') || name.endsWith('/ConfirmDialog')) return empty;
      if (name === '../ui') return { StatusBadge: 'StatusBadge' };
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name));
      throw new Error(`Unexpected dependency: ${name}`);
    };
    new Function('require', 'module', 'exports', compiled)(requireMock, module, module.exports);
    modules.set(filename, module.exports);
    return module.exports;
  }
  return { load: relative => load(path.join(webRoot, relative)) };
}

function walk(tree, visit, render = false) {
  if (Array.isArray(tree)) return tree.forEach(child => walk(child, visit, render));
  if (!tree || typeof tree !== 'object') return;
  if (render && typeof tree.type === 'function') return walk(tree.type(tree.props), visit, render);
  visit(tree);
  walk(tree.props?.children, visit, render);
}

function routesFor(runtime) {
  const routes = new Map();
  walk(runtime.load('App.jsx').default(), node => {
    if (node.type === 'Route' && node.props.path !== '*') routes.set(node.props.path, node.props.element);
  });
  return routes;
}

function assertDestination(routes, destination, role) {
  const pathname = destination.split(/[?#]/)[0];
  assert.ok(routes.has(pathname), `${role}: missing route ${destination}`);
  const element = routes.get(pathname);
  if (element.props.allowed) {
    assert.notEqual(element.type(element.props).type, 'Navigate', `${role}: ${destination} redirects instead of opening`);
  }
}

test('dashboard, sidebar, drawer and bottom links open routes allowed for their role', () => {
  for (const [role, dashboard] of [['manager', 'FarmManagerDashboard'], ['admin', 'SraAdminDashboard'], ['superadmin', 'SuperAdminDashboard']]) {
    const runtime = navigationRuntime(role);
    const routes = routesFor(runtime);
    const fixtures = [
      ['components/layout/Sidebar.jsx', {}],
      ['components/layout/Sidebar.jsx', { isCollapsed: true }],
      ['components/layout/Sidebar.jsx', { isMobileDrawer: true }],
      ['components/layout/MobileBottomNav.jsx', {}],
      [`views/dashboard/${dashboard}.jsx`, { data: {
        auditReports: [{ status: 'PENDING_REVIEW' }], supportTickets: [{ status: 'OPEN' }],
        terminalDiagnostics: [
          { displayName: 'Member A', activity: { attentionStatus: 'CRITICAL' } },
          { displayName: 'Member B', activity: { attentionStatus: 'NEEDS_ATTENTION' } },
        ], activityMonitoringError: 'Unavailable', systemDiagnosticsError: 'Unavailable',
      } }],
    ];
    for (const [file, props] of fixtures) {
      const Component = runtime.load(file).default;
      let links = 0;
      walk({ type: Component, props }, node => {
        if (!['Link', 'NavLink'].includes(node.type)) return;
        links++;
        assertDestination(routes, node.props.to, role);
      }, true);
      assert.ok(links > 0, `${role}: ${file} renders navigation`);
    }
  }
});

test('every literal internal web navigation target has a registered route', () => {
  const routes = routesFor(navigationRuntime('manager'));
  const parser = mobileRequire('@babel/parser');
  const traverse = mobileRequire('@babel/traverse').default;
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) { inspect(filename); continue; }
      if (!filename.endsWith('.jsx')) continue;
      const ast = parser.parse(fs.readFileSync(filename, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
      const check = node => {
        const destination = node?.type === 'StringLiteral' ? node.value
          : node?.type === 'TemplateLiteral' ? node.quasis[0].value.cooked : '';
        if (destination.startsWith('/') && !destination.startsWith('//')) {
          assert.ok(routes.has(destination.split(/[?#]/)[0]), `${path.relative(webRoot, filename)}:${node.loc.start.line}: missing ${destination}`);
        }
      };
      traverse(ast, {
        JSXAttribute({ node }) { if (node.name.name === 'to') check(node.value?.expression || node.value); },
        ObjectProperty({ node }) { if (node.key.name === 'to') check(node.value); },
        CallExpression({ node }) { if (node.callee.name === 'navigate') check(node.arguments[0]); },
      });
    }
  }
  inspect(webRoot);
});

test('web price readers match the server policy and cannot publish as a Farm Manager', () => {
  for (const [role, canonicalRole] of [['manager', ROLES.FARM_MANAGER], ['admin', ROLES.SRA_ADMIN], ['superadmin', ROLES.SUPER_ADMIN]]) {
    const runtime = navigationRuntime(role);
    const priceRoute = routesFor(runtime).get('/prices');
    assert.equal(priceRoute.type(priceRoute.props).type !== 'Navigate', allowedRolesForRequest('GET', '/api/prices').includes(canonicalRole));
    let denied = false;
    let continued = false;
    const response = { status() { denied = true; return this; }, json() {} };
    requireApiPermission({ method: 'POST', originalUrl: '/api/prices', authUser: { canonicalRole } }, response, () => { continued = true; });
    assert.equal(continued, role === 'admin');
    assert.equal(denied, role !== 'admin');

    if (role === 'superadmin') continue;
    const labels = [];
    walk({ type: runtime.load('views/prices/PricesView.jsx').default, props: {} }, node => {
      labels.push(...(node.props?.children || []).flat(Infinity).filter(child => typeof child === 'string'));
    }, true);
    assert.equal(labels.includes('Publish Price Reference'), role === 'admin');
  }
  // Mobile already exposes the paginated ledger through Analytics using the
  // same server endpoint; its publishing control remains SRA-only.
  const analytics = fs.readFileSync(path.join(root, 'mobile/src/screens/AnalyticsScreen.js'), 'utf8');
  const home = fs.readFileSync(path.join(root, 'mobile/src/screens/HomeScreen.js'), 'utf8');
  assert.match(analytics, /Browse all published price records/);
  assert.match(analytics, /<PriceHistorySheet visible=\{showFullPriceHistory\}/);
  assert.match(home, /canPost=\{session\?\.role === 'SRA Admin' && isOnline\}/);
});
