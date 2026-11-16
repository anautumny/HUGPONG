export function pendingUserAttention(pendingUsers = [], error = null) {
  if (error) return [{
    id: 'pending-users-unavailable', title: 'Pending Users Unavailable', description: error,
    type: 'warning', to: '/users?tab=pending', actionLabel: 'Review Pending Users'
  }];
  return pendingUsers.length ? [{
    id: 'pending-users', title: `${pendingUsers.length} Pending User${pendingUsers.length === 1 ? '' : 's'}`,
    description: 'Accounts are awaiting approval or authorized phone verification.',
    type: 'warning', to: '/users?tab=pending', actionLabel: 'Review Pending Users'
  }] : [];
}
