// Display-only joins of server-issued relationships. These never authorize access.
export function blockFarmDisplayName(blockFarmId, blockFarms = [], fallback = 'Unassigned') {
  const id = String(blockFarmId || '').trim();
  if (!id) return fallback;
  return blockFarms.find(farm => farm.id === id)?.name || id;
}

export function accountBlockFarmId(account = {}) {
  const assigned = account.assignment?.blockFarmId || account.blockFarmId || account.affiliatedBlockFarmId || '';
  return String(String(account.status || '').toUpperCase() === 'PENDING'
    ? account.requestedBlockFarmId || assigned
    : assigned || account.requestedBlockFarmId || '').trim();
}

export function managedBlockFarmIds(blockFarms = [], userId = '') {
  return new Set(userId ? blockFarms.filter(farm => farm.managerUserId === userId).map(farm => farm.id) : []);
}
