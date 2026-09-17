export const WORKSPACE_SECTIONS = Object.freeze({
  superadmin: [
    ['overview', 'Overview'], ['users', 'Users'], ['farms', 'Block Farms'], ['fields', 'Fields'],
    ['reports', 'Reports & Audit'], ['prices', 'SRA Prices'], ['history', 'Governance History'],
    ['diagnostics', 'System Monitoring'], ['support', 'Support'], ['settings', 'Settings']
  ],
  admin: [
    ['overview', 'Overview'], ['farms', 'Block Farms'], ['fields', 'Fields'], ['prices', 'SRA Prices'],
    ['reports', 'Audit & Certification'], ['users', 'Farm Managers'], ['support', 'Support'], ['settings', 'Settings']
  ],
  manager: [
    ['overview', 'Overview'], ['farm', 'Assigned Block Farm'], ['fields', 'Member Fields'],
    ['operations', 'Operations / Take Over'], ['cycles', 'Crop Cycles'], ['reports', 'Reports'],
    ['users', 'Member Farmers'], ['diagnostics', 'Sync Monitoring'], ['support', 'Support'], ['settings', 'Settings']
  ],
  member: [['overview', 'Mobile Application']]
});

export function allowedSections(roleKey) {
  return WORKSPACE_SECTIONS[roleKey] || [];
}

export function defaultSection(roleKey) {
  return allowedSections(roleKey)[0]?.[0] || 'overview';
}

export function sectionAllowed(roleKey, section) {
  return allowedSections(roleKey).some(([key]) => key === section);
}

