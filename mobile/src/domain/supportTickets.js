export const SUPPORT_TICKET_CATEGORIES = Object.freeze([
  'Account / Login',
  'Synchronization',
  'Field / Operation Data',
  'Audit / QR',
  'SRA Price',
  'Other'
]);

export const SUPPORT_TICKET_STATUS = Object.freeze({
  PENDING_SUBMISSION: 'PENDING_SUBMISSION',
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED'
});

export function canonicalSupportRole(value) {
  const role = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (role === 'MEMBER' || role === 'FARM_MEMBER') return 'MEMBER_FARMER';
  if (role === 'ADMIN') return 'SRA_ADMIN';
  if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
  return role;
}

export function canCreateSupportTicket(role) {
  return ['MEMBER_FARMER', 'FARM_MANAGER', 'SRA_ADMIN'].includes(canonicalSupportRole(role));
}

export function supportStatusLabel(value) {
  return String(value || SUPPORT_TICKET_STATUS.OPEN)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}
