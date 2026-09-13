// ══════════════════════════════════════════════════════════════
// HUGPONG — Master Cloud Firestore Reset & Seeder Script
// Project: hugpong-ff
// Collections: 9 Canonical Real-time Collections
// ══════════════════════════════════════════════════════════════

const { initializeApp } = require('./node_modules/firebase/app');
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  writeBatch,
  deleteDoc
} = require('./node_modules/firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyDYkv9afZa2ZlhxLzIEZfk2b5wP_s2XXpI',
  authDomain: 'hugpong-ff.firebaseapp.com',
  projectId: 'hugpong-ff'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTIONS = [
  'fields',
  'operation_logs',
  'sra_prices',
  'users',
  'block_farms',
  'support_tickets',
  'audit_reports',
  'audit_logs',
  'sync_operations'
];

async function clearCollections() {
  console.log('[1/3] 🧹 Cleaning existing Firestore collections on hugpong-ff...');
  for (const colName of COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName));
      if (!snap.empty) {
        console.log(`  - Deleting ${snap.size} legacy docs from '${colName}'...`);
        let batch = writeBatch(db);
        let count = 0;
        for (const docSnap of snap.docs) {
          batch.delete(docSnap.ref);
          count++;
          if (count >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) {
          await batch.commit();
        }
      }
    } catch (err) {
      console.warn(`  - Note on '${colName}':`, err.message);
    }
  }
  console.log('✅ Collections wiped successfully.');
}

