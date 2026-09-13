// ══════════════════════════════════════════════════════════════
// HUGPONG — Automated Cloud Firestore Database Seeder
// Project: hugpong-ff
// ══════════════════════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDocs,
  collection,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

import { webFirebaseConfig } from './shared/firebase-init.js';

export async function seedFirestoreDatabase(force = false) {
  const app = initializeApp(webFirebaseConfig);
  const db = getFirestore(app);

  console.log('[HUGPONG Seeder] Checking Firestore collections on hugpong-ff...');

  // Check if fields collection is already populated
  const fieldsSnap = await getDocs(collection(db, 'fields'));
  if (!force && !fieldsSnap.empty) {
    console.log(`[HUGPONG Seeder] Database already populated with ${fieldsSnap.size} field plots. Skipping seed.`);
    return { status: 'already_seeded', fieldCount: fieldsSnap.size };
  }

  console.log('[HUGPONG Seeder] Seeding initial cooperative dataset to Firestore...');

  const batch = writeBatch(db);

  // 1. SEED BLOCK FARMS (Canonical Block Farm Entities)
  const initialBlockFarms = [
    { id: 'BLK-NCY-01', code: 'BLK-NCY', name: 'Nacayao Block Farm', location: 'Silay City, Negros Occidental', farmManagerId: '03000001', farmManagerName: 'Jose Reyes', declaredHa: 15.25 }
  ];

  initialBlockFarms.forEach(bf => {
    const ref = doc(db, 'block_farms', bf.id);
    batch.set(ref, { ...bf, updatedAt: new Date().toISOString() }, { merge: true });
  });

  // 2. SEED FIELDS (Relational: references blockFarmId and memberId)
  const initialFields = [
    { id: 'FLD-NCY-001', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', memberId: '04000001', memberName: 'Juan dela Cruz', ha: 1.5, stage: 'Pre-Planting & Land Preparation', stageNumber: 1, month: 0.5, batchMonth: 1, synced: true, lastSync: '15 mins ago', variety: 'VMC 84-524', soilType: 'Clay Loam', customStages: [] },
    { id: 'FLD-NCY-002', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', memberId: '04000002', memberName: 'Pedro Reyes', ha: 2.5, stage: 'Pre-Planting & Land Preparation', stageNumber: 1, month: 0.5, batchMonth: 1, synced: true, lastSync: '10 mins ago', variety: 'Phil 99-1793', soilType: 'Sandy Loam', customStages: [] },
    { id: 'FLD-NCY-003', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', memberId: '04000003', memberName: 'Corazon Santos', ha: 4.5, stage: 'Basal Nutrition & Early Care', stageNumber: 3, month: 1.2, batchMonth: 1, synced: true, lastSync: '2 hrs ago', variety: 'Phil 2006-2289', soilType: 'Clay Loam', customStages: [] },
    { id: 'FLD-NCY-004', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', memberId: '04000004', memberName: 'Roberto Tan', ha: 3.5, stage: 'Cultivation & Weed Management', stageNumber: 4, month: 2.5, batchMonth: 2, synced: true, lastSync: '1 hr ago', variety: 'VMC 84-524', soilType: 'Loam', customStages: [] },
    { id: 'FLD-NCY-005', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', memberId: '04000005', memberName: 'Ana Gomez', ha: 3.25, stage: 'Crop Maintenance & Final Hilling-Up', stageNumber: 5, month: 3.5, batchMonth: 2, synced: true, lastSync: '4 hrs ago', variety: 'Phil 99-1793', soilType: 'Clay Loam', customStages: [] },
  ];

  initialFields.forEach(f => {
    const ref = doc(db, 'fields', f.id);
    batch.set(ref, { ...f, updatedAt: new Date().toISOString() }, { merge: true });
  });

  // 3. SEED USERS DIRECTORY (8-Digit Role-Prefixed Numeric IDs)
  // 01xxxxxx: Super Admin | 02xxxxxx: SRA Admin | 03xxxxxx: Farm Manager | 04xxxxxx: Member
  const DEFAULT_SEED_PASSWORD_HASH = 'e6ae0a8605ad39ce73bcfe4eb671f4e7fd4d58ebfcc4a477adefea318db9b972'; // Salted SHA-256 for 'password123'
  const initialUsers = [
    { employeeId: '01000001', contact: '09187654321', name: 'Capstone Group (Admin)', role: 'Super Admin', roleKey: 'super_admin', blockFarmId: '', blockFarm: '', fieldId: '', regDate: '2026-01-01', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
    { employeeId: '01000002', contact: '09451774699', name: 'Project Lead', role: 'Super Admin', roleKey: 'super_admin', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: '', regDate: '2026-01-01', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
    { employeeId: '02000001', contact: '09194448888', name: 'Engr. Maria Santos', role: 'SRA (Admin)', roleKey: 'sra_admin', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: '', regDate: '2026-01-15', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
    { employeeId: '03000001', contact: '09189876543', name: 'Jose Reyes', role: 'Farm Manager', roleKey: 'farm_manager', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: '', regDate: '2026-02-01', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
    { employeeId: '04000001', contact: '09171234567', name: 'Juan dela Cruz', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: 'FLD-NCY-001', regDate: '2026-02-10', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
    { employeeId: '04000002', contact: '09179876543', name: 'Pedro Reyes', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: 'FLD-NCY-002', regDate: '2026-02-12', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
    { employeeId: '04000003', contact: '09194448889', name: 'Corazon Santos', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: 'FLD-NCY-003', regDate: '2026-02-14', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
    { employeeId: '04000004', contact: '09987654321', name: 'Roberto Tan', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: 'FLD-NCY-004', regDate: '2026-02-20', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
    { employeeId: '04000005', contact: '09555444333', name: 'Ana Gomez', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: 'FLD-NCY-005', regDate: '2026-03-01', passwordHash: DEFAULT_SEED_PASSWORD_HASH }
  ];

  initialUsers.forEach(u => {
    const docId = u.employeeId || u.contact.replace(/\D/g, '');
    const ref = doc(db, 'users', docId);
    batch.set(ref, { ...u, updatedAt: new Date().toISOString() }, { merge: true });
  });

  // 3. SEED SRA WEEKLY SUGAR & MOLASSES PRICES
  const initialPrices = [
    { id: 'PRC-2026-W04-MAY', week: 'Week 4 May', price: 2950, molasses: 4400, date: '2026-05-21', change: 70, molassesChange: 100, source: 'SRA Circular #105' },
    { id: 'PRC-2026-W03-MAY', week: 'Week 3 May', price: 2880, molasses: 4300, date: '2026-05-14', change: 80, molassesChange: 50, source: 'SRA Circular #104' },
    { id: 'PRC-2026-W02-MAY', week: 'Week 2 May', price: 2800, molasses: 4250, date: '2026-05-07', change: 50, molassesChange: 50, source: 'SRA Circular #103' },
    { id: 'PRC-2026-W01-MAY', week: 'Week 1 May', price: 2750, molasses: 4200, date: '2026-04-30', change: 50, molassesChange: 0, source: 'SRA Circular #102' },
    { id: 'PRC-2026-W04-APR', week: 'Week 4 Apr', price: 2700, molasses: 4200, date: '2026-04-23', change: 50, molassesChange: 0, source: 'SRA Circular #99' },
    { id: 'PRC-2026-W03-APR', week: 'Week 3 Apr', price: 2650, molasses: 4200, date: '2026-04-16', change: -20, molassesChange: -50, source: 'SRA Circular #98' },
    { id: 'PRC-2026-W02-APR', week: 'Week 2 Apr', price: 2670, molasses: 4250, date: '2026-04-09', change: 70, molassesChange: 50, source: 'SRA Circular #97' },
    { id: 'PRC-2026-W01-APR', week: 'Week 1 Apr', price: 2600, molasses: 4200, date: '2026-04-02', change: 50, molassesChange: 50, source: 'SRA Circular #96' }
  ];

  initialPrices.forEach(p => {
    const ref = doc(db, 'sra_prices', p.id);
    batch.set(ref, { ...p, createdAt: new Date().toISOString() }, { merge: true });
  });

  // 4. SEED OPERATION LOGS (With Standard Sub-Items Schema)
  const initialLogs = [
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
      loggedBy: 'Farmer (Juan dela Cruz)',
      loggedById: '04000001',
      subItems: [
        { id: 'SI-LOG-NCY001-001-1', description: '1st Pass Disc Plowing (Tractor)', qty: 1.5, unit: 'ha', unitCost: 5000, subTotal: 7500 },
        { id: 'SI-LOG-NCY001-001-2', description: '2nd Pass Disc Harrowing', qty: 1.5, unit: 'ha', unitCost: 4000, subTotal: 6000 },
        { id: 'SI-LOG-NCY001-001-3', description: 'Furrowing / Tudling', qty: 1.5, unit: 'ha', unitCost: 3000, subTotal: 4500 }
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
      loggedBy: 'Manager (Jose Reyes - Takeover)',
      loggedById: '03000001',
      subItems: [
        { id: 'SI-LOG-NCY002-001-1', description: 'Cane Points (Patdan - VMC 84-524)', qty: 12.5, unit: 'lac', unitCost: 3000, subTotal: 37500 }
      ]
    },
    {
      id: 'LOG-2026-NCY-004-001',
      fieldId: 'FLD-NCY-004',
      stageNumber: 1,
      stageName: 'Stage 1: Pre-Planting & Land Preparation',
      taskId: 'S1',
      sraOperationId: 'SRA-02',
      operationName: 'Land Preparation',
      activity: 'Land Preparation (Disc Plowing & Furrowing)',
      category: 'prep',
      totalCost: 42000,
      costPerHa: 12000,
      hectares: 3.5,
      people: 4,
      date: '2026-05-15',
      approved: true,
      status: 'Recorded',
      isOffline: false,
      loggedBy: 'Farmer (Pedro Reyes)',
      loggedById: '04000002',
      subItems: [
        { id: 'SI-LOG-NCY004-001-1', description: '1st Pass Disc Plowing (Tractor)', qty: 3.5, unit: 'ha', unitCost: 5000, subTotal: 17500 },
        { id: 'SI-LOG-NCY004-001-2', description: '2nd Pass Disc Harrowing', qty: 3.5, unit: 'ha', unitCost: 4000, subTotal: 14000 },
        { id: 'SI-LOG-NCY004-001-3', description: 'Furrowing / Tudling', qty: 3.5, unit: 'ha', unitCost: 3000, subTotal: 10500 }
      ]
    }
  ];

  initialLogs.forEach(l => {
    const ref = doc(db, 'operation_logs', l.id);
    batch.set(ref, { ...l, createdAt: new Date().toISOString() }, { merge: true });
  });

  // 5. SEED SUPPORT TICKETS
  const initialTickets = [
    {
      id: 'TCK-2026-00801',
      title: 'Offline Log Sync Failure after 3 days offline',
      author: 'Juan dela Cruz (Member)',
      blockFarm: 'Nacayao Block Farm',
      category: 'Offline Sync',
      priority: 'High',
      status: 'Open',
      date: '2026-05-23',
      details: 'Completed 3 manual weeding and fertilization logs while in northern field without 4G. Logs remain in device queue after Wi-Fi reconnection.',
      resolutionNotes: '',
      createdAt: new Date().toISOString()
    },
    {
      id: 'TCK-2026-00802',
      title: 'Plot Boundary Hectarage Discrepancy',
      author: 'Jose Reyes (Farm Manager)',
      blockFarm: 'Nacayao Block Farm',
      category: 'Field Boundary',
      priority: 'Medium',
      status: 'In Progress',
      date: '2026-05-22',
      details: 'FLD-NCY-002 surveyed area is 2.5 Ha but satellite map boundary shows overlap with adjacent plot.',
      resolutionNotes: 'Re-survey coordinates dispatched to Silay surveyor.',
      createdAt: new Date().toISOString()
    }
  ];

  initialTickets.forEach(t => {
    const ref = doc(db, 'support_tickets', t.id);
    batch.set(ref, { ...t, createdAt: new Date().toISOString() }, { merge: true });
  });

  // 6. SEED AUDIT REPORTS (Monthly Certification Packages)
  const initialAuditReports = [
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
    },
    {
      id: 'RPT-2026-04-NCY01',
      reportId: 'RPT-2026-04-NCY01',
      qrHash: 'HUG-202604-B8E2',
      qrPayload: 'HUG-202604-B8E2',
      blockFarmId: 'BLK-NCY-01',
      blockFarmName: 'Nacayao Block Farm',
      period: 'April 2026',
      totalHectares: 15.25,
      totalLogs: 12,
      totalCost: 128400,
      certifiedBy: 'Engr. Maria Santos (SRA Officer)',
      certifiedRole: 'SRA (Admin)',
      certifiedAt: '2026-04-30T16:15:00Z',
      status: 'Certified',
      notes: 'Pre-planting soil tests & furrowing passes certified for Silay district plots.'
    }
  ];

  initialAuditReports.forEach(ar => {
    const ref = doc(db, 'audit_reports', ar.id);
    batch.set(ref, { ...ar, updatedAt: new Date().toISOString() }, { merge: true });
  });

  // 7. SEED AUDIT LOGS (System & Area-Linked Stream)
  const initialAuditLogs = [
    {
      id: 'AUD-2026-0001',
      category: 'audit',
      eventType: 'Report Certification',
      action: 'Report Certification',
      actorId: '02000001',
      actorName: 'Engr. Maria Santos',
      actorRole: 'SRA (Admin)',
      entityType: 'Audit Report',
      entityId: 'RPT-2026-05-NCY01',
      blockFarmId: 'BLK-NCY-01',
      blockFarm: 'Nacayao Block Farm',
      details: 'Certified May 2026 Block Farm Monthly Agronomic Report with QR Hash HUG-202605-A3F9 for 5 plots (15.25 Ha).',
      timestamp: '2026-05-30T14:30:00Z',
      status: 'Certified'
    },
    {
      id: 'AUD-2026-0002',
      category: 'plot',
      eventType: 'Field Stage Advance',
      action: 'Field Stage Advance',
      actorId: '03000001',
      actorName: 'Jose Reyes',
      actorRole: 'Farm Manager',
      entityType: 'Field Plot',
      entityId: 'FLD-NCY-002',
      blockFarmId: 'BLK-NCY-01',
      blockFarm: 'Nacayao Block Farm',
      fieldId: 'FLD-NCY-002',
      details: 'Advanced FLD-NCY-002 (Pedro Reyes, 2.5 Ha) to Stage 2: Planting & Crop Establishment.',
      timestamp: '2026-05-08T11:00:00Z',
      status: 'Recorded'
    }
  ];

  initialAuditLogs.forEach(al => {
    const ref = doc(db, 'audit_logs', al.id);
    batch.set(ref, { ...al, updatedAt: new Date().toISOString() }, { merge: true });
  });

  // 8. SEED CONNECTED MOBILE TERMINALS & DEVICE HEALTH
  const initialTerminals = [
    { id: 'SM-A146P-4567', deviceId: 'SM-A146P-4567', staff: 'Juan dela Cruz', memberId: '04000001', blockFarm: 'Nacayao Block Farm', blockFarmId: 'BLK-NCY-01', model: 'Samsung Galaxy A14', os: 'Android 14 (API 34)', appVersion: 'v1.0.0 (Build 2026.09)', battery: '88%', cachedLogs: 0, lastSync: '10 mins ago', status: 'Optimal', updatedAt: new Date().toISOString() },
    { id: 'SM-R125G-6543', deviceId: 'SM-R125G-6543', staff: 'Pedro Reyes', memberId: '04000002', blockFarm: 'Nacayao Block Farm', blockFarmId: 'BLK-NCY-01', model: 'Xiaomi Redmi 12', os: 'Android 13 (API 33)', appVersion: 'v1.0.0 (Build 2026.09)', battery: '76%', cachedLogs: 0, lastSync: '15 mins ago', status: 'Optimal', updatedAt: new Date().toISOString() },
    { id: 'SM-C550F-8889', deviceId: 'SM-C550F-8889', staff: 'Corazon Santos', memberId: '04000003', blockFarm: 'Nacayao Block Farm', blockFarmId: 'BLK-NCY-01', model: 'Realme C55', os: 'Android 13 (API 33)', appVersion: 'v1.0.0 (Build 2026.09)', battery: '64%', cachedLogs: 0, lastSync: '1 hr ago', status: 'Optimal', updatedAt: new Date().toISOString() },
    { id: 'SM-H30I-4321', deviceId: 'SM-H30I-4321', staff: 'Roberto Tan', memberId: '04000004', blockFarm: 'Nacayao Block Farm', blockFarmId: 'BLK-NCY-01', model: 'Infinix Hot 30i', os: 'Android 12 (API 32)', appVersion: 'v1.0.0 (Build 2026.09)', battery: '92%', cachedLogs: 0, lastSync: '2 hrs ago', status: 'Optimal', updatedAt: new Date().toISOString() },
    { id: 'SM-A580X-4333', deviceId: 'SM-A580X-4333', staff: 'Ana Gomez', memberId: '04000005', blockFarm: 'Nacayao Block Farm', blockFarmId: 'BLK-NCY-01', model: 'Oppo A58', os: 'Android 13 (API 33)', appVersion: 'v1.0.0 (Build 2026.09)', battery: '55%', cachedLogs: 0, lastSync: '3 hrs ago', status: 'Optimal', updatedAt: new Date().toISOString() },
    { id: 'SM-S23U-6543', deviceId: 'SM-S23U-6543', staff: 'Jose Reyes (Manager)', memberId: '03000001', blockFarm: 'Nacayao Block Farm', blockFarmId: 'BLK-NCY-01', model: 'Samsung Galaxy S23', os: 'Android 14 (API 34)', appVersion: 'v1.0.0 (Build 2026.09)', battery: '95%', cachedLogs: 0, lastSync: 'Just now', status: 'Optimal', updatedAt: new Date().toISOString() }
  ];

  initialTerminals.forEach(t => {
    const ref = doc(db, 'terminal_diagnostics', t.id);
    batch.set(ref, { ...t, updatedAt: new Date().toISOString() }, { merge: true });
  });

  // Commit all writes
  await batch.commit();
  console.log('[HUGPONG Seeder] Success! All collections seeded to Firestore (hugpong-ff).');
  return { status: 'success', seededCount: initialFields.length + initialUsers.length + initialPrices.length + initialLogs.length + initialTickets.length + initialAuditReports.length + initialAuditLogs.length + initialTerminals.length };
}

// Auto-seed on load if requested or in browser context
if (typeof window !== 'undefined') {
  window.seedFirestoreDatabase = seedFirestoreDatabase;
}
