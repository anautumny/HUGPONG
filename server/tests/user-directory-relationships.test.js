'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ASSIGNMENT_STATUS,
  resolveDirectoryAssignments,
  resolveDirectoryAssignmentsFromDatabase
} = require('../services/userDirectoryService');

const root = path.join(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const users = [
  { id: '01000001', displayName: 'Development Super Admin', role: 'SUPER_ADMIN', status: 'ACTIVE' },
  { id: '02000001', displayName: 'Development SRA Admin', role: 'SRA_ADMIN', status: 'ACTIVE' },
  { id: '03000001', displayName: 'Development Farm Manager', role: 'FARM_MANAGER', status: 'ACTIVE' },
  { id: '04000001', displayName: 'Development Member Farmer', role: 'MEMBER_FARMER', status: 'ACTIVE' },
  { id: '04245124', displayName: 'Matt Daniel Delotavo', role: 'MEMBER_FARMER', status: 'ACTIVE' }
];
const farms = [
  { id: 'DEV-BF-001', name: 'Development Test Block Farm', managerUserId: '03000001', status: 'ACTIVE' }
];
const fields = [
  { id: 'DEV-FLD-001', blockFarmId: 'DEV-BF-001', memberUserId: '04000001', status: 'ACTIVE' }
];

function byId(records) {
  return new Map(records.map(record => [record.id, record]));
}

function fakeDatabase(collections) {
  const snapshot = (id, value) => ({ id, exists: Boolean(value), data: () => value });
  return {
    collection(name) {
      return {
        doc(id) { return { collectionName: name, id }; },
        where(fieldName, operator, values) {
          assert.equal(operator, 'in');
          return {
            async get() {
              const docs = Object.entries(collections[name] || {})
                .filter(([, value]) => values.includes(value[fieldName]))
                .map(([id, value]) => snapshot(id, value));
              return { docs };
            }
          };
        }
      };
    },
    async getAll(...refs) {
      return refs.map(ref => snapshot(ref.id, collections[ref.collectionName]?.[ref.id]));
    }
  };
}

test('canonical relationships resolve the five named development accounts', () => {
  const directory = byId(resolveDirectoryAssignments(users, farms, fields));
  assert.equal(directory.get('01000001').assignment.displayLabel, 'Central District Oversight');
  assert.equal(directory.get('02000001').assignment.displayLabel, 'SRA Regulatory Oversight');
  assert.equal(directory.get('03000001').assignment.displayLabel, 'Development Test Block Farm (Manager)');
  assert.equal(directory.get('04000001').assignment.displayLabel, 'Development Test Block Farm · DEV-FLD-001');
  assert.equal(directory.get('04245124').assignment.displayLabel, 'Unassigned');
  assert.equal(directory.get('04245124').assignment.status, ASSIGNMENT_STATUS.UNASSIGNED);
});

test('database resolver joins only canonical manager and member relationship fields', async () => {
  const database = fakeDatabase({
    block_farms: Object.fromEntries(farms.map(record => [record.id, record])),
    fields: Object.fromEntries(fields.map(record => [record.id, record]))
  });
  const directory = byId(await resolveDirectoryAssignmentsFromDatabase(database, users));
  assert.equal(directory.get('03000001').assignment.blockFarmId, 'DEV-BF-001');
  assert.equal(directory.get('04000001').assignment.fieldId, 'DEV-FLD-001');
  assert.equal(directory.get('04245124').assignment.status, ASSIGNMENT_STATUS.UNASSIGNED);
});

test('viewer scope changes counts but not shared assignment meaning', () => {
  const globalDirectory = resolveDirectoryAssignments(users, farms, fields);
  const sraDirectory = globalDirectory.filter(user => user.role !== 'SUPER_ADMIN');
  const managerDirectory = globalDirectory.filter(user => ['03000001', '04000001'].includes(user.id));

  assert.equal(globalDirectory.length, 5);
  assert.equal(sraDirectory.length, 4);
  assert.equal(managerDirectory.length, 2);
  for (const id of ['03000001', '04000001']) {
    const expected = globalDirectory.find(user => user.id === id).assignment;
    assert.deepEqual(sraDirectory.find(user => user.id === id).assignment, expected);
    assert.deepEqual(managerDirectory.find(user => user.id === id).assignment, expected);
  }
});

test('canonical relationship edits propagate without per-dashboard assignment copies', () => {
  const editedFarms = [
    { ...farms[0], managerUserId: '03000002' },
    { id: 'DEV-BF-002', name: 'Second Test Block Farm', managerUserId: '03000001', status: 'ACTIVE' }
  ];
  const editedFields = [
    { id: 'DEV-FLD-002', blockFarmId: 'DEV-BF-002', memberUserId: '04000001', status: 'ACTIVE' }
  ];
  const directory = byId(resolveDirectoryAssignments(users, editedFarms, editedFields));
  assert.equal(directory.get('03000001').assignment.displayLabel, 'Second Test Block Farm (Manager)');
  assert.equal(directory.get('04000001').assignment.displayLabel, 'Second Test Block Farm · DEV-FLD-002');
});

test('new members resolve after a canonical Field assignment and orphaned references are explicit', () => {
  const newUser = { id: '04000002', displayName: 'New Member', role: 'MEMBER_FARMER', status: 'ACTIVE' };
  const before = resolveDirectoryAssignments([newUser], farms, [])[0];
  assert.equal(before.assignment.status, ASSIGNMENT_STATUS.UNASSIGNED);

  const after = resolveDirectoryAssignments([newUser], farms, [
    { id: 'DEV-FLD-002', blockFarmId: 'DEV-BF-001', memberUserId: newUser.id, status: 'ACTIVE' }
  ])[0];
  assert.equal(after.assignment.displayLabel, 'Development Test Block Farm · DEV-FLD-002');

  const orphaned = resolveDirectoryAssignments([newUser], farms, [
    { id: 'DEV-FLD-ORPHAN', blockFarmId: 'MISSING-FARM', memberUserId: newUser.id, status: 'ACTIVE' }
  ])[0];
  assert.equal(orphaned.assignment.status, ASSIGNMENT_STATUS.ORPHANED);
  assert.match(orphaned.assignment.displayLabel, /Assignment lookup failed/);
  assert.doesNotMatch(orphaned.assignment.displayLabel, /^Unassigned$/);
});

test('the API owns assignment resolution and clients consume the same response metadata', () => {
  const route = read('server/routes/users.js');
  const webTable = read('web/react-app/src/components/users/UserTable.jsx');
  const mobileSchema = read('mobile/src/data/firestoreSchema.js');

  assert.match(route, /resolveDirectoryAssignmentsFromDatabase\(db, scopedUsers\)/);
  assert.match(webTable, /u\.assignment/);
  assert.doesNotMatch(webTable, /farmByManagerMap|fieldsByMemberMap|u\.blockFarmName/);
  assert.match(webTable, /Assignment unavailable/);
  assert.match(mobileSchema, /assignment: value\.assignment \|\| null/);
});
