// ══════════════════════════════════════════════════════════════
// HUGPONG — Clean Firestore & Initialize Single Super Admin
// Project: hugpong-ff
// ══════════════════════════════════════════════════════════════

const crypto = require('crypto');
const { initializeApp } = require('./node_modules/firebase/app');
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  writeBatch,
  setDoc
} = require('./node_modules/firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyDYkv9afZa2ZlhxLzIEZfk2b5wP_s2XXpI',
  authDomain: 'hugpong-ff.firebaseapp.com',
  projectId: 'hugpong-ff'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTIONS_TO_CLEAR = [
  'fields',
  'operation_logs',
  'sra_prices',
  'users',
  'block_farms',
  'support_tickets',
  'audit_reports',
  'audit_logs',
  'sync_operations',
  'terminal_diagnostics',
  'system_history',
  'assignment_requests',
  'draft_logs'
];

function hashPassword(password) {
  const SALT = 'hugpong_salt_2026:';
  return crypto.createHash('sha256').update(SALT + password).digest('hex');
}

async function runCleanAndInit() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🧹 [1/2] PURGING ALL EXISTING CLOUD FIRESTORE COLLECTIONS...');
  console.log('════════════════════════════════════════════════════════════');

  for (const colName of COLLECTIONS_TO_CLEAR) {
    try {
      const snap = await getDocs(collection(db, colName));
      if (!snap.empty) {
        console.log(`  - Deleting ${snap.size} document(s) from collection: '${colName}'...`);
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
      } else {
        console.log(`  - Collection '${colName}' is already empty.`);
      }
    } catch (err) {
      console.warn(`  - Note on '${colName}':`, err.message);
    }
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('👑 [2/2] INITIALIZING SINGLE SUPER ADMIN ACCOUNT...');
  console.log('════════════════════════════════════════════════════════════');

  const fullName = 'Matt Daniel Delotavo';
  const mobile = '09451774699';
  const employeeId = '01000001';
  const password = 'Admin@HUGPONG';
  const passwordHash = hashPassword(password);
  const nowISO = new Date().toISOString();
  const dateStr = nowISO.split('T')[0];

  const adminPayload = {
    employeeId: employeeId,
    contact: mobile,
    name: fullName,
    role: 'Super Admin',
    roleKey: 'super_admin',
    blockFarmId: '',
    blockFarm: '',
    fieldId: '',
    regDate: dateStr,
    passwordHash: passwordHash,
    password: password, // For compatibility
    status: 'Active',
    phoneVerified: true,
    isPhoneVerified: true,
    phoneVerifiedAt: nowISO,
    createdAt: nowISO,
    updatedAt: nowISO
  };

  // Write single canonical document by permanent User ID (01000001)
  // Mobile number (09451774699) is stored inside the document fields
  await setDoc(doc(db, 'users', employeeId), adminPayload, { merge: true });
  console.log(`  ✅ Registered Single Canonical Document: users/${employeeId} (${fullName})`);

  console.log('\n✨ FIRESTORE CLEANUP & SUPER ADMIN INITIALIZATION COMPLETE!');
  console.log('------------------------------------------------------------');
  console.log(`👤 Name:         ${fullName}`);
  console.log(`📱 Mobile:       ${mobile}`);
  console.log(`🆔 User ID:      ${employeeId}`);
  console.log(`🔑 Role:         Super Admin`);
  console.log(`🔒 Password:     ${password}`);
  console.log(`🛡️ Hash:         ${passwordHash}`);
  console.log('------------------------------------------------------------\n');

  process.exit(0);
}

runCleanAndInit().catch(err => {
  console.error('❌ Error during cleanup/init:', err);
  process.exit(1);
});
