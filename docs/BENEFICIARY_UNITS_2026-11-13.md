# Beneficiary operation units

The current operation-unit choices, in beneficiary-supplied order, are:

**HA, ton, laksa, bag, liter, pcs, strip, Sample, pass, trip**

`pcs` and `strip` are separate choices. `HA` and `Sample` retain the supplied capitalization.

## Database and API

New direct quantities, material/expense rows and custom operation plans are validated against this list by the server. Equivalent spellings normalize on new writes: `ha`/hectares to `HA`, `L`/litres to `liter`, `lac`/lacsa to `laksa`, and ordinary plural spellings to their canonical form. Quantities, prices, subtotals and area measurements are not converted.

No database migration or rewrite of existing records was performed. Historical audit snapshots and QR payload unit strings are preserved. Existing operations and plans may retain a retired unit only for the same server-loaded record/row when it remains unchanged; clients cannot grant themselves this exception. A new operation or expense using a retired unit must use a current beneficiary unit.

Offline queues and drafts are retained. Pending writes with equivalent spellings normalize through the existing serializer/server flow. Pending new work with a retired, non-equivalent unit requires an explicit correction; it is not silently reinterpreted or deleted. Labor worker/day calculations and regulated price-reference units remain separate from the general operation-unit selector.

Changed server files:

- `server/domain/operationUnits.js`
- `server/domain/operationPlan.js`
- `server/schema/firestoreSchema.js`
- `server/services/cropCycleOperations.js`
- `server/routes/fields.js`

## Web

Operation entry, amendments and takeover forms use the ten choices. Templates use `HA` and `laksa`. Restored equivalent spellings normalize for selection; a saved retired value stays visibly identified instead of displaying an unrelated default. Submission serialization normalizes new writes, while snapshot serialization preserves historical strings.

Changed Web files:

- `web/react-app/src/domain/operationUnits.js`
- `web/react-app/src/domain/operationCatalogue.js`
- `web/react-app/src/services/firestoreSchema.js`
- `web/react-app/src/components/operations/AddOperationModal.jsx`
- `web/react-app/src/components/operations/EditOperationModal.jsx`
- `web/react-app/src/views/operations/TakeOverView.jsx`

## Android

Operation and expense unit chips use the same ordered list. Equivalent saved spellings select the matching current chip. Templates and defaults use current names, and the serializer distinguishes new writes from immutable snapshots. Existing unrelated local edits and synchronization changes were retained.

Changed Mobile files:

- `mobile/src/domain/operationUnits.js`
- `mobile/src/domain/operationCatalogue.js`
- `mobile/src/data/firestoreSchema.js`
- `mobile/src/screens/FieldOpsScreen.js`

## Verification

- Server suite: **722 passed, 0 failed** (`output/beneficiary-units-server-tests.tap`).
- Web suite: **56 passed, 0 failed** (`output/beneficiary-units-web-tests.tap`).
- Nine focused unit-contract tests passed (`server/tests/beneficiary-units.test.js`, `output/beneficiary-units-tests.tap`). They cover platform parity, all ten units in quantities/expenses/plans, spelling aliases, rejection of unsupported new units, historical exceptions, unchanged numeric costs and historical snapshot strings.
- Web production build and Android development export passed (`output/beneficiary-units-web-build.txt`, `output/beneficiary-units-android-export.txt`).
- Client binding audit reported zero findings (`output/beneficiary-units-bindings.json`).
- Existing operation-workflow and UI-harness tests were updated for the new contract.

These are local source changes. Server/Web deployment and installation of an updated Android build are still required before users see the new choices. No live device or staging acceptance is claimed.
