'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('active UI does not claim that HUGPONG records are official SRA publications', () => {
  const runtime = [
    'web/react-app/src/views/LandingView.jsx',
    'web/react-app/src/views/prices/PricesView.jsx',
    'web/react-app/src/components/prices/PublishPriceModal.jsx',
    'web/react-app/src/components/prices/CurrentPriceBanner.jsx',
    'web/react-app/src/components/prices/PriceHistoryTable.jsx',
    'web/react-app/src/components/dashboard/CurrentPriceCard.jsx',
    'mobile/src/components/PublishPriceModal.js',
    'mobile/src/components/analytics/AnalyticsComponents.js',
    'mobile/src/screens/HomeScreen.js',
    'mobile/src/screens/AnalyticsScreen.js',
    'mobile/src/screens/FieldOpsScreen.js',
    'mobile/src/services/i18n.js'
  ].map(read).join('\n');

  assert.doesNotMatch(runtime, /Official SRA|Verified SRA|SRA Verified|Official SRA Sugar & Molasses Price Monitor/i);
  assert.doesNotMatch(runtime, /Haw-Phil|HPCo hauling/i);
});

test('price source is explicit on both clients and price deltas are server-derived', () => {
  const web = read('web/react-app/src/components/prices/PublishPriceModal.jsx');
  const mobile = read('mobile/src/components/PublishPriceModal.js');
  const mobileStore = read('mobile/src/data/dataStore.js');
  const server = read('server/services/priceService.js');

  assert.match(web, /const \[source, setSource\] = useState\(''\)/);
  assert.match(mobile, /const \[source, setSource\] = useState\(''\)/);
  assert.doesNotMatch(web, /sugarPriceChange:\s*sugarChange|molassesPriceChange:\s*molassesChange/);
  assert.doesNotMatch(mobile, /sugarPriceChange:\s*sugarChange|molassesPriceChange:\s*molassesChange/);
  assert.doesNotMatch(mobileStore, /priceHistory\.unshift\(localRecord\)/);
  assert.match(mobileStore, /commitExplicitMutation\('price', publicationRequest\)[\s\S]*fromPriceDocument\(outcome\.response\.data\.id/);
  assert.match(server, /sugarPriceChange:\s*previous/);
  assert.match(server, /molassesPriceChange:\s*previous/);
});

test('dead demo labels and named-site operation samples are absent from mobile runtime', () => {
  const i18n = read('mobile/src/services/i18n.js');
  const operationCatalogue = read('mobile/src/domain/operationCatalogue.js');
  const planner = read('mobile/src/screens/PlannerScreen.js');

  assert.doesNotMatch(i18n, /profile_demo_offline|auth_demo_pin|Demo PIN Access/);
  assert.doesNotMatch(`${operationCatalogue}\n${planner}`, /Haw-Phil|HPCo hauling/i);
});
