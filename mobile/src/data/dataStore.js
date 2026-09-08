import { STORAGE_KEYS, saveItem, getItem, clearHugpongStorage, hydrateAllStorage, multiSave } from '../services/storageService';
import { initSyncEngine, enqueueOutboxItem, processOutbox, getOutboxCount, clearOutbox, flushOutboxToFirestore, generateUserNumericId, generateTicketId } from '../services/syncEngine';
import { hashPassword, verifyPassword, DEFAULT_SEED_PASSWORD_HASH, DEFAULT_MASTER_PASSWORD_HASH } from '../services/cryptoService';
import { publishTerminalTelemetry } from '../services/telemetryService';
import { db } from '../firebase/config';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';

export { hashPassword, verifyPassword, DEFAULT_SEED_PASSWORD_HASH, DEFAULT_MASTER_PASSWORD_HASH, publishTerminalTelemetry };

// ══════════════════════════════════════════════════════════════
// HUGPONG — Canonical Database Entities & Offline Working Store
// Single Canonical Source of Truth: Cloud Firestore / Server DB
// ══════════════════════════════════════════════════════════════

// ── CANONICAL DATE & DEDUPLICATION UTILITIES ────────────────
export function formatDisplayDate(dateStr) {
  if (!dateStr) return 'September 8, 2026';
  const str = String(dateStr).trim();
  if (/^[A-Za-z]+ \d{1,2}, \d{4}$/.test(str)) {
    return str;
  }
  const m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const monthIdx = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${months[monthIdx]} ${d}, ${y}`;
    }
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  return str;
}

export function toISODateString(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const str = String(dateStr).trim();
  const m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = m[1];
    const month = m[2].padStart(2, '0');
    const day = m[3].padStart(2, '0');
    return `${y}-${month}-${day}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return new Date().toISOString().split('T')[0];
}

export function cleanupDuplicateLogs(logs) {
  if (!Array.isArray(logs)) return [];
  const byId = new Map();
  for (const l of logs) {
    if (!l) continue;
    const logId = l.id || `LOG-${l.fieldId}-${l.stageNumber || 1}-${l.activity || 'op'}-${l.date || Date.now()}`;
    if (!byId.has(logId)) {
      byId.set(logId, l);
    } else {
      const existing = byId.get(logId);
      const timeExisting = new Date(existing.updatedAt || existing.createdAt || existing.date || 0).getTime();
      const timeCurrent = new Date(l.updatedAt || l.createdAt || l.date || 0).getTime();
      if (timeCurrent >= timeExisting || l.isAmended || l.isTakeover) {
        byId.set(logId, l);
      }
    }
  }
  return Array.from(byId.values());
}

export const priceHistory = [
  { id: 'PRC-2026-W04-MAY', week: 'Week 4 May', month: 'May', price: 2950, molasses: 4400, date: 'May 21, 2026', isoDate: '2026-05-21', change: 70, molassesChange: 100, source: 'SRA Official Circular #105 (HPCo Silay Millsite)', circular: 'SRA Circular #105', timestamp: 1779344400000, createdAt: '2026-05-21T09:00:00Z' },
  { id: 'PRC-2026-W03-MAY', week: 'Week 3 May', month: 'May', price: 2880, molasses: 4300, date: 'May 14, 2026', isoDate: '2026-05-14', change: 80, molassesChange: 50, source: 'SRA Official Circular #104 (HPCo Silay Millsite)', circular: 'SRA Circular #104', timestamp: 1778739600000, createdAt: '2026-05-14T09:00:00Z' },
  { id: 'PRC-2026-W02-MAY', week: 'Week 2 May', month: 'May', price: 2800, molasses: 4250, date: 'May 07, 2026', isoDate: '2026-05-07', change: 50, molassesChange: 50, source: 'SRA Official Circular #103 (HPCo Silay Millsite)', circular: 'SRA Circular #103', timestamp: 1778134800000, createdAt: '2026-05-07T09:00:00Z' },
  { id: 'PRC-2026-W01-MAY', week: 'Week 1 May', month: 'May', price: 2750, molasses: 4200, date: 'Apr 30, 2026', isoDate: '2026-04-30', change: 50, molassesChange: 0, source: 'SRA Official Circular #102 (HPCo Silay Millsite)', circular: 'SRA Circular #102', timestamp: 1777530000000, createdAt: '2026-04-30T09:00:00Z' },
  { id: 'PRC-2026-W04-APR', week: 'Week 4 Apr', month: 'Apr', price: 2700, molasses: 4200, date: 'Apr 23, 2026', isoDate: '2026-04-23', change: 50, molassesChange: 0, source: 'SRA Official Circular #99 (HPCo Silay Millsite)', circular: 'SRA Circular #99', timestamp: 1776925200000, createdAt: '2026-04-23T09:00:00Z' }
];

export const blockFarms = [
  { id: 'BLK-NCY-01', code: 'BLK-NCY', name: 'Nacayao Block Farm', association: 'Nacayao Small Farmers Association', location: 'Hda. Nacayao, Brgy. Kapitan Ramon, Silay City, Negros Occidental', farmManagerId: '03000001', farmManagerName: 'Jose Reyes', totalBlockFarmArea: 30.1118, newPlantArea: 15.25, declaredHa: 15.25 }
];