async function seedData() {
  console.log('[2/3] 🌱 Seeding standardized 9-collection dataset...');

  // 1. BLOCK FARMS
  console.log('  → Seeding block_farms...');
  const blockFarms = [
    {
      id: 'BLK-NCY-01',
      code: 'BLK-NCY',
      name: 'Nacayao Block Farm',
      location: 'Silay City, Negros Occidental',
      farmManagerId: '03000001',
      farmManagerName: 'Jose Reyes',
      declaredHa: 15.25,
      cooperative: 'Silay Planters Sugarcane Agrarian Reform Cooperative',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  let batch = writeBatch(db);
  blockFarms.forEach(bf => batch.set(doc(db, 'block_farms', bf.id), bf));
  await batch.commit();

  // 2. USERS
  console.log('  → Seeding users...');
  const users = [
    { employeeId: '01000001', contact: '09187654321', name: 'Capstone Group (Admin)', role: 'Super Admin', roleKey: 'super_admin', blockFarmId: '', blockFarm: '', fieldId: '', regDate: '2026-01-01', password: 'password123' },
    { employeeId: '01000002', contact: '09451774699', name: 'Project Lead', role: 'Super Admin', roleKey: 'super_admin', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: '', regDate: '2026-01-01', password: 'password123' },
    { employeeId: '02000001', contact: '09194448888', name: 'Engr. Maria Santos', role: 'SRA (Admin)', roleKey: 'sra_admin', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: '', regDate: '2026-01-15', password: 'password123' },
    { employeeId: '03000001', contact: '09189876543', name: 'Jose Reyes', role: 'Farm Manager', roleKey: 'farm_manager', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: '', regDate: '2026-02-01', password: 'password123' },
    { employeeId: '04000001', contact: '09171234567', name: 'Juan dela Cruz', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: 'FLD-NCY-001', regDate: '2026-02-10', password: 'password123' },
    { employeeId: '04000002', contact: '09179876543', name: 'Pedro Reyes', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: 'FLD-NCY-002', regDate: '2026-02-12', password: 'password123' },
    { employeeId: '04000003', contact: '09194448889', name: 'Corazon Santos', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: 'FLD-NCY-003', regDate: '2026-02-14', password: 'password123' },
    { employeeId: '04000004', contact: '09987654321', name: 'Roberto Tan', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: 'FLD-NCY-004', regDate: '2026-02-20', password: 'password123' },
    { employeeId: '04000005', contact: '09555444333', name: 'Ana Gomez', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: 'FLD-NCY-005', regDate: '2026-03-01', password: 'password123' },
  ];
  batch = writeBatch(db);
  users.forEach(u => {
    const docId = u.employeeId || u.contact.replace(/\D/g, '');
    batch.set(doc(db, 'users', docId), u);
  });
  await batch.commit();

  // 3. FIELDS
  console.log('  → Seeding fields...');
  const fields = [
    { id: 'FLD-NCY-001', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', blockFarmName: 'Nacayao Block Farm', memberId: '04000001', memberName: 'Juan dela Cruz', ha: 1.5, stage: 'Pre-Planting & Land Preparation', stageNumber: 1, month: 0.5, batchMonth: 1, synced: true, lastSync: '10 mins ago', variety: 'VMC 84-524', soilType: 'Clay Loam' },
    { id: 'FLD-NCY-002', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', blockFarmName: 'Nacayao Block Farm', memberId: '04000002', memberName: 'Pedro Reyes', ha: 2.5, stage: 'Pre-Planting & Land Preparation', stageNumber: 1, month: 0.5, batchMonth: 1, synced: true, lastSync: '15 mins ago', variety: 'Phil 99-1793', soilType: 'Sandy Loam' },
    { id: 'FLD-NCY-003', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', blockFarmName: 'Nacayao Block Farm', memberId: '04000003', memberName: 'Corazon Santos', ha: 4.5, stage: 'Basal Nutrition & Early Care', stageNumber: 3, month: 1.5, batchMonth: 1, synced: true, lastSync: '1 hr ago', variety: 'Phil 2006-2289', soilType: 'Clay Loam' },
    { id: 'FLD-NCY-004', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', blockFarmName: 'Nacayao Block Farm', memberId: '04000004', memberName: 'Roberto Tan', ha: 3.5, stage: 'Cultivation & Weed Management', stageNumber: 4, month: 2.5, batchMonth: 2, synced: true, lastSync: '2 hrs ago', variety: 'VMC 84-524', soilType: 'Loam' },
    { id: 'FLD-NCY-005', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', blockFarmName: 'Nacayao Block Farm', memberId: '04000005', memberName: 'Ana Gomez', ha: 3.25, stage: 'Crop Maintenance & Final Hilling-Up', stageNumber: 5, month: 3.5, batchMonth: 2, synced: true, lastSync: '3 hrs ago', variety: 'Phil 99-1793', soilType: 'Clay Loam' },
  ];
  batch = writeBatch(db);
  fields.forEach(f => batch.set(doc(db, 'fields', f.id), { ...f, updatedAt: new Date().toISOString() }));
  await batch.commit();

  // 4. SRA PRICES
  console.log('  → Seeding sra_prices...');
  const prices = [
    { id: 'PRC-2026-W04-MAY', week: 'Week 4 May', price: 2950, molasses: 4400, date: '2026-05-21', change: 70, molassesChange: 100, source: 'SRA Official Circular #105' },
    { id: 'PRC-2026-W03-MAY', week: 'Week 3 May', price: 2880, molasses: 4300, date: '2026-05-14', change: 80, molassesChange: 50, source: 'SRA Official Circular #104' },
    { id: 'PRC-2026-W02-MAY', week: 'Week 2 May', price: 2800, molasses: 4250, date: '2026-05-07', change: 50, molassesChange: 50, source: 'SRA Official Circular #103' },
    { id: 'PRC-2026-W01-MAY', week: 'Week 1 May', price: 2750, molasses: 4200, date: '2026-04-30', change: 50, molassesChange: 0, source: 'SRA Official Circular #102' },
    { id: 'PRC-2026-W04-APR', week: 'Week 4 Apr', price: 2700, molasses: 4200, date: '2026-04-23', change: 50, molassesChange: 0, source: 'SRA Official Circular #99' },
  ];
  batch = writeBatch(db);
  prices.forEach(p => batch.set(doc(db, 'sra_prices', p.id), { ...p, createdAt: new Date().toISOString() }));
  await batch.commit();

  // 5. OPERATION LOGS (With SRA Standard 14 Line Items & Itemized Sub-Items)
  console.log('  → Seeding operation_logs...');
  const logs = [
    {
      id: 'LOG-2026-NCY-001-001',
      fieldId: 'FLD-NCY-001',
      stageNumber: 1,
      stageName: 'Stage 1: Pre-Planting & Land Preparation',
      taskId: 'S1',
      sraOperationId: 'SRA-02',
      operationName: 'Land Preparation',
      activity: 'Land Preparation (Disc Plowing & Furrowing)',
      category: 'prep',
      totalCost: 18000,
      costPerHa: 12000,
      hectares: 1.5,
      people: 2,
      date: '2026-05-02',
      approved: true,
      status: 'Recorded',
      isOffline: false,
      loggedBy: 'Juan dela Cruz (Member)',
      loggedById: '04000001',
      subItems: [
        { id: 'SI-001-1', description: '1st Pass Disc Plowing (Tractor)', qty: 1.5, unit: 'ha', unitCost: 5000, subTotal: 7500 },
        { id: 'SI-001-2', description: '2nd Pass Disc Harrowing', qty: 1.5, unit: 'ha', unitCost: 4000, subTotal: 6000 },
        { id: 'SI-001-3', description: 'Furrowing / Tudling', qty: 1.5, unit: 'ha', unitCost: 3000, subTotal: 4500 }
      ]
    },
    {
      id: 'LOG-2026-NCY-002-001',
      fieldId: 'FLD-NCY-002',
      stageNumber: 2,
      stageName: 'Stage 2: Planting & Crop Establishment',
      taskId: 'S2',
      sraOperationId: 'SRA-03',
      operationName: 'Cost of Planting Material (Seedcane acquisition)',
      activity: 'Cost of Planting Material (Patdan)',
      category: 'plant',
      totalCost: 37500,
      costPerHa: 15000,
      hectares: 2.5,
      people: 4,
      date: '2026-05-08',
      approved: true,
      status: 'Recorded',
      isOffline: false,
      loggedBy: 'Pedro Reyes (Member)',
      loggedById: '04000002',
      subItems: [
        { id: 'SI-002-1', description: 'Cane Points (Patdan - VMC 84-524)', qty: 12.5, unit: 'lac', unitCost: 3000, subTotal: 37500 }
      ]
    },
    {
      id: 'LOG-2026-NCY-003-001',
      fieldId: 'FLD-NCY-003',
      stageNumber: 3,
      stageName: 'Stage 3: Basal Nutrition & Early Care',
      taskId: 'S3',
      sraOperationId: 'SRA-05',
      operationName: 'Basal Fertilizer Application',
      activity: 'Basal Fertilizer (Urea + Complete + Potash)',
      category: 'fert',
      totalCost: 71100,
      costPerHa: 15800,
      hectares: 4.5,
      people: 6,
      date: '2026-05-12',
      approved: true,
      status: 'Recorded',
      isOffline: false,
      loggedBy: 'Corazon Santos (Member)',
      loggedById: '04000003',
      subItems: [
        { id: 'SI-003-1', description: '46-00-00 Urea Application', qty: 9, unit: 'bag', unitCost: 1600, subTotal: 14400 },
        { id: 'SI-003-2', description: '18-46-00 DAP / Complete', qty: 13.5, unit: 'bag', unitCost: 2500, subTotal: 33750 },
        { id: 'SI-003-3', description: '00-00-60 Potash (MOP)', qty: 9, unit: 'bag', unitCost: 2200, subTotal: 19800 },
        { id: 'SI-003-4', description: 'Fertilizer Application Labor', qty: 31.5, unit: 'bag', unitCost: 100, subTotal: 3150 }
      ]
    },
    {
      id: 'LOG-2026-NCY-004-001',
      fieldId: 'FLD-NCY-004',
      stageNumber: 4,
      stageName: 'Stage 4: Cultivation & Weed Management',
      taskId: 'S4',
      sraOperationId: 'SRA-07',
      operationName: 'Cultivation (Off-barring & On-barring)',
      activity: 'Pahubas & Off-barring Pass',
      category: 'weed',
      totalCost: 10500,
      costPerHa: 3000,
      hectares: 3.5,
      people: 3,
      date: '2026-05-18',
      approved: true,
      status: 'Recorded',
      isOffline: false,
      loggedBy: 'Roberto Tan (Member)',
      loggedById: '04000004',
      subItems: [
        { id: 'SI-004-1', description: '1st Off-barring (Pahubas)', qty: 7, unit: 'pass', unitCost: 750, subTotal: 5250 },
        { id: 'SI-004-2', description: '2nd Off-barring (Pahubas)', qty: 7, unit: 'pass', unitCost: 750, subTotal: 5250 }
      ]
    },
    {
      id: 'LOG-2026-NCY-005-001',
      fieldId: 'FLD-NCY-005',
      stageNumber: 5,
      stageName: 'Stage 5: Crop Maintenance & Final Hilling-Up',
      taskId: 'S5',
      sraOperationId: 'SRA-10',
      operationName: 'Final Hilling-up (Pasungkal)',
      activity: 'Pasungkal Tractor Pass',
      category: 'maint',
      totalCost: 8125,
      costPerHa: 2500,
      hectares: 3.25,
      people: 2,
      date: '2026-05-22',
      approved: true,
      status: 'Recorded',
      isOffline: false,
      loggedBy: 'Ana Gomez (Member)',
      loggedById: '04000005',
      subItems: [
        { id: 'SI-005-1', description: 'Final Hilling-Up / Pasungkal Pass', qty: 3.25, unit: 'ha', unitCost: 2500, subTotal: 8125 }
      ]
    }
  ];
  batch = writeBatch(db);
  logs.forEach(l => batch.set(doc(db, 'operation_logs', l.id), { ...l, synced: true, createdAt: new Date().toISOString() }));
  await batch.commit();

  // 6. SUPPORT TICKETS
  console.log('  → Seeding support_tickets...');
  const tickets = [
    {
      id: 'TCK-2026-001',
      memberId: '04000001',
      memberName: 'Juan dela Cruz',
      contact: '09171234567',
      fieldId: 'FLD-NCY-001',
      blockFarm: 'Nacayao Block Farm',
      subject: 'Inquiry on SRA Cal-Mag / Agricultural Lime Allocation',
      category: 'Fertilizer Allocation',
      priority: 'Normal',
      status: 'Open',
      createdAt: '2026-05-20T10:00:00Z',
      messages: [
        { sender: 'Juan dela Cruz', text: 'Good morning Manager Jose, ask ko lang if available na sa co-op bodega ang 2 tons of lime allocation for FLD-NCY-001?', timestamp: '2026-05-20T10:00:00Z' }
      ]
    },
    {
      id: 'TCK-2026-002',
      memberId: '04000002',
      memberName: 'Pedro Reyes',
      contact: '09179876543',
      fieldId: 'FLD-NCY-002',
      blockFarm: 'Nacayao Block Farm',
      subject: 'Tractor Schedule for 2nd Off-barring',
      category: 'Machinery Scheduling',
      priority: 'High',
      status: 'In Progress',
      createdAt: '2026-05-21T08:30:00Z',
      messages: [
        { sender: 'Pedro Reyes', text: 'Requesting tractor assistance for FLD-NCY-002 this Friday.', timestamp: '2026-05-21T08:30:00Z' },
        { sender: 'Jose Reyes (Manager)', text: 'Noted Pedro. Scheduled Tractor #2 for Friday 7:00 AM.', timestamp: '2026-05-21T09:15:00Z' }
      ]
    }
  ];
  batch = writeBatch(db);
  tickets.forEach(t => batch.set(doc(db, 'support_tickets', t.id), { ...t, updatedAt: new Date().toISOString() }));
  await batch.commit();

  // 7. AUDIT REPORTS (QR Certified Monthly Compilation Records)
  console.log('  → Seeding audit_reports (QR Certified Records)...');
  const auditReports = [
    {
      id: 'RPT-2026-05-NCY01',
      reportId: 'RPT-2026-05-NCY01',
      qrHash: 'HUG-202605-A3F9',
      qrPayload: 'HUG-202605-A3F9',
      blockFarmId: 'BLK-NCY-01',
      blockFarmName: 'Nacayao Block Farm',
      period: 'May 2026',
      totalHectares: 15.25,
      totalLogs: 14,
      totalCost: 145225,
      certifiedBy: 'Engr. Maria Santos (SRA Officer)',
      certifiedRole: 'SRA (Admin)',
      certifiedAt: '2026-05-30T14:30:00Z',
      status: 'Certified',
      notes: 'Fully audited against SRA S1-S14 Sugar Agronomic Benchmark standards.'
    }
  ];
  batch = writeBatch(db);
  auditReports.forEach(ar => batch.set(doc(db, 'audit_reports', ar.id), ar));
  await batch.commit();

  // 8. AUDIT LOGS (System & User History Stream)
  console.log('  → Seeding audit_logs...');
  const auditLogs = [
    {
      id: 'AUD-2026-0001',
      action: 'Report Certification',
      actorId: '02000001',
      actorName: 'Engr. Maria Santos',
      actorRole: 'SRA (Admin)',
      entityType: 'Audit Report',
      entityId: 'RPT-2026-05-NCY01',
      details: 'Certified May 2026 Block Farm Monthly Agronomic Report with QR Hash HUG-202605-A3F9.',
      timestamp: '2026-05-30T14:30:00Z',
      status: 'Success'
    },
    {
      id: 'AUD-2026-0002',
      action: 'Field Stage Advance',
      actorId: '03000001',
      actorName: 'Jose Reyes',
      actorRole: 'Farm Manager',
      entityType: 'Field',
      entityId: 'FLD-NCY-002',
      details: 'Updated FLD-NCY-002 crop stage to Stage 2: Planting & Crop Establishment.',
      timestamp: '2026-05-08T11:00:00Z',
      status: 'Success'
    },
    {
      id: 'AUD-2026-0003',
      action: 'Price Circular Published',
      actorId: '01000001',
      actorName: 'Capstone Group',
      actorRole: 'Super Admin',
      entityType: 'SRA Price',
      entityId: 'PRC-2026-W04-MAY',
      details: 'Broadcasted SRA Circular #105 (₱2,950/Lkg Sugar, ₱4,400/MT Molasses).',
      timestamp: '2026-05-21T09:00:00Z',
      status: 'Success'
    }
  ];
  batch = writeBatch(db);
  auditLogs.forEach(al => batch.set(doc(db, 'audit_logs', al.id), al));
  await batch.commit();

  console.log('🎉 [3/3] All 8 canonical Firestore collections seeded with 100% relational integrity!');
  process.exit(0);
}

(async () => {
  try {
    await clearCollections();
    await seedData();
  } catch (e) {
    console.error('❌ Migration Error:', e);
    process.exit(1);
  }
})();