export const users = [
  { employeeId: '01000001', contact: '09187654321', name: 'Capstone Group (Admin)', role: 'Super Admin', roleKey: 'super_admin', blockFarmId: '', fieldId: '', regDate: '2026-01-01', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
  { employeeId: '01000002', contact: '09451774699', name: 'Project Lead', role: 'Super Admin', roleKey: 'super_admin', blockFarmId: 'BLK-NCY-01', fieldId: '', regDate: '2026-01-01', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
  { employeeId: '02000001', contact: '09194448888', name: 'Engr. Maria Santos', role: 'SRA (Admin)', roleKey: 'sra_admin', blockFarmId: 'BLK-NCY-01', fieldId: '', regDate: '2026-01-15', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
  { employeeId: '03000001', contact: '09189876543', name: 'Jose Reyes', role: 'Farm Manager', roleKey: 'farm_manager', blockFarmId: 'BLK-NCY-01', fieldId: '', regDate: '2026-02-01', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
  { employeeId: '04000001', contact: '09171234567', name: 'Juan dela Cruz', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', fieldId: 'FLD-NCY-001', regDate: '2026-02-10', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
  { employeeId: '04000002', contact: '09179876543', name: 'Pedro Reyes', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', fieldId: 'FLD-NCY-002', regDate: '2026-02-12', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
  { employeeId: '04000003', contact: '09194448889', name: 'Corazon Santos', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', fieldId: 'FLD-NCY-003', regDate: '2026-02-14', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
  { employeeId: '04000004', contact: '09987654321', name: 'Roberto Tan', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', fieldId: 'FLD-NCY-004', regDate: '2026-02-20', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
  { employeeId: '04000005', contact: '09555444333', name: 'Ana Gomez', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', fieldId: 'FLD-NCY-005', regDate: '2026-03-01', passwordHash: DEFAULT_SEED_PASSWORD_HASH }
];

export const SEED_FIELDS = [
  { id: 'FLD-NCY-001', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', memberId: '04000001', memberName: 'Juan dela Cruz', member: 'Juan dela Cruz', ha: 1.5, stage: 'Pre-Planting & Land Preparation', stageNumber: 1, month: 0.5, batchMonth: 1, synced: true, lastSync: '10 mins ago', variety: 'VMC 84-524', soilType: 'Clay Loam' },
  { id: 'FLD-NCY-002', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', memberId: '04000002', memberName: 'Pedro Reyes', member: 'Pedro Reyes', ha: 2.5, stage: 'Planting & Crop Establishment', stageNumber: 2, month: 1.0, batchMonth: 1, synced: true, lastSync: '15 mins ago', variety: 'Phil 99-1793', soilType: 'Sandy Loam' },
  { id: 'FLD-NCY-003', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', memberId: '04000003', memberName: 'Corazon Santos', member: 'Corazon Santos', ha: 4.5, stage: 'Basal Nutrition & Early Care', stageNumber: 3, month: 1.5, batchMonth: 1, synced: true, lastSync: '1 hr ago', variety: 'Phil 2006-2289', soilType: 'Clay Loam' },
  { id: 'FLD-NCY-004', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', memberId: '04000004', memberName: 'Roberto Tan', member: 'Roberto Tan', ha: 3.5, stage: 'Cultivation & Weed Management', stageNumber: 4, month: 2.5, batchMonth: 2, synced: true, lastSync: '2 hrs ago', variety: 'VMC 84-524', soilType: 'Loam' },
  { id: 'FLD-NCY-005', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', memberId: '04000005', memberName: 'Ana Gomez', member: 'Ana Gomez', ha: 3.25, stage: 'Crop Maintenance & Final Hilling-Up', stageNumber: 5, month: 3.5, batchMonth: 2, synced: true, lastSync: '3 hrs ago', variety: 'Phil 99-1793', soilType: 'Clay Loam' },
];

export const mergeFieldsWithSeeds = (incomingFields = []) => {
  const merged = SEED_FIELDS.map(seed => {
    const found = incomingFields.find(f => f.id === seed.id);
    if (!found) return { ...seed };
    const currentStageNum = (found.stageNumber != null && !isNaN(Number(found.stageNumber)) && Number(found.stageNumber) >= 1)
      ? Number(found.stageNumber)
      : (seed.stageNumber || 1);
    const stageStr = (found.stage || seed.stage || '').toLowerCase();
    // CANNOT be completed if stageNumber < 6 (e.g. stageNumber 1 after starting new cycle)
    const isCompleted = currentStageNum >= 6 && (
      found.isCompleted === true || 
      stageStr.includes('complete') || 
      stageStr.includes('milling') ||
      (Array.isArray(found.customStages) && found.customStages.length > 0 && found.customStages.every(s => s.done))
    );

    return {
      ...seed,
      ...found,
      stage: isCompleted && !stageStr.includes('complete') ? 'Harvesting & Milling (Completed)' : (found.stage || seed.stage),
      stageNumber: isCompleted ? 6 : currentStageNum,
      isCompleted: isCompleted,
      customStages: Array.isArray(found.customStages) ? found.customStages : (seed.customStages || []),
      cycleType: found.cycleType || seed.cycleType || 'Plant Cane (New Plant)',
      cropYear: found.cropYear || seed.cropYear || 'CY 2025–2026',
      cycleNumber: Number(found.cycleNumber) || 1,
      ha: Number(found.ha) || seed.ha,
      member: found.member || found.memberName || seed.member,
      memberName: found.memberName || found.member || seed.memberName,
      memberId: found.memberId || seed.memberId,
      blockFarm: found.blockFarm || seed.blockFarm,
      blockFarmId: found.blockFarmId || seed.blockFarmId,
      variety: found.variety || seed.variety,
      soilType: found.soilType || seed.soilType,
      lastSync: found.lastSync || seed.lastSync,
      synced: found.synced !== undefined ? found.synced : seed.synced,
    };
  });
  // Also preserve custom fields not in SEED_FIELDS
  (incomingFields || []).forEach(f => {
    if (f && f.id && !merged.some(m => m.id === f.id)) {
      merged.push({
        ...f,
        ha: Number(f.ha) || 1.5,
        member: f.member || f.memberName || 'Member Farmer',
        memberName: f.memberName || f.member || 'Member Farmer',
        lastSync: f.lastSync || 'Just now',
        synced: f.synced !== undefined ? f.synced : true
      });
    }
  });
  return merged;
};

export const fields = SEED_FIELDS.map(f => ({ ...f }));

export const operationLogs = [
  // ── Active Cycle Logs (CY 2025–2026) ──
  {
    id: 'LOG-2026-NCY-001-001',
    fieldId: 'FLD-NCY-001',
    blockFarm: 'Nacayao Block Farm',
    stageNumber: 1,
    stageName: 'Stage 1: Pre-Planting & Land Preparation',
    operationName: 'Land Preparation',
    activity: 'Land Preparation (Disc Plowing & Furrowing)',
    category: 'prep',
    totalCost: 18000,
    costPerHa: 12000,
    hectares: 1.5,
    people: '2',
    date: 'May 02, 2026',
    period: 'May 02, 2026',
    status: 'Recorded',
    compiled: true,
    compiledReportId: 'RPT-2026-05-NCY01',
    compiledAt: '2026-05-30T14:30:00Z',
    loggedBy: 'Juan dela Cruz (Member)',
    loggedById: '04000001',
    subItems: [
      { id: 'SI-001-1', description: '1st Pass Disc Plowing (Tractor)', qty: 1.5, unit: 'ha', unitCost: 5000, subTotal: 7500 },
      { id: 'SI-001-2', description: '2nd Pass Disc Harrowing', qty: 1.5, unit: 'ha', unitCost: 4000, subTotal: 6000 },
      { id: 'SI-001-3', description: 'Furrowing / Tudling', qty: 1.5, unit: 'ha', unitCost: 3000, subTotal: 4500 }
    ],
    isAmended: true,
    editHistory: [
      {
        id: 'EDT-2026-0504-01',
        editedBy: 'Jose Reyes (Farm Manager)',
        editedRole: 'Farm Manager',
        editedAt: 'May 04, 2026, 03:45 PM',
        reason: 'Adjusted harrowing passes to match actual tractor rental meter and attached operator labor voucher',
        previousValues: {
          cost: 15000,
          people: '1',
          activity: 'Land Preparation'
        },
        newValues: {
          cost: 18000,
          people: '2',
          activity: 'Land Preparation (Disc Plowing & Furrowing)'
        }
      }
    ]
  },
  {
    id: 'LOG-2026-NCY-002-001',
    fieldId: 'FLD-NCY-002',
    blockFarm: 'Nacayao Block Farm',
    stageNumber: 2,
    stageName: 'Stage 2: Planting & Crop Establishment',
    operationName: 'Cost of Planting Material (Seedcane acquisition)',
    activity: 'Cost of Planting Material (Patdan)',
    category: 'plant',
    totalCost: 37500,
    costPerHa: 15000,
    hectares: 2.5,
    people: '4',
    date: 'May 08, 2026',
    period: 'May 08, 2026',
    status: 'Recorded',
    compiled: true,
    compiledReportId: 'RPT-2026-05-NCY01',
    compiledAt: '2026-05-30T14:30:00Z',
    loggedBy: 'Pedro Reyes (Member)',
    loggedById: '04000002',
    subItems: [
      { id: 'SI-002-1', description: 'Cane Points (Patdan - VMC 84-524)', qty: 12.5, unit: 'lac', unitCost: 3000, subTotal: 37500 }
    ],
    editHistory: []
  },
  {
    id: 'LOG-2026-NCY-003-001',
    fieldId: 'FLD-NCY-003',
    blockFarm: 'Nacayao Block Farm',
    stageNumber: 3,
    stageName: 'Stage 3: Basal Nutrition & Early Care',
    operationName: 'Basal Fertilizer Application',
    activity: 'Basal Fertilizer (Urea + Complete + Potash)',
    category: 'fert',
    totalCost: 71100,
    costPerHa: 15800,
    hectares: 4.5,
    people: '6',
    date: 'May 12, 2026',
    period: 'May 12, 2026',
    status: 'Recorded',
    compiled: true,
    compiledReportId: 'RPT-2026-05-NCY01',
    compiledAt: '2026-05-30T14:30:00Z',
    loggedBy: 'Corazon Santos (Member)',
    loggedById: '04000003',
    subItems: [
      { id: 'SI-003-1', description: '46-00-00 Urea Application', qty: 9, unit: 'bag', unitCost: 1600, subTotal: 14400 },
      { id: 'SI-003-2', description: '18-46-00 DAP / Complete', qty: 13.5, unit: 'bag', unitCost: 2500, subTotal: 33750 },
      { id: 'SI-003-3', description: '00-00-60 Potash (MOP)', qty: 9, unit: 'bag', unitCost: 2200, subTotal: 19800 },
      { id: 'SI-003-4', description: 'Fertilizer Application Labor', qty: 31.5, unit: 'bag', unitCost: 100, subTotal: 3150 }
    ],
    editHistory: []
  },
  {
    id: 'LOG-2026-NCY-004-001',
    fieldId: 'FLD-NCY-004',
    blockFarm: 'Nacayao Block Farm',
    stageNumber: 4,
    stageName: 'Stage 4: Cultivation & Weed Management',
    operationName: 'Cultivation (Off-barring & On-barring)',
    activity: 'Pahubas & Off-barring Pass',
    category: 'weed',
    totalCost: 10500,
    costPerHa: 3000,
    hectares: 3.5,
    people: '3',
    date: 'May 18, 2026',
    period: 'May 18, 2026',
    status: 'Recorded',
    compiled: true,
    compiledReportId: 'RPT-2026-05-NCY01',
    compiledAt: '2026-05-30T14:30:00Z',
    loggedBy: 'Roberto Tan (Member)',
    loggedById: '04000004',
    subItems: [
      { id: 'SI-004-1', description: '1st Off-barring (Pahubas)', qty: 7, unit: 'pass', unitCost: 750, subTotal: 5250 },
      { id: 'SI-004-2', description: '2nd Off-barring (Pahubas)', qty: 7, unit: 'pass', unitCost: 750, subTotal: 5250 }
    ],
    editHistory: []
  },
  {
    id: 'LOG-2026-NCY-005-001',
    fieldId: 'FLD-NCY-005',
    blockFarm: 'Nacayao Block Farm',
    stageNumber: 5,
    stageName: 'Stage 5: Crop Maintenance & Final Hilling-Up',
    operationName: 'Final Hilling-up (Pasungkal)',
    activity: 'Pasungkal Tractor Pass',
    category: 'maint',
    totalCost: 8125,
    costPerHa: 2500,
    hectares: 3.25,
    people: '2',
    date: 'May 22, 2026',
    period: 'May 22, 2026',
    status: 'Recorded',
    compiled: true,
    compiledReportId: 'RPT-2026-05-NCY01',
    compiledAt: '2026-05-30T14:30:00Z',
    loggedBy: 'Ana Gomez (Member)',
    loggedById: '04000005',
    subItems: [
      { id: 'SI-005-1', description: 'Final Hilling-Up / Pasungkal Pass', qty: 3.25, unit: 'ha', unitCost: 2500, subTotal: 8125 }
    ],
    editHistory: []
  },

  // ── Past Cycle Archived Logs (CY 2024–2025 Certified History) ──
  {
    id: 'PAST-2025-NCY-001-HARV',
    fieldId: 'FLD-NCY-001',
    blockFarm: 'Nacayao Block Farm',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    operationName: 'Cutting and Loading',
    activity: 'Cane Cutting & Mill Trucking (Haw-Phil)',
    category: 'harvest',
    totalCost: 48000,
    hectares: 1.5,
    people: '8',
    date: 'Jan 15, 2025',
    period: 'Jan 15, 2025',
    status: 'Certified',
    isPastCycle: true,
    certified: true,
    archivedAt: '2025-01-20T10:00:00Z',
    loggedBy: 'Juan dela Cruz (Member)',
    loggedById: '04000001',
    subItems: [
      { id: 'PAST-SI-01', description: 'Cutting & Loading 90 Tons', qty: 90, unit: 'ton', unitCost: 450, subTotal: 40500 },
      { id: 'PAST-SI-02', description: 'Terminal Mill Flatbed Freight', qty: 1, unit: 'trip', unitCost: 7500, subTotal: 7500 }
    ],
    editHistory: []
  },
  {
    id: 'PAST-2025-NCY-002-HARV',
    fieldId: 'FLD-NCY-002',
    blockFarm: 'Nacayao Block Farm',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    operationName: 'Cutting and Loading',
    activity: 'Cane Cutting & Loading (150 Tons)',
    category: 'harvest',
    totalCost: 75000,
    hectares: 2.5,
    people: '12',
    date: 'Jan 22, 2025',
    period: 'Jan 22, 2025',
    status: 'Certified',
    isPastCycle: true,
    certified: true,
    archivedAt: '2025-01-25T10:00:00Z',
    loggedBy: 'Pedro Reyes (Member)',
    loggedById: '04000002',
    subItems: [
      { id: 'PAST-SI-03', description: 'Cutting & Loading 150 Tons', qty: 150, unit: 'ton', unitCost: 450, subTotal: 67500 },
      { id: 'PAST-SI-04', description: 'In-field Carabao Hauling Assist', qty: 1, unit: 'lot', unitCost: 7500, subTotal: 7500 }
    ],
    editHistory: []
  },
  {
    id: 'PAST-2025-NCY-003-HARV',
    fieldId: 'FLD-NCY-003',
    blockFarm: 'Nacayao Block Farm',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    operationName: 'Cutting and Loading',
    activity: 'Cane Cutting & Mill Delivery (270 Tons)',
    category: 'harvest',
    totalCost: 135000,
    hectares: 4.5,
    people: '18',
    date: 'Feb 05, 2025',
    period: 'Feb 05, 2025',
    status: 'Certified',
    isPastCycle: true,
    certified: true,
    archivedAt: '2025-02-10T10:00:00Z',
    loggedBy: 'Corazon Santos (Member)',
    loggedById: '04000003',
    subItems: [
      { id: 'PAST-SI-05', description: 'Cutting & Loading 270 Tons', qty: 270, unit: 'ton', unitCost: 450, subTotal: 121500 },
      { id: 'PAST-SI-06', description: 'Mill Hauling & Scale Fee', qty: 1, unit: 'lot', unitCost: 13500, subTotal: 13500 }
    ],
    editHistory: []
  }
];

export const draftLogs = [];

export const supportTickets = [
  {
    id: 'TCK-2026-001',
    subject: 'Fertilizer Voucher Claim Status',
    memberName: 'Juan dela Cruz',
    memberId: '04000001',
    contact: '09171234567',
    fieldId: 'FLD-NCY-001',
    blockFarm: 'Nacayao Block Farm',
    category: 'Fertilizer Support',
    priority: 'Normal',
    status: 'Open',
    createdAt: '2026-05-20T10:00:00Z',
    messages: [
      { sender: 'Juan dela Cruz', text: 'Hi Manager Jose, when can we claim the SRA Urea subsidised bags at the Silay warehouse for FLD-NCY-001?', timestamp: '2026-05-20T10:00:00Z' },
      { sender: 'Jose Reyes (Manager)', text: 'Warehouse release is scheduled for Thursday morning. Please bring your SRA ID card.', timestamp: '2026-05-20T11:30:00Z' }
    ]
  },
  {
    id: 'TCK-2026-002',
    subject: 'Tractor Schedule for 2nd Off-barring',
    memberName: 'Pedro Reyes',
    memberId: '04000002',
    contact: '09179876543',
    fieldId: 'FLD-NCY-002',
    blockFarm: 'Nacayao Block Farm',
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

export const auditReports = [
  // ── Monthly Certified Audit Packages ──
  {
    id: 'AUD-2026-05',
    reportId: 'RPT-2026-05-NCY01',
    month: 'May 2026',
    blockFarm: 'Nacayao Block Farm',
    blockFarmId: 'BLK-NCY-01',
    totalCost: 145225,
    fieldsReported: 5,
    logsCount: 5,
    status: 'Pending SRA',
    cloudQueueStatus: 'transmitted',
    cloudQueuedAt: '2026-05-30T14:30:00Z',
    dateGenerated: 'May 30, 2026 02:30 PM',
    qrSignature: 'HUG-202605-A3F9',
    verifiedBy: 'Pending SRA Inspector Review',
    notes: 'Compiled by Farm Manager Jose Reyes. Transmitted to SRA District Cloud Queue for Official SRA Review & Certification.',
    stageBreakdown: [
      { stage: 'Stage 1: Pre-Planting & Land Preparation', cost: 18000, pct: '12%', fields: 'FLD-NCY-001 (Juan dela Cruz - 1.5 Ha)' },
      { stage: 'Stage 2: Planting & Crop Establishment', cost: 37500, pct: '26%', fields: 'FLD-NCY-002 (Pedro Reyes - 2.5 Ha)' },
      { stage: 'Stage 3: Basal Nutrition & Early Care', cost: 71100, pct: '49%', fields: 'FLD-NCY-003 (Corazon Santos - 4.5 Ha)' },
      { stage: 'Stage 4: Cultivation & Weed Management', cost: 10500, pct: '7%', fields: 'FLD-NCY-004 (Roberto Tan - 3.5 Ha)' },
      { stage: 'Stage 5: Crop Maintenance & Final Hilling-Up', cost: 8125, pct: '6%', fields: 'FLD-NCY-005 (Ana Gomez - 3.25 Ha)' }
    ]
  },
  {
    id: 'AUD-2026-04',
    reportId: 'RPT-2026-04-NCY01',
    month: 'April 2026',
    blockFarm: 'Nacayao Block Farm',
    blockFarmId: 'BLK-NCY-01',
    totalCost: 128400,
    fieldsReported: 5,
    logsCount: 6,
    status: 'Certified',
    cloudQueueStatus: 'transmitted',
    cloudQueuedAt: '2026-04-30T16:15:00Z',
    dateGenerated: 'Apr 30, 2026 04:15 PM',
    qrSignature: 'HUG-202604-B8E2',
    verifiedBy: 'Engr. Maria Santos (SRA Officer)',
    notes: 'Pre-planting soil tests & furrowing passes certified for Silay district plots.',
    stageBreakdown: [
      { stage: 'Stage 1: Pre-Planting & Land Preparation', cost: 68400, pct: '53%', fields: 'FLD-NCY-001, FLD-NCY-002, FLD-NCY-003' },
      { stage: 'Stage 2: Planting Material Acquisition', cost: 60000, pct: '47%', fields: 'FLD-NCY-004, FLD-NCY-005' }
    ]
  },
  {
    id: 'AUD-2026-03',
    reportId: 'RPT-2026-03-NCY01',
    month: 'March 2026',
    blockFarm: 'Nacayao Block Farm',
    blockFarmId: 'BLK-NCY-01',
    totalCost: 94500,
    fieldsReported: 5,
    logsCount: 5,
    status: 'Certified',
    cloudQueueStatus: 'transmitted',
    cloudQueuedAt: '2026-03-31T15:00:00Z',
    dateGenerated: 'Mar 31, 2026 03:00 PM',
    qrSignature: 'HUG-202603-C1D4',
    verifiedBy: 'Engr. Maria Santos (SRA Officer)',
    notes: 'Trash blanketing and stubble shaving audit completed.',
    stageBreakdown: [
      { stage: 'Stage 1: Field Clearing & Stubble Shaving', cost: 94500, pct: '100%', fields: 'All 5 Plots (15.25 Ha)' }
    ]
  }
];

export const systemHistory = [
  // ── Area & Plot Level System Audit Events ──
  {
    id: 'AUD-2026-0001',
    category: 'audit',
    action: 'Report Certification',
    eventType: 'Report Certification',
    actorId: '02000001',
    actorName: 'Engr. Maria Santos',
    actorRole: 'SRA (Admin)',
    entityType: 'Audit Report',
    entityId: 'RPT-2026-05-NCY01',
    blockFarmId: 'BLK-NCY-01',
    blockFarm: 'Nacayao Block Farm',
    details: 'Certified May 2026 Block Farm Monthly Agronomic Report with QR Hash HUG-202605-A3F9 for 5 plots (15.25 Ha).',
    timestamp: 'May 30, 2026, 02:30 PM',
    isoDate: '2026-05-30T14:30:00Z',
    status: 'Certified'
  },
  {
    id: 'AUD-2026-0002',
    category: 'plot',
    action: 'Field Stage Advance',
    eventType: 'Field Stage Advance',
    actorId: '03000001',
    actorName: 'Jose Reyes',
    actorRole: 'Farm Manager',
    entityType: 'Field Plot',
    entityId: 'FLD-NCY-002',
    blockFarmId: 'BLK-NCY-01',
    blockFarm: 'Nacayao Block Farm',
    fieldId: 'FLD-NCY-002',
    details: 'Advanced FLD-NCY-002 (Pedro Reyes, 2.5 Ha) to Stage 2: Planting & Crop Establishment.',
    timestamp: 'May 08, 2026, 11:00 AM',
    isoDate: '2026-05-08T11:00:00Z',
    status: 'Recorded'
  },
  {
    id: 'AUD-2026-0003',
    category: 'sra',
    action: 'Price Circular Published',
    eventType: 'Price Circular Published',
    actorId: '01000001',
    actorName: 'Capstone Group',
    actorRole: 'Super Admin',
    entityType: 'SRA Price',
    entityId: 'PRC-2026-W04-MAY',
    blockFarmId: 'BLK-NCY-01',
    blockFarm: 'Nacayao Block Farm',
    details: 'Broadcasted SRA Circular #105 (₱2,950/Lkg Sugar, ₱4,400/MT Molasses) for Silay Mill District.',
    timestamp: 'May 21, 2026, 09:00 AM',
    isoDate: '2026-05-21T09:00:00Z',
    status: 'Recorded'
  },
  {
    id: 'AUD-2026-0004',
    category: 'plot',
    action: 'Plot Allocation & Member Assignment',
    eventType: 'Plot Allocation',
    actorId: '03000001',
    actorName: 'Jose Reyes',
    actorRole: 'Farm Manager',
    entityType: 'Field Plot',
    entityId: 'FLD-NCY-001',
    blockFarmId: 'BLK-NCY-01',
    blockFarm: 'Nacayao Block Farm',
    fieldId: 'FLD-NCY-001',
    details: 'Enrolled & Assigned plot FLD-NCY-001 (1.5 Ha, Clay Loam) to member farmer Juan dela Cruz.',
    timestamp: 'Feb 10, 2026, 08:30 AM',
    isoDate: '2026-02-10T08:30:00Z',
    status: 'Recorded'
  },
  {
    id: 'AUD-2026-0005',
    category: 'plot',
    action: 'Input Disbursement Verification',
    eventType: 'Input Disbursement',
    actorId: '03000001',
    actorName: 'Jose Reyes',
    actorRole: 'Farm Manager',
    entityType: 'Field Plot',
    entityId: 'FLD-NCY-003',
    blockFarmId: 'BLK-NCY-01',
    blockFarm: 'Nacayao Block Farm',
    fieldId: 'FLD-NCY-003',
    details: 'Verified basal fertilizer delivery (Urea, DAP, MOP) for FLD-NCY-003 (Corazon Santos, 4.5 Ha).',
    timestamp: 'May 12, 2026, 03:15 PM',
    isoDate: '2026-05-12T15:15:00Z',
    status: 'Recorded'
  }
];

export const auditLogs = auditReports; // Backward compatibility alias

export const assignmentRequests = [];

export const requestFieldAssignment = (fieldId, memberName, ha, memberId = null) => {
  const curSession = getCurrentSession();
  const newReq = {
    id: 'REQ-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    fieldId: String(fieldId || '').trim().toUpperCase(),
    member: memberName || curSession.name || 'Member',
    memberId: memberId || curSession.employeeId || curSession.id || '',
    ha: String(ha || '1.0'),
    status: 'Pending',
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  };
  assignmentRequests.unshift(newReq);
  notifyDataUpdate();
  return newReq;
};

export const resolveAssignmentRequest = (requestId, approved = true) => {
  const req = assignmentRequests.find(r => r.id === requestId);
  if (req) {
    req.status = approved ? 'Approved' : 'Rejected';
    if (approved) {
      const f = fields.find(item => item.id === req.fieldId);
      if (f) {
        f.member = req.member;
        f.memberName = req.member;
        f.owner = req.member;
        if (req.memberId) f.memberId = req.memberId;
        if (req.ha) f.ha = parseFloat(req.ha);
      } else {
        fields.push({
          id: req.fieldId,
          name: `Field ${req.fieldId}`,
          ha: parseFloat(req.ha) || 1.0,
          cropCycle: 'CY 2026-2027',
          stage: 'Pre-Planting',
          member: req.member,
          memberName: req.member,
          owner: req.member,
          memberId: req.memberId || '',
          targetTons: (parseFloat(req.ha) || 1.0) * 65
        });
      }
    }
    notifyDataUpdate();
  }
  return req;
};

// ── Pending Member Registrations ──
export const pendingUsers = [
  {
    name: 'Danilo Villanueva',
    contact: '09187654321',
    role: 'Member',
    blockFarm: 'Nacayao Block Farm',
    fieldId: 'FLD-NCY-005',
    area: '1.25 Ha',
    regDate: '2026-05-28'
  },
  {
    name: 'Elena Rostro',
    contact: '09223344556',
    role: 'Member',
    blockFarm: 'Nacayao Block Farm',
    fieldId: 'FLD-NCY-006',
    area: '1.50 Ha',
    regDate: '2026-05-29'
  },
  {
    name: 'Ramon Dela Cruz',
    contact: '09334455667',
    role: 'Member',
    blockFarm: 'Silay Central Block Farm',
    fieldId: 'FLD-SC-001',
    area: '2.00 Ha',
    regDate: '2026-05-30'
  }
];

export const approvePendingRegistration = async (contact, options = {}) => {
  const cleanContact = String(contact || '').replace(/\D/g, '');
  const idx = pendingUsers.findIndex(u => (u.contact || '').replace(/\D/g, '') === cleanContact);
  if (idx === -1) return { success: false, message: 'Applicant not found in pending list.' };

  const applicant = pendingUsers[idx];
  pendingUsers.splice(idx, 1);

  // Determine plot ID & Hectares
  const assignedPlotId = options.fieldId || applicant.fieldId || `FLD-NCY-${String(fields.length + 1).padStart(3, '0')}`;
  const rawHa = options.area || applicant.area || '1.5';
  const assignedHa = parseFloat(String(rawHa).replace(/[^0-9.]/g, '')) || 1.5;
  const empId = applicant.employeeId || ('04' + cleanContact.slice(-6).padStart(6, '0'));

  // Update or create active user account
  const existingUser = users.find(u => (u.contact || '').replace(/\D/g, '') === cleanContact || u.employeeId === empId);
  if (existingUser) {
    existingUser.fieldId = assignedPlotId;
    existingUser.status = 'Active';
    existingUser.blockFarm = applicant.blockFarm || 'Nacayao Block Farm';
  } else {
    users.push({
      employeeId: empId,
      name: applicant.name,
      contact: cleanContact,
      role: applicant.role || 'Member',
      roleKey: 'member',
      blockFarmId: 'BLK-NCY-01',
      blockFarm: applicant.blockFarm || 'Nacayao Block Farm',
      fieldId: assignedPlotId,
      status: 'Active',
      regDate: applicant.regDate || new Date().toISOString().split('T')[0],
      passwordHash: hashPassword('hugpong2026')
    });
  }

  // Allocate field in fields registry
  const existingField = fields.find(f => f.id === assignedPlotId);
  if (existingField) {
    existingField.member = applicant.name;
    existingField.memberName = applicant.name;
    existingField.userId = empId;
    existingField.memberId = empId;
    existingField.memberContact = cleanContact;
    existingField.ha = assignedHa;
  } else {
    fields.push({
      id: assignedPlotId,
      name: `Field ${assignedPlotId}`,
      member: applicant.name,
      memberName: applicant.name,
      userId: empId,
      memberId: empId,
      memberContact: cleanContact,
      ha: assignedHa,
      stage: 'Pre-Planting & Land Preparation',
      stageNumber: 1,
      month: 0,
      synced: false,
      lastSync: 'Just now',
      blockFarm: applicant.blockFarm || 'Nacayao Block Farm',
      blockFarmId: 'BLK-NCY-01',
      variety: 'VMC 84-524',
      soilType: 'Clay Loam'
    });
  }

  // Persist to storage
  await saveItem(STORAGE_KEYS.PENDING_USERS, pendingUsers);
  await saveItem(STORAGE_KEYS.USERS, users);
  await saveItem(STORAGE_KEYS.FIELDS, fields);

  // Sync to Firestore if online
  if (db) {
    try {
      await setDoc(doc(db, 'users', empId), {
        employeeId: empId,
        name: applicant.name,
        contact: cleanContact,
        role: applicant.role || 'Member',
        roleKey: 'member',
        blockFarm: applicant.blockFarm || 'Nacayao Block Farm',
        fieldId: assignedPlotId,
        status: 'Active',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {}
  }

  notifyDataUpdate();
  return { success: true, applicant, fieldId: assignedPlotId };
};

export const rejectPendingRegistration = async (contact) => {
  const cleanContact = String(contact || '').replace(/\D/g, '');
  const idx = pendingUsers.findIndex(u => (u.contact || '').replace(/\D/g, '') === cleanContact);
  if (idx === -1) return { success: false, message: 'Applicant not found.' };

  pendingUsers.splice(idx, 1);
  await saveItem(STORAGE_KEYS.PENDING_USERS, pendingUsers);
  notifyDataUpdate();
  return { success: true };
};

/**
 * Unified Field Plot Persistence & Cloud Synchronization
 * Supports Adding new field plots or Editing existing allocations.
 */
export const saveFieldPlot = async (fieldData, isNew = false) => {
  if (!fieldData || !fieldData.id) return { success: false, message: 'Invalid field data' };
  
  const existingIdx = fields.findIndex(f => f.id === fieldData.id);
  const nowIso = new Date().toISOString();
  
  const seed = SEED_FIELDS.find(s => s.id === fieldData.id) || {};
  const currentF = existingIdx >= 0 ? fields[existingIdx] : {};
  const formattedField = {
    id: fieldData.id,
    blockFarmId: fieldData.blockFarmId || currentF.blockFarmId || seed.blockFarmId || 'BLK-NCY-01',
    blockFarm: fieldData.blockFarm || currentF.blockFarm || seed.blockFarm || 'Nacayao Block Farm',
    memberId: fieldData.memberId || fieldData.userId || currentF.memberId || seed.memberId || '',
    memberName: fieldData.memberName || fieldData.member || currentF.memberName || seed.memberName || 'Unassigned',
    member: fieldData.member || fieldData.memberName || currentF.member || seed.member || 'Unassigned',
    memberContact: fieldData.memberContact || currentF.memberContact || seed.memberContact || '',
    ha: Number(fieldData.ha) || currentF.ha || seed.ha || 1.5,
    stage: fieldData.stage || currentF.stage || seed.stage || 'Pre-Planting & Land Preparation',
    stageNumber: fieldData.stageNumber || currentF.stageNumber || seed.stageNumber || 1,
    isCompleted: fieldData.isCompleted !== undefined ? fieldData.isCompleted : (currentF.isCompleted !== undefined ? currentF.isCompleted : false),
    customStages: fieldData.customStages || currentF.customStages || seed.customStages || [],
    customOperations: fieldData.customOperations || currentF.customOperations || {},
    cycleType: fieldData.cycleType || currentF.cycleType || seed.cycleType || 'Plant Cane (New Plant)',
    cropYear: fieldData.cropYear || currentF.cropYear || seed.cropYear || 'CY 2025–2026',
    month: fieldData.month !== undefined ? fieldData.month : (currentF.month !== undefined ? currentF.month : (seed.month !== undefined ? seed.month : 0)),
    batchMonth: fieldData.batchMonth || currentF.batchMonth || seed.batchMonth || 1,
    synced: fieldData.synced !== undefined ? fieldData.synced : true,
    lastSync: fieldData.lastSync || currentF.lastSync || seed.lastSync || 'Just now',
    variety: fieldData.variety || currentF.variety || seed.variety || 'VMC 84-524',
    soilType: fieldData.soilType || currentF.soilType || seed.soilType || 'Clay Loam',
    createdAt: fieldData.createdAt || currentF.createdAt || nowIso,
    updatedAt: nowIso
  };

  if (existingIdx >= 0) {
    fields[existingIdx] = { ...fields[existingIdx], ...formattedField };
  } else {
    fields.push(formattedField);
  }

  // Update matching user profile fieldId in users array
  const uId = formattedField.memberId;
  const uContact = (formattedField.memberContact || '').replace(/\D/g, '');
  const matchedUser = users.find(u => 
    (uId && (u.employeeId === uId || u.contact === uId)) ||
    (uContact && u.contact.replace(/\D/g, '') === uContact)
  );

  if (matchedUser) {
    matchedUser.fieldId = formattedField.id;
    matchedUser.blockFarm = formattedField.blockFarm;
    matchedUser.blockFarmId = formattedField.blockFarmId;
  }

  // Persist to offline AsyncStorage
  await saveItem(STORAGE_KEYS.FIELDS, fields);
  await saveItem(STORAGE_KEYS.USERS, users);

  // Sync to Cloud Firestore if online
  if (db) {
    try {
      await setDoc(doc(db, 'fields', formattedField.id), formattedField, { merge: true });
      if (matchedUser && matchedUser.employeeId) {
        await setDoc(doc(db, 'users', matchedUser.employeeId), {
          fieldId: formattedField.id,
          blockFarm: formattedField.blockFarm,
          blockFarmId: formattedField.blockFarmId,
          updatedAt: nowIso
        }, { merge: true });
      }
    } catch (e) {
      console.warn('[dataStore] saveFieldPlot Firestore sync fallback to offline:', e);
    }
  }

  notifyDataUpdate();
  return { success: true, field: formattedField };
};

// Backward-compatible architectural aliases
export const MOCK_BLOCK_FARMS = blockFarms;
export const MOCK_FIELDS = fields;
export const fieldsStore = fields;
export const MOCK_LOGS = operationLogs;
export const DRAFT_LOGS = draftLogs;
export const MOCK_TICKETS = supportTickets;
export const MOCK_AUDIT_HISTORY = auditLogs;
export const MOCK_ASSIGNMENT_REQUESTS = assignmentRequests;
export const SRA_PRICE_HISTORY = priceHistory;

export {
  fields as canonicalFields,
  blockFarms as canonicalBlockFarms,
  operationLogs as canonicalLogs
};

// ── Relational Derivation Resolvers ──────────────────────────
export const findUserByIdOrContact = (inputStr) => {
  if (!inputStr) return null;
  const raw = String(inputStr).trim();
  const clean = raw.replace(/\D/g, '');

  return users.find(u => {
    const uEmp = String(u.employeeId || '').trim();
    const uEmpClean = uEmp.replace(/\D/g, '');
    const uContact = String(u.contact || '').replace(/\D/g, '');
    const uMobile = String(u.mobile || '').replace(/\D/g, '');
    const uId = String(u.id || '').trim();
    const uName = String(u.name || '').trim().toLowerCase();

    if (uEmp && (uEmp === raw || (clean && uEmpClean === clean))) return true;
    if (clean && uContact && uContact === clean) return true;
    if (clean && uMobile && uMobile === clean) return true;
    if (clean.length >= 7) {
      if (uContact.length >= 7 && (uContact.endsWith(clean) || clean.endsWith(uContact))) return true;
      if (uMobile.length >= 7 && (uMobile.endsWith(clean) || clean.endsWith(uMobile))) return true;
    }
    if (uId && (uId === raw || (clean && uId.replace(/\D/g, '') === clean))) return true;
    if (uName && uName === raw.toLowerCase()) return true;
    return false;
  }) || null;
};

export const isValidUserIdentifier = (inputStr) => {
  if (!inputStr) return false;
  const raw = String(inputStr).trim();
  const clean = raw.replace(/\D/g, '');
  if (findUserByIdOrContact(inputStr)) return true;
  if (/^0[1-4]\d{6}$/.test(raw) || /^0[1-4]\d{6}$/.test(clean)) return true;
  if (/^09\d{9}$/.test(clean) || (clean.startsWith('639') && clean.length === 12)) return true;
  return clean.length >= 7;
};

export const resolveFieldMember = (field) => {
  if (!field) return 'Unassigned';
  if (field.member && typeof field.member === 'string' && field.member.length > 0 && !field.member.startsWith('09') && !field.member.startsWith('04')) return field.member;
  const u = findUserByIdOrContact(field.memberId || field.userId || field.memberContact || field.member);
  return u ? u.name : (field.member || 'Member Farmer');
};

export const resolveFieldBlockFarm = (field) => {
  if (!field) return 'Unassigned';
  if (field.blockFarm && typeof field.blockFarm === 'string' && field.blockFarm.length > 0) return field.blockFarm;
  const bf = blockFarms.find(b => b.id === field.blockFarmId || b.code === field.blockFarmId);
  return bf ? bf.name : (field.blockFarm || (blockFarms.length > 0 ? blockFarms[0].name : 'Nacayao Block Farm'));
};

export const resolveBlockFarmManager = (blockFarm) => {
  if (!blockFarm) return 'Assigned Farm Manager';
  const u = findUserByIdOrContact(blockFarm.farmManagerId || blockFarm.managerContact || blockFarm.farmManagerName);
  if (u) return u.name;
  const mgr = users.find(u => 
    u.employeeId === blockFarm.farmManagerId || (u.role === 'Farm Manager' && (u.blockFarmId === blockFarm.id || u.blockFarm === blockFarm.name))
  );
  return mgr ? mgr.name : 'Jose Reyes';
};

// ── Deterministic Price Parsing & Sorting Helper ─────────────
function parsePriceTime(p) {
  if (p.timestamp) return p.timestamp;
  if (p.createdAt) {
    const t = new Date(p.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (p.isoDate) {
    const t = new Date(p.isoDate).getTime();
    if (!isNaN(t)) return t;
  }
  if (p.date) {
    const t = new Date(p.date).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

export const getSortedPrices = () => {
  return [...priceHistory].sort((a, b) => parsePriceTime(b) - parsePriceTime(a));
};

// ── Dynamic Current Price & Market Observation ──────────────
export const currentPrice = {
  get value() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (Number(sorted[0].price) || 0) : 0;
  },
  get change() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (Number(sorted[0].change) || 0) : 0;
  },
  get unit() { return 'Lkg'; },
  get mill() { return 'HPCo'; },
  get location() { return 'Silay'; },
  get lastUpdated() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (sorted[0].date || sorted[0].isoDate || 'Latest Circular') : 'No records';
  },
  get week() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (sorted[0].week || 'Current Week') : 'No records';
  }
};

export const currentMarketObservation = {
  get value() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (Number(sorted[0].molasses) || 0) : 0;
  },
  get change() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (Number(sorted[0].molassesChange) || 0) : 0;
  },
  get unit() { return 'MT'; },
  get lastUpdated() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (sorted[0].date || sorted[0].isoDate || 'Latest Circular') : 'No records';
  },
  get week() {
    const sorted = getSortedPrices();
    return sorted.length > 0 ? (sorted[0].week || 'Current Week') : 'No records';
  }
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const extractPriceMonth = (p) => {
  if (!p) return 'May';
  if (p.month && typeof p.month === 'string' && p.month !== 'Invalid Date') return p.month;

  // 1. Check week string (e.g., "Week 1 Sep", "Week 4 May", "Week 4 Apr")
  if (p.week && typeof p.week === 'string') {
    for (const m of MONTH_NAMES) {
      if (p.week.toLowerCase().includes(m.toLowerCase())) return m;
    }
  }

  // 2. Check date or isoDate string (e.g. "2026-09-03", "Sep 03, 2026")
  const rawDate = p.isoDate || p.date;
  if (rawDate && typeof rawDate === 'string') {
    for (const m of MONTH_NAMES) {
      if (rawDate.toLowerCase().includes(m.toLowerCase())) return m;
    }
    const parts = rawDate.split('-');
    if (parts.length >= 2) {
      const monthIdx = parseInt(parts[1], 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) return MONTH_NAMES[monthIdx];
    }
    const parsed = new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      return MONTH_NAMES[parsed.getMonth()];
    }
  }

  // 3. Check timestamp
  if (p.timestamp) {
    const parsed = new Date(Number(p.timestamp));
    if (!isNaN(parsed.getTime())) {
      return MONTH_NAMES[parsed.getMonth()];
    }
  }

  return 'May';
};

export const priceAnalytics = {
  get hasData() {
    return priceHistory.length > 0;
  },
  get months() {
    const sorted = getSortedPrices();
    if (sorted.length === 0) return ['No Data'];
    const uniqueMonths = Array.from(new Set(sorted.map(p => extractPriceMonth(p))));
    return uniqueMonths.slice(0, 6).reverse();
  },
  get weeks() {
    const sorted = getSortedPrices();
    if (sorted.length === 0) {
      return [[0], [0], [0], [0]];
    }
    const months = this.months;
    return [0, 1, 2, 3].map(wIndex => {
      return months.map(m => {
        const matching = sorted.filter(p => extractPriceMonth(p) === m);
        if (matching.length > wIndex) return Number(matching[wIndex].price) || 0;
        if (matching.length > 0) return Number(matching[0].price) || 0;
        return Number(sorted[0].price) || 0;
      });
    });
  },
  get monthlyAvg() {
    const sorted = getSortedPrices();
    if (sorted.length === 0) return 0;
    const sum = sorted.reduce((acc, p) => acc + (Number(p.price) || 0), 0);
    return Math.round(sum / sorted.length);
  },
  get cropYearPeak() {
    const sorted = getSortedPrices();
    if (sorted.length === 0) return 0;
    return Math.max(...sorted.map(p => Number(p.price) || 0));
  }
};

// Aliases for UI consumers
export const MOCK_PRICE = currentPrice;
export const MOCK_MOL = currentMarketObservation;
export const MOCK_WEEKLY_CHART = priceAnalytics;

// ── User Directory & Authentication ──────────────────────────
export const authenticateUser = (contactOrId, password) => {
  const raw = String(contactOrId || '').trim();
  const cleaned = raw.replace(/\D/g, '');

  let user = users.find(u => {
    const uContact = (u.contact || u.mobile || '').replace(/\D/g, '');
    const uEmp = String(u.employeeId || '').trim();
    const uEmpClean = uEmp.replace(/\D/g, '');
    const uId = String(u.id || '').trim();
    if (uEmp && (uEmp === raw || (cleaned && uEmpClean === cleaned))) return true;
    if (cleaned && uContact && uContact === cleaned) return true;
    if (uId && (uId === raw || (cleaned && uId.replace(/\D/g, '') === cleaned))) return true;
    return false;
  });

  if (!user) {
    const canonical = [
      { employeeId: '04000001', contact: '09171234567', name: 'Juan dela Cruz', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: 'FLD-NCY-001', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
      { employeeId: '03000001', contact: '09189876543', name: 'Jose Reyes', role: 'Farm Manager', roleKey: 'farm_manager', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: '', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
      { employeeId: '02000001', contact: '09194448888', name: 'Engr. Maria Santos', role: 'SRA (Admin)', roleKey: 'sra_admin', blockFarmId: 'BLK-NCY-01', blockFarm: 'District 3 · Silay', fieldId: '', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
      { employeeId: '01000001', contact: '09187654321', name: 'Capstone Group (Admin)', role: 'Super Admin', roleKey: 'super_admin', blockFarmId: 'BLK-NCY-01', blockFarm: 'District 3 · Silay', fieldId: '', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
    ];
    user = canonical.find(u => 
      u.contact.replace(/\D/g, '') === cleaned || 
      u.employeeId === raw || 
      (cleaned && u.employeeId.replace(/\D/g, '') === cleaned)
    );
  }

  if (!user) {
    return { success: false, error: 'Account not found. Please check your User ID (e.g. 04000001) or registered mobile number.' };
  }
  const storedHash = user.passwordHash || user.password;
  if (!verifyPassword(password, storedHash)) {
    return { success: false, error: 'Incorrect password. Please try again.' };
  }
  CURRENT_SESSION = { ...user };
  notify();
  return { success: true, user: CURRENT_SESSION };
};

export const updateUserMobileNumber = async (newMobile, passwordVerification) => {
  if (!CURRENT_SESSION) {
    return { success: false, error: 'No active user session found.' };
  }
  const cleanNew = String(newMobile || '').replace(/\D/g, '');
  if (!cleanNew.startsWith('09') || cleanNew.length !== 11) {
    if (!(cleanNew.startsWith('639') && cleanNew.length === 12)) {
      return { success: false, error: 'Please enter a valid 11-digit Philippine mobile number (09XXXXXXXXX).' };
    }
  }

  const currentContactClean = String(CURRENT_SESSION.contact || CURRENT_SESSION.mobile || '').replace(/\D/g, '');
  if (cleanNew === currentContactClean) {
    return { success: false, error: 'New mobile number cannot be the same as your current registered number.' };
  }

  const currentPassHash = CURRENT_SESSION.passwordHash || CURRENT_SESSION.password;
  if (!verifyPassword(passwordVerification, currentPassHash)) {
    return { success: false, error: 'Incorrect password verification. Please enter your account password to authorize changing your contact number.' };
  }

  const formatted = cleanNew.startsWith('639') ? '0' + cleanNew.slice(2) : cleanNew;

  CURRENT_SESSION.contact = formatted;
  if ('mobile' in CURRENT_SESSION) delete CURRENT_SESSION.mobile;

  const uEmp = String(CURRENT_SESSION.employeeId || '').trim();
  const existingInArray = users.find(u => 
    (u.employeeId && u.employeeId === uEmp) || 
    (u.contact && u.contact.replace(/\D/g, '') === currentContactClean)
  );

  if (existingInArray) {
    existingInArray.contact = formatted;
    if ('mobile' in existingInArray) delete existingInArray.mobile;
    existingInArray.updatedAt = new Date().toISOString();
  } else {
    users.push({ ...CURRENT_SESSION });
  }

  // Synchronize memberContact on user's assigned plots while preserving permanent memberId
  if (uEmp) {
    fields.forEach(f => {
      if (f.memberId === uEmp || f.userId === uEmp || f.member === CURRENT_SESSION.name) {
        f.memberContact = formatted;
      }
    });
  }

  if (db) {
    try {
      const docId = CURRENT_SESSION.employeeId || formatted;
      const userUpdatePayload = { ...CURRENT_SESSION, contact: formatted };
      delete userUpdatePayload.mobile;
      await setDoc(doc(db, 'users', docId), userUpdatePayload, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Firestore mobile update notice:', e);
    }
  }

  notify();
  return { success: true, message: 'Your registered mobile number has been updated successfully.' };
};

export const updateUserPassword = async (currentPassword, newPassword) => {
  if (!CURRENT_SESSION) {
    return { success: false, error: 'No active user session found.' };
  }
  const currentPassHash = CURRENT_SESSION.passwordHash || CURRENT_SESSION.password;
  if (!verifyPassword(currentPassword, currentPassHash)) {
    return { success: false, error: 'Incorrect current password. Please try again.' };
  }
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters long.' };
  }

  const newPassHash = hashPassword(newPassword);
  CURRENT_SESSION.passwordHash = newPassHash;
  delete CURRENT_SESSION.password;

  const uEmp = String(CURRENT_SESSION.employeeId || '').trim();
  const existingInArray = users.find(u => u.employeeId && u.employeeId === uEmp);
  if (existingInArray) {
    existingInArray.passwordHash = newPassHash;
    delete existingInArray.password;
    existingInArray.updatedAt = new Date().toISOString();
  }

  SECURITY_PREFERENCES.lastPasswordChange = new Date().toISOString().split('T')[0];

  if (db) {
    try {
      const docId = CURRENT_SESSION.employeeId || String(CURRENT_SESSION.contact || CURRENT_SESSION.mobile || '').replace(/\D/g, '');
      if (docId) {
        await setDoc(doc(db, 'users', docId), { passwordHash: newPassHash, updatedAt: new Date().toISOString() }, { merge: true });
      }
    } catch (e) {
      console.warn('[dataStore] Firestore password update notice:', e);
    }
  }

  notify();
  return { success: true, message: 'Your password has been changed successfully.' };
};

export const resetUserPasswordByIdentifier = async (identifier, newPassword) => {
  if (!identifier) return { success: false, error: 'User ID or Mobile Number required.' };
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters long.' };
  }

  const raw = String(identifier).trim();
  const clean = raw.replace(/\D/g, '');
  let user = findUserByIdOrContact(identifier);

  if (!user) {
    user = users.find(u => {
      const uContact = String(u.contact || u.mobile || '').replace(/\D/g, '');
      const uEmp = String(u.employeeId || '').trim();
      return uContact === clean || uEmp === raw || (clean && uEmp.replace(/\D/g, '') === clean);
    });
  }

  if (!user) {
    // Check canonical fallback accounts
    const canonical = [
      { employeeId: '04000001', contact: '09171234567', name: 'Juan dela Cruz', role: 'Member', roleKey: 'member', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: 'FLD-NCY-001', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
      { employeeId: '03000001', contact: '09189876543', name: 'Jose Reyes', role: 'Farm Manager', roleKey: 'farm_manager', blockFarmId: 'BLK-NCY-01', blockFarm: 'Nacayao Block Farm', fieldId: '', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
      { employeeId: '02000001', contact: '09194448888', name: 'Engr. Maria Santos', role: 'SRA (Admin)', roleKey: 'sra_admin', blockFarmId: 'BLK-NCY-01', blockFarm: 'District 3 · Silay', fieldId: '', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
      { employeeId: '01000001', contact: '09187654321', name: 'Capstone Group (Admin)', role: 'Super Admin', roleKey: 'super_admin', blockFarmId: 'BLK-NCY-01', blockFarm: 'District 3 · Silay', fieldId: '', passwordHash: DEFAULT_SEED_PASSWORD_HASH },
    ];
    user = canonical.find(u => 
      u.contact.replace(/\D/g, '') === clean || 
      u.employeeId === raw || 
      (clean && u.employeeId.replace(/\D/g, '') === clean)
    );
    if (user) {
      const cloned = { ...user };
      users.push(cloned);
      user = cloned;
    }
  }

  if (!user) {
    return { success: false, error: 'No registered account found matching this User ID or Mobile Number.' };
  }

  const newPassHash = hashPassword(newPassword);
  user.passwordHash = newPassHash;
  delete user.password;
  user.updatedAt = new Date().toISOString();

  if (CURRENT_SESSION && (CURRENT_SESSION.employeeId === user.employeeId || CURRENT_SESSION.contact === user.contact)) {
    CURRENT_SESSION.passwordHash = newPassHash;
    delete CURRENT_SESSION.password;
  }

  if (db) {
    try {
      const docId = user.employeeId || String(user.contact || user.mobile || '').replace(/\D/g, '');
      if (docId) {
        await setDoc(doc(db, 'users', docId), { passwordHash: newPassHash, updatedAt: new Date().toISOString() }, { merge: true });
      }
    } catch (e) {
      console.warn('[dataStore] Firestore reset password notice:', e);
    }
  }

  notify();
  return { success: true, message: 'Password has been reset successfully.', user };
};

export const registerUser = async (userData) => {
  const cleaned = (userData.contactNumber || '').replace(/\D/g, '');
  const numericId = generateUserNumericId('Member');
  const passHash = hashPassword(userData.password || 'password123');
  const newAccount = {
    employeeId: numericId,
    name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'New Farmer Member',
    role: 'Member',
    roleKey: 'member',
    contact: cleaned || userData.contactNumber,
    fieldId: 'Unassigned (Pending Manager Allocation)',
    blockFarmId: 'BLK-NCY-01',
    blockFarm: userData.blockFarm || 'Nacayao Block Farm',
    passwordHash: passHash,
    pendingLogs: 0,
    syncedLogs: 0,
    regDate: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString()
  };
  users.push(newAccount);
  CURRENT_SESSION = { ...newAccount };

  if (db) {
    try {
      const docId = newAccount.employeeId || cleaned;
      await setDoc(doc(db, 'users', docId), newAccount, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Failed to write user to Firestore:', e);
    }
  }

  notify();
  return { success: true, user: newAccount };
};

let CURRENT_SESSION = {
  name: 'Juan dela Cruz',
  role: 'Member',
  roleKey: 'member',
  employeeId: '04000001',
  fieldId: 'FLD-NCY-001',
  blockFarmId: 'BLK-NCY-01',
  blockFarm: 'Nacayao Block Farm',
  contact: '09171234567',
  pendingLogs: 0,
  syncedLogs: 24,
};
let IS_SYNCED = true;

export const getCurrentSession = () => CURRENT_SESSION;
export const getIsSynced = () => IS_SYNCED;

let listeners = [];

export const subscribe = (listener) => {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
};

let persistTimeout = null;
const persistAllToStorage = () => {
  if (persistTimeout) clearTimeout(persistTimeout);
  persistTimeout = setTimeout(async () => {
    try {
      await multiSave([
        [STORAGE_KEYS.SESSION, CURRENT_SESSION],
        [STORAGE_KEYS.LOGS, operationLogs],
        [STORAGE_KEYS.DRAFTS, draftLogs],
        [STORAGE_KEYS.FIELDS, fields],
        [STORAGE_KEYS.TICKETS, supportTickets],
        [STORAGE_KEYS.PREFS, SECURITY_PREFERENCES],
        [STORAGE_KEYS.PENDING_ASSIGNMENTS, assignmentRequests],
        [STORAGE_KEYS.PENDING_USERS, pendingUsers],
        [STORAGE_KEYS.AUDIT_REPORTS, auditReports],
        [STORAGE_KEYS.SYSTEM_HISTORY, systemHistory],
      ]);
    } catch (e) {
      console.warn('[dataStore] Background persistence error:', e);
    }
  }, 350);
};

const notify = () => {
  persistAllToStorage();
  listeners.forEach(l => {
    try {
      l();
    } catch (e) {
      console.warn('Subscriber error', e);
    }
  });
};

export const notifyDataUpdate = notify;

export const setSession = (role) => {
  const account = users.find(u => u.role === role);
  if (account) {
    CURRENT_SESSION = { ...account };
    notify();
  }
};

export const updateSessionFieldId = (fieldId) => {
  if (CURRENT_SESSION && CURRENT_SESSION.role === 'Member') {
    CURRENT_SESSION.fieldId = fieldId;
    notify();
  }
};

export const updateFieldStageAndCycle = async (fieldId, updates) => {
  if (!fieldId) return;
  const targetField = fields.find(f => f.id === fieldId);
  if (targetField) {
    Object.assign(targetField, updates);
  }
  saveItem(STORAGE_KEYS.FIELDS, fields);
  notify();

  if (db && fieldId) {
    try {
      const fullField = fields.find(f => f.id === fieldId);
      await setDoc(doc(db, 'fields', fieldId), fullField ? { ...fullField, ...updates } : updates, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Failed to sync field stage/cycle to Firestore:', e);
    }
  }
};

export const archiveFieldCropCycle = async (fieldId, options = {}) => {
  if (!fieldId) return;
  const cleanId = String(fieldId).trim().toUpperCase();
  const nowIso = new Date().toISOString();
  
  const targetLogs = operationLogs.filter(l => {
    const logFId = String(l.fieldId || '').trim().toUpperCase();
    return logFId === cleanId && !l.isPastCycle && !l.isArchived;
  });
  
  targetLogs.forEach(l => {
    l.isPastCycle = true;
    l.archivedAt = l.archivedAt || nowIso;
  });
  
  // Remove drafts belonging to the archived cycle
  const remainingDrafts = draftLogs.filter(d => String(d.fieldId || '').trim().toUpperCase() !== cleanId);
  draftLogs.length = 0;
  remainingDrafts.forEach(d => draftLogs.push(d));

  // Canonical reset of the field plot in dataStore to Stage 1 of the new crop cycle
  const targetField = fields.find(f => String(f.id || '').trim().toUpperCase() === cleanId);
  if (targetField) {
    const finalCycleType = options.cycleType || targetField.cycleType || 'Plant Cane (New Plant)';
    const finalCropYear = options.cropYear || targetField.cropYear || 'CY 2026–2027';
    const stage1Name = options.stage || 'Pre-Planting & Land Preparation';
    const freshCustomStages = Array.isArray(options.customStages) && options.customStages.length > 0
      ? options.customStages
      : [];

    targetField.stage = stage1Name;
    targetField.stageNumber = 1;
    targetField.isCompleted = false;
    targetField.customStages = freshCustomStages;
    targetField.cycleType = finalCycleType;
    targetField.cropYear = finalCropYear;
    targetField.cycleNumber = (Number(targetField.cycleNumber) || 1) + 1;
    targetField.lastUpdated = nowIso;
    targetField.lastSync = 'Just now';
    targetField.synced = true;
    await saveItem(STORAGE_KEYS.FIELDS, fields);
  }

  await saveItem(STORAGE_KEYS.LOGS, operationLogs);
  await saveItem(STORAGE_KEYS.DRAFTS, draftLogs);
  notify();

  if (db) {
    try {
      const updatePromises = targetLogs.map(l => 
        setDoc(doc(db, 'operation_logs', l.id), { isPastCycle: true, archivedAt: l.archivedAt }, { merge: true })
      );
      if (targetField) {
        updatePromises.push(
          setDoc(doc(db, 'fields', targetField.id), {
            stage: targetField.stage,
            stageNumber: 1,
            isCompleted: false,
            customStages: targetField.customStages,
            cycleType: targetField.cycleType,
            cropYear: targetField.cropYear,
            cycleNumber: targetField.cycleNumber,
            lastUpdated: nowIso,
            lastSync: targetField.lastSync,
            synced: true,
            updatedAt: nowIso
          }, { merge: true })
        );
      }
      await Promise.all(updatePromises);
    } catch (err) {
      console.warn('[dataStore] Error archiving logs in Firestore:', err);
    }
  }

  // Record audit history event shared with Web & Cloud
  const session = getCurrentSession();
  const actorName = session?.name ? `${session.name} (${session.role || 'Farm Manager'})` : 'Jose Reyes (Farm Manager)';
  await logSystemEvent(
    'operation',
    'Crop Cycle Renewal (Mobile)',
    fieldId,
    `Archived crop cycle and reset ${fieldId} to Stage 1: "${options?.stage || 'Pre-Planting & Land Preparation'}".`,
    actorName,
    'Completed'
  );
};

export const logSystemEvent = async (category, eventType, entity, details, actor, status = 'Recorded') => {
  const session = getCurrentSession();
  const defaultActor = session?.name ? `${session.name} (${session.role || 'Farm Manager'})` : 'Jose Reyes (Farm Manager)';
  
  let catLabel = 'System';
  if (category === 'operation') catLabel = 'Field Operation';
  else if (category === 'plot') catLabel = 'Plot Registry';
  else if (category === 'block') catLabel = 'Block Farm';
  else if (category === 'user') catLabel = 'User Management';
  else if (category === 'sra' || category === 'price' || category === 'audit') catLabel = 'SRA Price / Audit';

  const auditId = `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();
  const newEvent = {
    id: auditId,
    timestamp: now.toLocaleString('en-PH', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    createdAt: now.toISOString(),
    rawTimestamp: now.toISOString(),
    isNew: true,
    category: category || 'operation',
    categoryLabel: catLabel,
    eventType: eventType || 'System Event',
    entity: entity || 'System',
    details: details || '',
    actor: actor || defaultActor,
    status: status || 'Recorded'
  };

  const existingIdx = systemHistory.findIndex(a => a.id === auditId);
  if (existingIdx >= 0) {
    systemHistory[existingIdx] = newEvent;
  } else {
    systemHistory.unshift(newEvent);
  }

  await saveItem(STORAGE_KEYS.SYSTEM_HISTORY, systemHistory);
  notify();

  // Enqueue for background / offline outbox sync
  try {
    enqueueOutboxItem('audit_log', newEvent);
  } catch (e) {
    console.warn('[dataStore] Enqueue audit log notice:', e);
  }

  // Direct sync to Cloud Firestore if online
  if (db) {
    try {
      await setDoc(doc(db, 'audit_logs', auditId), newEvent, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Firestore audit log notice:', e);
    }
  }

  return newEvent;
};

export const deleteDraftLogs = async (draftIds = []) => {
  if (!Array.isArray(draftIds) || draftIds.length === 0) return;
  const idSet = new Set(draftIds);
  const remaining = draftLogs.filter(d => !idSet.has(d.id));
  draftLogs.length = 0;
  remaining.forEach(d => draftLogs.push(d));
  await saveItem(STORAGE_KEYS.DRAFTS, draftLogs);
  notify();
};

export const clearAllDraftsForField = async (fieldId) => {
  if (!fieldId) return;
  const remaining = draftLogs.filter(d => d.fieldId !== fieldId);
  draftLogs.length = 0;
  remaining.forEach(d => draftLogs.push(d));
  await saveItem(STORAGE_KEYS.DRAFTS, draftLogs);
  notify();
};

export const saveDraftLogs = async () => {
  await saveItem(STORAGE_KEYS.DRAFTS, draftLogs);
  notify();
};

export const isLogLocked = (log) => {
  if (!log) return false;
  return Boolean(
    log.isPastCycle || 
    log.certified || 
    log.status === 'Certified' || 
    log.status === 'Audited' || 
    log.auditStatus === 'Certified'
  );
};

export const getLogAuditTrail = (logId) => {
  const target = operationLogs.find(l => l.id === logId);
  return target && Array.isArray(target.editHistory) ? target.editHistory : [];
};

export const updateOperationLogWithSecurity = async (logId, updates, editReason, passwordVerification) => {
  if (!CURRENT_SESSION) {
    return { success: false, error: 'No active session. Please log in.' };
  }

  const targetLog = operationLogs.find(l => l.id === logId);
  if (!targetLog) {
    return { success: false, error: 'Operation log not found in local or cloud records.' };
  }

  if (isLogLocked(targetLog)) {
    return { 
      success: false, 
      error: 'Security Lockout: This operation log is part of an official certified SRA audit or archived crop cycle and cannot be modified.' 
    };
  }

  const reasonTrimmed = String(editReason || '').trim();
  if (!reasonTrimmed || reasonTrimmed.length < 3) {
    return { success: false, error: 'A valid reason for amendment or correction is required for the official audit trail.' };
  }

  // Password verification
  const currentPassHash = CURRENT_SESSION.passwordHash || CURRENT_SESSION.password;
  if (!verifyPassword(passwordVerification, currentPassHash)) {
    return { success: false, error: 'Incorrect password. Please enter your account password to authorize modifying this log.' };
  }

  // Record audit history snapshot
  const previousValues = {
    activity: targetLog.activity || targetLog.task || targetLog.operationName || '',
    cost: targetLog.totalCost != null ? targetLog.totalCost : (targetLog.cost != null ? targetLog.cost : 0),
    hectares: targetLog.hectares || '0.0',
    people: targetLog.people || '0',
    inputQty: targetLog.inputQty || '',
    inputUnit: targetLog.inputUnit || '',
    inputName: targetLog.inputName || '',
    date: targetLog.date || targetLog.period || '',
    subItems: Array.isArray(targetLog.subItems) ? JSON.parse(JSON.stringify(targetLog.subItems)) : [],
  };

  const newValues = {
    activity: updates.activity || updates.operationName || previousValues.activity,
    cost: updates.totalCost != null ? updates.totalCost : (updates.cost != null ? updates.cost : previousValues.cost),
    hectares: updates.hectares != null ? updates.hectares : previousValues.hectares,
    people: updates.people != null ? updates.people : previousValues.people,
    inputQty: updates.inputQty != null ? updates.inputQty : previousValues.inputQty,
    inputUnit: updates.inputUnit != null ? updates.inputUnit : previousValues.inputUnit,
    inputName: updates.inputName != null ? updates.inputName : previousValues.inputName,
    date: updates.date || updates.period || previousValues.date,
    subItems: Array.isArray(updates.subItems) ? JSON.parse(JSON.stringify(updates.subItems)) : previousValues.subItems,
  };

  // Check if any actual change exists between previous and new values
  const prevSI = previousValues.subItems || [];
  const newSI = newValues.subItems || [];
  let subItemsChanged = prevSI.length !== newSI.length;
  if (!subItemsChanged) {
    for (let i = 0; i < prevSI.length; i++) {
      if (
        (prevSI[i].description || '').trim() !== (newSI[i].description || '').trim() ||
        Number(prevSI[i].qty || 0) !== Number(newSI[i].qty || 0) ||
        Number(prevSI[i].unitCost || 0) !== Number(newSI[i].unitCost || 0) ||
        (prevSI[i].unit || '') !== (newSI[i].unit || '')
      ) {
        subItemsChanged = true;
        break;
      }
    }
  }

  const hasActivityChanged = (previousValues.activity || '').trim() !== (newValues.activity || '').trim();
  const hasCostChanged = Math.round(Number(previousValues.cost || 0)) !== Math.round(Number(newValues.cost || 0));
  const hasHaChanged = Math.abs(parseFloat(previousValues.hectares || 0) - parseFloat(newValues.hectares || 0)) > 0.001;
  const hasPeopleChanged = String(previousValues.people || '').trim() !== String(newValues.people || '').trim();
  const hasDateChanged = formatDisplayDate(previousValues.date) !== formatDisplayDate(newValues.date);
  const hasInputQtyChanged = String(previousValues.inputQty || '').trim() !== String(newValues.inputQty || '').trim();
  const hasInputUnitChanged = String(previousValues.inputUnit || '').trim() !== String(newValues.inputUnit || '').trim();

  const hasChanges = hasActivityChanged || hasCostChanged || hasHaChanged || hasPeopleChanged || hasDateChanged || hasInputQtyChanged || hasInputUnitChanged || subItemsChanged;

  if (!hasChanges) {
    return {
      success: false,
      noChanges: true,
      error: 'No changes detected. The operation details are identical to the current record. Nothing was submitted.'
    };
  }

  const editRecord = {
    id: `EDT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    editedBy: `${CURRENT_SESSION.name || 'User'} (${CURRENT_SESSION.employeeId || CURRENT_SESSION.role || 'Member'})`,
    editedRole: CURRENT_SESSION.role || 'Member',
    editedAt: new Date().toLocaleString('en-PH'),
    isoDate: new Date().toISOString(),
    reason: reasonTrimmed,
    previousValues,
    newValues,
  };

  const existingHistory = Array.isArray(targetLog.editHistory) ? targetLog.editHistory : [];
  
  const displayDate = formatDisplayDate(updates.date || updates.period || targetLog.date || targetLog.period);
  const costNum = Number(updates.totalCost != null ? updates.totalCost : (updates.cost != null ? updates.cost : (targetLog.totalCost != null ? targetLog.totalCost : targetLog.cost || 0)));

  // Apply updates to target log
  Object.assign(targetLog, updates, {
    date: displayDate,
    period: displayDate,
    isoDate: toISODateString(displayDate),
    cost: costNum,
    totalCost: costNum,
    isAmended: true,
    editHistory: [...existingHistory, editRecord],
    lastModifiedAt: new Date().toISOString(),
    lastModifiedBy: CURRENT_SESSION.name,
  });

  await saveItem(STORAGE_KEYS.LOGS, operationLogs);

  if (db && IS_SYNCED) {
    try {
      await setDoc(doc(db, 'operation_logs', logId), targetLog, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Direct Firestore log update failed, queuing outbox:', e);
      await enqueueOutboxItem('operation_log', targetLog);
    }
  } else {
    await enqueueOutboxItem('operation_log', targetLog);
  }

  // Record audit history event shared with Web & Cloud
  const actorName = `${CURRENT_SESSION.name || 'User'} (${CURRENT_SESSION.role || 'Member'})`;
  await logSystemEvent(
    'operation',
    'Operation Log Correction',
    targetLog.fieldId || 'Field Plot',
    `Amended operation record ${targetLog.id} (${targetLog.activity || targetLog.task || 'Operation'}, ₱${costNum.toLocaleString()}). Reason: ${reasonTrimmed}`,
    actorName,
    'Amended'
  );

  notify();
  return { success: true, log: targetLog, editRecord };
};

export const deletePastLogsForField = async (fieldId) => {
  if (!fieldId) return;
  const fId = fieldId.trim().toUpperCase();
  const toDelete = operationLogs.filter(l => 
    (l.fieldId || '').trim().toUpperCase() === fId && (l.isPastCycle || l.isArchived)
  );
  
  // Prune past cycle records from in-memory operationLogs
  const remaining = operationLogs.filter(l => 
    !((l.fieldId || '').trim().toUpperCase() === fId && (l.isPastCycle || l.isArchived))
  );
  operationLogs.length = 0;
  remaining.forEach(l => operationLogs.push(l));

  await saveItem(STORAGE_KEYS.LOGS, operationLogs);
  notify();

  if (db) {
    try {
      const deletePromises = toDelete.map(l => 
        deleteDoc(doc(db, 'operation_logs', l.id)).catch(() =>
          setDoc(doc(db, 'operation_logs', l.id), { isArchived: true, isDeleted: true }, { merge: true })
        )
      );
      await Promise.all(deletePromises);
    } catch (err) {
      console.warn('[dataStore] Error deleting past logs in Firestore:', err);
    }
  }
};
export const archivePastLogsForField = deletePastLogsForField;

export const calculateSRAWeekLabel = (dateInput = new Date()) => {
  let d = dateInput;
  if (!(d instanceof Date)) {
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
      const [y, m, dNum] = dateInput.trim().split('-').map(Number);
      d = new Date(y, m - 1, dNum);
    } else {
      d = new Date(dateInput);
    }
  }
  if (isNaN(d.getTime())) d = new Date();
  const day = d.getDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[d.getMonth()];
  const firstDayOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getDay(); // 0=Sun, 1=Mon...
  const weekNum = Math.ceil((day + firstDayOfMonth) / 7);
  const boundedWeek = Math.min(Math.max(weekNum, 1), 5);
  return `Week ${boundedWeek} ${monthName}`;
};

export const publishSraPrice = async ({ price, molasses, week, circular, source, effectiveDate }) => {
  const sorted = getSortedPrices();
  const prevPrice = (sorted.length > 0 && sorted[0].price !== undefined) ? sorted[0].price : price;
  const prevMol = (sorted.length > 0 && sorted[0].molasses !== undefined) ? sorted[0].molasses : molasses;
  const change = price - prevPrice;
  const molChange = molasses - prevMol;

  let targetDate = new Date();
  if (effectiveDate) {
    const parsed = new Date(effectiveDate);
    if (!isNaN(parsed.getTime())) targetDate = parsed;
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formattedDate = `${months[targetDate.getMonth()]} ${String(targetDate.getDate()).padStart(2, '0')}, ${targetDate.getFullYear()}`;
  const isoDate = targetDate.toISOString().split('T')[0];

  const pId = `PRC-${Date.now()}`;
  const newPost = {
    id: pId,
    week: week || 'Current Week',
    price: Number(price),
    molasses: Number(molasses),
    date: formattedDate,
    isoDate: isoDate,
    timestamp: Date.now(),
    change,
    molassesChange: molChange,
    source: source || circular || 'SRA Circular #105 (Official SRA Millsite Notice)',
    circular: circular || 'SRA Circular #105',
    createdAt: new Date().toISOString()
  };

  priceHistory.unshift(newPost);
  await saveItem(STORAGE_KEYS.PRICES, priceHistory);
  notify();

  // Push directly to Firestore 'sra_prices'
  if (db) {
    try {
      await setDoc(doc(db, 'sra_prices', pId), newPost, { merge: true });
      console.log('[Mobile] Published price broadcasted to Firestore:', pId);
    } catch (err) {
      console.warn('[Mobile] Error broadcasting price to Firestore:', err);
    }
  }

  return newPost;
};

let MEMBER_SYNC_LAG_DAYS = 0;
let MEMBER_LAST_SYNC_STR = '15 mins ago';

export const getMemberSyncHealth = () => {
  const isOffline = !IS_SYNCED || MEMBER_SYNC_LAG_DAYS >= 3;
  let status = 'healthy';
  if (MEMBER_SYNC_LAG_DAYS >= 7) status = 'critical';
  else if (MEMBER_SYNC_LAG_DAYS >= 3 || !IS_SYNCED) status = 'warning';

  const mgr = users.find(u => u.role === 'Farm Manager') || {};

  return {
    status,
    days: MEMBER_SYNC_LAG_DAYS,
    lastSync: MEMBER_LAST_SYNC_STR,
    isOffline: !IS_SYNCED,
    manager: {
      name: mgr.name || 'Jose Reyes',
      role: mgr.role || 'Farm Manager',
      blockFarm: mgr.blockFarm || mgr.farm || 'Nacayao Block Farm',
      phone: mgr.mobile || '0918 987 6543'
    }
  };
};


export const setSynced = (synced) => {
  IS_SYNCED = synced;
  if (!synced) {
    CURRENT_SESSION.pendingLogs = (CURRENT_SESSION.pendingLogs || 0) + 1;
  } else {
    performMobileSync();
  }
  notify();
};

export const currentProfile = {
  get name() { return CURRENT_SESSION.name; },
  get role() { return CURRENT_SESSION.role; },
  get employeeId() { return CURRENT_SESSION.employeeId; },
  get fieldId() { return CURRENT_SESSION.fieldId; },
  get farm() { return CURRENT_SESSION.farm; },
  get mobile() { return CURRENT_SESSION.mobile; },
  get pendingLogs() { return CURRENT_SESSION.pendingLogs; },
  get syncedLogs() { return CURRENT_SESSION.syncedLogs; },
};

export const profile = currentProfile;
export const MOCK_PROFILE = currentProfile;


export const SRA_OPERATIONS_CATALOGUE = [
  // ── Stage 1: Pre-Planting & Land Preparation ──
  {
    id: 'SRA-01',
    stageNumber: 1,
    stageName: 'Stage 1: Pre-Planting & Land Preparation',
    section: 'I. Direct Operations',
    name: 'Soil Sampling',
    category: 'prep',
    inputType: 'direct',
    isGroup: false,
    perHa: 1,
    unit: 'ha',
    rate: 100,
    costPerHa: 100,
    subItems: [
      { id: 'SI-01-1', description: 'Soil Laboratory Sampling & Analysis', qty: 1, unit: 'ha', unitCost: 100, subTotal: 100 }
    ]
  },
  {
    id: 'SRA-02',
    stageNumber: 1,
    stageName: 'Stage 1: Pre-Planting & Land Preparation',
    section: 'I. Direct Operations',
    name: 'Land Preparation',
    category: 'prep',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 12000,
    subItems: [
      { id: 'SI-02-1', description: '1st Pass Disc Plowing (Tractor)', qty: 1, unit: 'ha', unitCost: 5000, subTotal: 5000 },
      { id: 'SI-02-2', description: '2nd Pass Disc Harrowing', qty: 1, unit: 'ha', unitCost: 4000, subTotal: 4000 },
      { id: 'SI-02-3', description: 'Furrowing / Tudling', qty: 1, unit: 'ha', unitCost: 3000, subTotal: 3000 }
    ]
  },

  // ── Stage 2: Planting & Crop Establishment ──
  {
    id: 'SRA-03',
    stageNumber: 2,
    stageName: 'Stage 2: Planting & Crop Establishment',
    section: 'I. Direct Operations',
    name: 'Cost of Planting Material (Seedcane acquisition)',
    category: 'plant',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 15000,
    subItems: [
      { id: 'SI-03-1', description: 'Seedpieces (Patdan acquisition - 40,000 pts/ha)', qty: 5, unit: 'lac', unitCost: 3000, subTotal: 15000 }
    ]
  },
  {
    id: 'SRA-04',
    stageNumber: 2,
    stageName: 'Stage 2: Planting & Crop Establishment',
    section: 'I. Direct Operations',
    name: 'Planting Operations (Labor & Handling)',
    category: 'plant',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 5000,
    subItems: [
      { id: 'SI-04-1', description: 'Cutting, Bundling, Loading & Transport of Seedpieces', qty: 5, unit: 'lac', unitCost: 600, subTotal: 3000 },
      { id: 'SI-04-2', description: 'Distributing and Planting Seedpieces in Furrows', qty: 5, unit: 'lac', unitCost: 400, subTotal: 2000 }
    ]
  },

  // ── Stage 3: Basal Nutrition & Early Care ──
  {
    id: 'SRA-05',
    stageNumber: 3,
    stageName: 'Stage 3: Basal Nutrition & Early Care',
    section: 'I. Direct Operations',
    name: 'Basal Fertilizer Application (Labor & Materials)',
    category: 'fert',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 15800,
    subItems: [
      { id: 'SI-05-1', description: 'Application of 46-00-00 (Urea)', qty: 2, unit: 'bag', unitCost: 1600, subTotal: 3200 },
      { id: 'SI-05-2', description: 'Application of 18-46-00 (DAP / Complete)', qty: 3, unit: 'bag', unitCost: 2500, subTotal: 7500 },
      { id: 'SI-05-3', description: 'Application of 00-00-60 (MOP / Potash)', qty: 2, unit: 'bag', unitCost: 2200, subTotal: 4400 },
      { id: 'SI-05-4', description: 'Fertilizer Application Labor', qty: 7, unit: 'bag', unitCost: 100, subTotal: 700 }
    ]
  },
  {
    id: 'SRA-06',
    stageNumber: 3,
    stageName: 'Stage 3: Basal Nutrition & Early Care',
    section: 'I. Direct Operations',
    name: 'Lime Application (Soil Amending)',
    category: 'fert',
    inputType: 'direct',
    isGroup: false,
    perHa: 2,
    unit: 'ton',
    rate: 2500,
    costPerHa: 5000,
    subItems: [
      { id: 'SI-06-1', description: 'Agricultural Lime (Cal-Mag / Dolomite)', qty: 2, unit: 'ton', unitCost: 2500, subTotal: 5000 }
    ]
  },

  // ── Stage 4: Cultivation & Weed Management ──
  {
    id: 'SRA-07',
    stageNumber: 4,
    stageName: 'Stage 4: Cultivation & Weed Management',
    section: 'I. Direct Operations',
    name: 'Cultivation (Off-barring & On-barring)',
    category: 'weed',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 3000,
    subItems: [
      { id: 'SI-07-1', description: '1st Off-barring (Pahubas)', qty: 2, unit: 'pass', unitCost: 750, subTotal: 1500 },
      { id: 'SI-07-2', description: '2nd Off-barring (Pahubas)', qty: 2, unit: 'pass', unitCost: 750, subTotal: 1500 }
    ]
  },
  {
    id: 'SRA-08',
    stageNumber: 4,
    stageName: 'Stage 4: Cultivation & Weed Management',
    section: 'I. Direct Operations',
    name: 'Weeding Operations',
    category: 'weed',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 6000,
    subItems: [
      { id: 'SI-08-1', description: 'Manual Weeding (1st Round)', qty: 1, unit: 'ha', unitCost: 2000, subTotal: 2000 },
      { id: 'SI-08-2', description: 'Manual Weeding (2nd Round)', qty: 1, unit: 'ha', unitCost: 2000, subTotal: 2000 },
      { id: 'SI-08-3', description: 'Manual Weeding (3rd Round)', qty: 1, unit: 'ha', unitCost: 2000, subTotal: 2000 }
    ]
  },

  // ── Stage 5: Crop Maintenance & Final Hilling-Up ──
  {
    id: 'SRA-09',
    stageNumber: 5,
    stageName: 'Stage 5: Crop Maintenance & Final Hilling-Up',
    section: 'I. Direct Operations',
    name: 'Top-Dress / 2nd Dose Fertilization',
    category: 'maint',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 2500,
    subItems: [
      { id: 'SI-09-1', description: '2nd Dose Urea (Side-dressing)', qty: 1.5, unit: 'bag', unitCost: 1600, subTotal: 2400 },
      { id: 'SI-09-2', description: 'Side-dressing Application Labor', qty: 1.5, unit: 'bag', unitCost: 66.67, subTotal: 100 }
    ]
  },
  {
    id: 'SRA-10',
    stageNumber: 5,
    stageName: 'Stage 5: Crop Maintenance & Final Hilling-Up',
    section: 'I. Direct Operations',
    name: 'Final Hilling-up (Pasungkal)',
    category: 'maint',
    inputType: 'direct',
    isGroup: false,
    perHa: 1,
    unit: 'ha',
    rate: 2500,
    costPerHa: 2500,
    subItems: [
      { id: 'SI-10-1', description: 'Final Hilling-Up / Pasungkal Pass', qty: 1, unit: 'ha', unitCost: 2500, subTotal: 2500 }
    ]
  },

  // ── Stage 6: Harvesting & Transport ──
  {
    id: 'SRA-11',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    section: 'I. Direct Operations',
    name: 'Cutting and Loading Operations',
    category: 'harvest',
    inputType: 'direct',
    isGroup: false,
    perHa: 60,
    unit: 'ton',
    rate: 450,
    costPerHa: 27000,
    subItems: [
      { id: 'SI-11-1', description: 'Cutting, De-trashing, and Truck Loading', qty: 60, unit: 'ton', unitCost: 450, subTotal: 27000 }
    ]
  },
  {
    id: 'SRA-12',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    section: 'I. Direct Operations',
    name: 'Hauling (Trucking to Mill)',
    category: 'harvest',
    inputType: 'direct',
    isGroup: false,
    perHa: 60,
    unit: 'ton',
    rate: 250,
    costPerHa: 15000,
    subItems: [
      { id: 'SI-12-1', description: 'Flatbed Hauling to Haw-Phil Milling Terminal', qty: 60, unit: 'ton', unitCost: 250, subTotal: 15000 }
    ]
  },
  {
    id: 'SRA-13',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    section: 'I. Direct Operations',
    name: 'Bull Cart / In-field Transport',
    category: 'harvest',
    inputType: 'direct',
    isGroup: false,
    perHa: 60,
    unit: 'ton',
    rate: 120,
    costPerHa: 7200,
    subItems: [
      { id: 'SI-13-1', description: 'Carabao / Bull cart hauling to loading ramp', qty: 60, unit: 'ton', unitCost: 120, subTotal: 7200 }
    ]
  },
  {
    id: 'SRA-14',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    section: 'I. Direct Operations',
    name: 'Drainage & Post-Harvest Field Clearing',
    category: 'prep',
    inputType: 'direct',
    isGroup: false,
    perHa: 1,
    unit: 'ha',
    rate: 2000,
    costPerHa: 2000,
    subItems: [
      { id: 'SI-14-1', description: 'Trash farming, field clearing & drainage', qty: 1, unit: 'ha', unitCost: 2000, subTotal: 2000 }
    ]
  }
];

export const updateFieldCustomStages = (fieldId, stages) => {
  const field = fields.find(f => f.id === fieldId);
  if (field) {
    field.customStages = stages;
    notify();
  }
};

export const getDefaultStageOperations = (stageNumber) => {
  return SRA_OPERATIONS_CATALOGUE
    .filter(op => op.stageNumber === Number(stageNumber))
    .map(op => ({
      id: op.id,
      name: op.name,
      stageNumber: op.stageNumber,
      stageName: op.stageName,
      inputType: op.inputType || (op.isGroup ? 'group' : 'direct'),
      isGroup: op.isGroup !== undefined ? op.isGroup : false,
      perHa: op.perHa !== undefined ? op.perHa : (op.subItems && op.subItems[0] ? op.subItems[0].qty : 1),
      rate: op.rate !== undefined ? op.rate : (op.subItems && op.subItems[0] ? op.subItems[0].unitCost : op.costPerHa || 0),
      category: op.category || 'prep',
      unit: op.unit || 'ha',
      costPerHa: op.costPerHa || 0,
      subItems: (op.subItems || []).map(si => ({ ...si }))
    }));
};

export const getFieldCustomOperations = (fieldId, stageNumber) => {
  const field = fields.find(f => f.id === fieldId);
  if (field && field.customOperations && field.customOperations[stageNumber] && field.customOperations[stageNumber].length > 0) {
    return field.customOperations[stageNumber].map(op => ({
      ...op,
      isGroup: op.isGroup !== undefined ? op.isGroup : (op.inputType === 'group' || (op.subItems && op.subItems.length > 0)),
      inputType: op.inputType || (op.isGroup ? 'group' : 'direct'),
      subItems: (op.subItems || []).map(si => ({ ...si }))
    }));
  }
  return getDefaultStageOperations(stageNumber);
};

export const saveFieldCustomOperations = (fieldId, stageNumber, operations) => {
  const field = fields.find(f => f.id === fieldId);
  if (field) {
    if (!field.customOperations) field.customOperations = {};
    field.customOperations[stageNumber] = operations.map(op => ({
      ...op,
      isGroup: op.isGroup !== undefined ? op.isGroup : (op.inputType === 'group'),
      inputType: op.inputType || (op.isGroup ? 'group' : 'direct'),
      subItems: (op.subItems || []).map(si => ({ ...si }))
    }));
    notify();
  }
};

export const saveFieldFullPlan = (fieldId, fullPlanByStage) => {
  const field = fields.find(f => f.id === fieldId);
  if (field) {
    field.customOperations = { ...fullPlanByStage };
    notify();
  }
};

export const managers = [
  { id: '03000001', name: 'Jose Reyes', blockFarm: 'Nacayao Block Farm' }
];
export const MOCK_MANAGERS = managers;

export const addSRAPrice = async (price) => {
  const sorted = getSortedPrices();
  const nextMonth = 'May';
  const nextWeek = 'Week 4';
  const dateStr = new Date().toISOString().split('T')[0];
  const priceRecord = {
    id: `PRC-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`,
    week: `${nextWeek} ${nextMonth}`,
    month: nextMonth,
    price: Number(price) || 0,
    date: dateStr,
    createdAt: new Date().toISOString()
  };
  priceHistory.unshift(priceRecord);

  if (db) {
    try {
      await setDoc(doc(db, 'sra_prices', priceRecord.id), priceRecord, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Failed to write price to Firestore:', e);
    }
  }

  notify();
};

export const submitSupportTicket = async (ticket) => {
  const newId = generateTicketId(800 + supportTickets.length + 1);
  const farmName = CURRENT_SESSION.blockFarm || CURRENT_SESSION.farm || 'Nacayao Block Farm';
  const newTicket = {
    id: newId,
    subject: ticket.title || ticket.subject || 'Support Request',
    memberName: CURRENT_SESSION.name,
    memberId: CURRENT_SESSION.employeeId || '',
    contact: CURRENT_SESSION.contact || '',
    fieldId: CURRENT_SESSION.fieldId || '',
    blockFarm: farmName,
    category: ticket.category || 'General Support',
    priority: ticket.priority || 'Normal',
    status: 'Open',
    messages: [
      {
        sender: CURRENT_SESSION.name,
        text: ticket.details || ticket.message || '',
        timestamp: new Date().toISOString()
      }
    ],
    createdAt: new Date().toISOString()
  };
  supportTickets.unshift(newTicket);

  if (db && IS_SYNCED) {
    try {
      await setDoc(doc(db, 'support_tickets', newId), newTicket, { merge: true });
    } catch (e) {
      console.warn('[dataStore] Failed to write ticket to Firestore, queuing:', e);
      await enqueueOutboxItem('ticket', newTicket);
    }
  } else if (!IS_SYNCED) {
    await enqueueOutboxItem('ticket', newTicket);
  }

  notify();
  return newTicket;
};

// ── Security Preferences State ──────────────────────────────
export let SECURITY_PREFERENCES = {
  biometrics: false,
  pinEnabled: false,
  twoFactor: false,
  sessionAlert: true,
  lastPasswordChange: '2026-05-01'
};

export const getSecurityPreferences = () => ({ ...SECURITY_PREFERENCES });

export const updateSecurityPreferences = (updates) => {
  SECURITY_PREFERENCES = { ...SECURITY_PREFERENCES, ...updates };
  notify();
  return SECURITY_PREFERENCES;
};

export const resetLocalCache = async () => {
  draftLogs.length = 0;
  IS_SYNCED = true;
  await clearOutbox();
  await clearHugpongStorage();
  if (CURRENT_SESSION) {
    await saveItem(STORAGE_KEYS.SESSION, CURRENT_SESSION);
  }
  notify();
  return true;
};

// ── Real-Time Cloud Firestore Sync ──────────────────────────
export const listenToCloudSync = () => {
  if (!db) return () => {};

  try {
    // 0. Live Block Farms Listener
    // 0. Live Block Farms Listener
    const unsubBlockFarms = onSnapshot(collection(db, 'block_farms'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteBF = [];
      snapshot.forEach(docSnap => remoteBF.push({ id: docSnap.id, ...docSnap.data() }));

      blockFarms.length = 0;
      remoteBF.forEach(bf => blockFarms.push(bf));
      saveItem('@hugpong_block_farms', blockFarms);
      notify();
    }, (err) => console.warn('[Mobile] Block farms listener notice:', err));

    // 1. Live SRA Sugar Prices Listener
    const unsubPrices = onSnapshot(collection(db, 'sra_prices'), (snapshot) => {
      if (snapshot.empty) return;
      const remotePrices = [];
      snapshot.forEach(docSnap => remotePrices.push(docSnap.data()));
      
      remotePrices.sort((a, b) => parsePriceTime(b) - parsePriceTime(a));

      if (remotePrices.length > 0) {
        priceHistory.length = 0;
        remotePrices.forEach(p => priceHistory.push(p));
        saveItem(STORAGE_KEYS.PRICES, remotePrices);
        notify();
      }
    }, (err) => console.warn('[Mobile] SRA prices listener notice:', err));

    // 2. Live Field Plots Listener (Authoritative Cloud Sync)
    const unsubFields = onSnapshot(collection(db, 'fields'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteFields = [];
      snapshot.forEach(docSnap => remoteFields.push({ id: docSnap.id, ...docSnap.data() }));

      // Merge remote updates with current local fields and seeds, never blindly wiping fields!
      const currentCombined = [...fields];
      remoteFields.forEach(rf => {
        const idx = currentCombined.findIndex(f => f.id === rf.id);
        if (idx >= 0) {
          currentCombined[idx] = { ...currentCombined[idx], ...rf };
        } else {
          currentCombined.push(rf);
        }
      });
      const cleanFields = mergeFieldsWithSeeds(currentCombined);
      fields.length = 0;
      cleanFields.forEach(f => fields.push(f));
      saveItem(STORAGE_KEYS.FIELDS, fields);
      notify();
    }, (err) => console.warn('[Mobile] Fields listener notice:', err));

    // 3. Live Operation Logs Listener (Authoritative Cloud Sync)
    const unsubLogs = onSnapshot(collection(db, 'operation_logs'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteLogs = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (!data.isArchived && !data.isDeleted) {
          let effCost = Number(data.totalCost != null ? data.totalCost : (data.cost || 0));
          const opName = (data.sraOperationId || data.task || data.activity || '').toLowerCase();
          if (effCost === 0 && (opName.includes('cutting') || opName.includes('loading') || opName.includes('sra-11') || opName.includes('harvest'))) {
            const ha = Number(data.hectares) || 1.5;
            effCost = Math.round(ha * 60 * 450);
          }
          const displayDate = formatDisplayDate(data.date || data.period);
          remoteLogs.push({ 
            id: docSnap.id, 
            ...data,
            cost: effCost,
            totalCost: effCost,
            date: displayDate,
            period: displayDate,
            isoDate: toISODateString(displayDate)
          });
        }
      });

      // Merge remote logs with existing local logs, keeping local logs that aren't yet in cloud!
      const remoteIds = new Set(remoteLogs.map(r => r.id));
      const localOnly = operationLogs.filter(l => !remoteIds.has(l.id) && !l.isArchived && !l.isDeleted);
      const merged = [...remoteLogs, ...localOnly];
      merged.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || a.date || 0).getTime();
        const timeB = new Date(b.createdAt || b.timestamp || b.date || 0).getTime();
        if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
        return (b.id || '').localeCompare(a.id || '');
      });

      const dedupedLogs = cleanupDuplicateLogs(merged);
      operationLogs.length = 0;
      dedupedLogs.forEach(rl => operationLogs.push(rl));
      saveItem(STORAGE_KEYS.LOGS, operationLogs);
      notify();
    }, (err) => console.warn('[Mobile] Operation logs listener notice:', err));

    // 4. Live Support Tickets Listener (Authoritative Cloud Sync)
    const unsubTickets = onSnapshot(collection(db, 'support_tickets'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteTickets = [];
      snapshot.forEach(docSnap => remoteTickets.push({ id: docSnap.id, ...docSnap.data() }));

      supportTickets.length = 0;
      remoteTickets.forEach(rt => supportTickets.push(rt));
      saveItem(STORAGE_KEYS.TICKETS, supportTickets);
      notify();
    }, (err) => console.warn('[Mobile] Support tickets listener notice:', err));

    // 5. Live Users Directory Listener (Authoritative Cloud Sync)
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteUsers = [];
      snapshot.forEach(docSnap => remoteUsers.push({ id: docSnap.id, ...docSnap.data() }));

      users.length = 0;
      remoteUsers.forEach(ru => users.push(ru));
      saveItem(STORAGE_KEYS.USERS, users);
      notify();
    }, (err) => console.warn('[Mobile] Users listener notice:', err));

    // 6. Live Audit Reports Listener (Authoritative Cloud Sync)
    const unsubAuditReports = onSnapshot(collection(db, 'audit_reports'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteAudits = [];
      snapshot.forEach(docSnap => remoteAudits.push({ id: docSnap.id, ...docSnap.data() }));

      if (remoteAudits.length > 0) {
        remoteAudits.forEach(ra => {
          const existingIdx = auditReports.findIndex(a => 
            a.id === ra.id || 
            a.reportId === ra.id || 
            (ra.reportId && a.id === ra.reportId) || 
            (ra.id && a.reportId === ra.id) ||
            (ra.qrSignature && (a.qrSignature === ra.qrSignature || a.qrHash === ra.qrSignature))
          );
          if (existingIdx >= 0) {
            const isCertified = auditReports[existingIdx].status === 'Certified' || ra.status === 'Certified';
            auditReports[existingIdx] = { 
              ...auditReports[existingIdx], 
              ...ra,
              status: isCertified ? 'Certified' : (ra.status || 'Pending')
            };
          } else {
            auditReports.unshift(ra);
          }
        });
        saveItem(STORAGE_KEYS.AUDIT_REPORTS, auditReports);
        saveItem('@hugpong_audit_logs', auditReports);
        notify();
      }
    }, (err) => console.warn('[Mobile] Audit reports listener notice:', err));

    // 7. Live Audit Logs / System History Listener (Authoritative Cloud Sync)
    const unsubAuditLogs = onSnapshot(collection(db, 'audit_logs'), (snapshot) => {
      if (snapshot.empty) return;
      const remoteLogs = [];
      snapshot.forEach(docSnap => remoteLogs.push({ id: docSnap.id, ...docSnap.data() }));

      if (remoteLogs.length > 0) {
        remoteLogs.forEach(rl => {
          const existingIdx = systemHistory.findIndex(a => a.id === rl.id);
          if (existingIdx >= 0) {
            systemHistory[existingIdx] = { ...systemHistory[existingIdx], ...rl };
          } else {
            systemHistory.unshift(rl);
          }
        });
        saveItem(STORAGE_KEYS.SYSTEM_HISTORY, systemHistory);
        notify();
      }
    }, (err) => console.warn('[Mobile] Audit logs listener notice:', err));

    return () => {
      unsubBlockFarms();
      unsubPrices();
      unsubFields();
      unsubLogs();
      unsubTickets();
      unsubUsers();
      unsubAuditReports();
      unsubAuditLogs();
    };
  } catch (err) {
    console.warn('[Mobile] Error setting up Cloud listeners:', err);
    return () => {};
  }
};

export const performMobileSync = async () => {
  const res = await flushOutboxToFirestore();
  IS_SYNCED = true;
  CURRENT_SESSION.pendingLogs = 0;
  
  fields.forEach(f => {
    f.synced = true;
    f.lastSync = 'Just now';
  });

  // Flush compiled audit reports to Firestore (District Audit Queue)
  try {
    if (db && Array.isArray(auditReports)) {
      for (const rep of auditReports) {
        if (rep && (rep.reportId || rep.id)) {
          const docId = rep.reportId || rep.id;
          const docRef = doc(db, 'audit_reports', docId);
          // Regulatory Safeguard: Never overwrite an existing Certified status in Firestore with Pending
          try {
            const snap = await getDoc(docRef);
            if (snap.exists() && snap.data()?.status === 'Certified') {
              rep.status = 'Certified';
              rep.certifiedBy = snap.data().certifiedBy || rep.certifiedBy;
              rep.certifiedRole = snap.data().certifiedRole || rep.certifiedRole;
              rep.certifiedAt = snap.data().certifiedAt || rep.certifiedAt;
              rep.cloudQueueStatus = 'transmitted';
              continue;
            }
          } catch (ge) {}
          await setDoc(docRef, { ...rep, updatedAt: new Date().toISOString() }, { merge: true });
          rep.cloudQueueStatus = 'transmitted';
          rep.cloudQueuedAt = new Date().toISOString();
        }
      }
      saveItem(STORAGE_KEYS.AUDIT_REPORTS, auditReports);
    }
  } catch (e) {
    console.warn('[performMobileSync] auditReports push error:', e);
  }

  // Broadcast device health telemetry
  try {
    await publishTerminalTelemetry(CURRENT_SESSION, 0);
  } catch (e) {}
  
  notify();
  return true;
};

export const initializeOfflineStorage = async () => {
  try {
    await initSyncEngine();
    const stored = await hydrateAllStorage();
    if (stored[STORAGE_KEYS.SESSION]) CURRENT_SESSION = stored[STORAGE_KEYS.SESSION];
    if (Array.isArray(stored[STORAGE_KEYS.USERS]) && stored[STORAGE_KEYS.USERS].length > 0) {
      users.length = 0;
      stored[STORAGE_KEYS.USERS].forEach(u => users.push(u));
    }
    if (Array.isArray(stored[STORAGE_KEYS.LOGS]) && stored[STORAGE_KEYS.LOGS].length > 0) {
      operationLogs.length = 0;
      const normalized = cleanupDuplicateLogs(stored[STORAGE_KEYS.LOGS]).map(l => {
        let effCost = Number(l.totalCost != null ? l.totalCost : (l.cost || 0));
        const opName = (l.sraOperationId || l.task || l.activity || '').toLowerCase();
        if (effCost === 0 && (opName.includes('cutting') || opName.includes('loading') || opName.includes('sra-11') || opName.includes('harvest'))) {
          const ha = Number(l.hectares) || 1.5;
          effCost = Math.round(ha * 60 * 450);
        }
        const displayDate = formatDisplayDate(l.date || l.period);
        return {
          ...l,
          cost: effCost,
          totalCost: effCost,
          date: displayDate,
          period: displayDate,
          isoDate: toISODateString(displayDate)
        };
      });
      normalized.forEach(l => operationLogs.push(l));
    }
    if (Array.isArray(stored[STORAGE_KEYS.DRAFTS])) {
      draftLogs.length = 0;
      stored[STORAGE_KEYS.DRAFTS].forEach(d => draftLogs.push(d));
    }
    if (Array.isArray(stored[STORAGE_KEYS.FIELDS]) && stored[STORAGE_KEYS.FIELDS].length > 0) {
      const cleanFields = mergeFieldsWithSeeds(stored[STORAGE_KEYS.FIELDS]);
      fields.length = 0;
      cleanFields.forEach(f => fields.push(f));
    }
    if (Array.isArray(stored[STORAGE_KEYS.TICKETS]) && stored[STORAGE_KEYS.TICKETS].length > 0) {
      supportTickets.length = 0;
      stored[STORAGE_KEYS.TICKETS].forEach(t => supportTickets.push(t));
    }
    if (stored[STORAGE_KEYS.PREFS]) SECURITY_PREFERENCES = stored[STORAGE_KEYS.PREFS];

    // Hydrate cached price circulars
    if (Array.isArray(stored[STORAGE_KEYS.PRICES]) && stored[STORAGE_KEYS.PRICES].length > 0) {
      priceHistory.length = 0;
      stored[STORAGE_KEYS.PRICES].forEach(p => priceHistory.push(p));
    }

    // Hydrate cached pending member registrations
    if (Array.isArray(stored[STORAGE_KEYS.PENDING_USERS]) && stored[STORAGE_KEYS.PENDING_USERS].length > 0) {
      pendingUsers.length = 0;
      stored[STORAGE_KEYS.PENDING_USERS].forEach(u => pendingUsers.push(u));
    }

    // Hydrate cached audit reports
    if (Array.isArray(stored[STORAGE_KEYS.AUDIT_REPORTS]) && stored[STORAGE_KEYS.AUDIT_REPORTS].length > 0) {
      auditReports.length = 0;
      stored[STORAGE_KEYS.AUDIT_REPORTS].forEach(a => {
        // If May 2026 was compiled by manager without official SRA certification seal, maintain Pending SRA
        if ((a.reportId === 'RPT-2026-05-NCY01' || a.id === 'AUD-2026-05' || a.month === 'May 2026') && !a.certifiedBy && a.status === 'Certified') {
          a.status = 'Pending SRA';
          a.verifiedBy = 'Pending SRA Inspector Review';
        }
        auditReports.push(a);
      });
    }

    // Hydrate cached system history
    if (Array.isArray(stored[STORAGE_KEYS.SYSTEM_HISTORY]) && stored[STORAGE_KEYS.SYSTEM_HISTORY].length > 0) {
      systemHistory.length = 0;
      stored[STORAGE_KEYS.SYSTEM_HISTORY].forEach(s => systemHistory.push(s));
    }
    
    const outboxCount = getOutboxCount();
    if (outboxCount > 0) {
      IS_SYNCED = false;
      CURRENT_SESSION.pendingLogs = outboxCount;
    }

    notify();

    try {
      listenToCloudSync();
      // Publish background device telemetry
      if (CURRENT_SESSION && CURRENT_SESSION.name) {
        publishTerminalTelemetry(CURRENT_SESSION, outboxCount).catch(() => {});
      }
    } catch (cloudErr) {
      console.warn('[dataStore] Cloud sync listener deferred:', cloudErr);
    }
  } catch (error) {
    console.warn('[dataStore] Startup hydration notice:', error);
  }
};

// Auto-invoke hydration on bundle load
initializeOfflineStorage();
