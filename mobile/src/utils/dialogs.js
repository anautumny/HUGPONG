import { Alert } from 'react-native';

// Activity-safe alert wrapper to prevent Android 'not attached to Activity' crashes
export const safeAlert = (title, message, buttons, options) => {
  setTimeout(() => {
    try {
      Alert.alert(title, message, buttons, options);
    } catch (e) {
      console.warn('[safeAlert] Failed to show alert safely:', e.message);
    }
  }, 100);
};

// Generic confirm
export const confirm = ({ title, message, onConfirm, confirmText = 'Confirm', destructive = false }) => {
  safeAlert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
};

// Sync
export const confirmSync = ({ pendingCount, onSync }) => confirm({
  title: 'Sync Now?',
  message: `You have ${pendingCount} pending record${pendingCount !== 1 ? 's' : ''} to upload. Upload now?`,
  confirmText: 'Sync Now',
  onConfirm: onSync,
});

// Sign out with data warning
export const confirmSignOut = ({ pendingCount, onSyncFirst, onSignOut }) => {
  const hasPending = pendingCount > 0;
  Alert.alert(
    'Sign Out?',
    hasPending
      ? `You have ${pendingCount} unsynced record${pendingCount !== 1 ? 's' : ''}.\n\nSigning out without syncing may cause data loss.`
      : 'Are you sure you want to sign out?',
    [
      hasPending && { text: 'Sync First', style: 'default', onPress: onSyncFirst },
      { text: 'Sign Out', style: 'destructive', onPress: onSignOut },
      { text: 'Cancel', style: 'cancel' },
    ].filter(Boolean)
  );
};

// Clear cache
export const confirmClearCache = ({ onClear }) => confirm({
  title: 'Clear Cache?',
  message: 'This removes all locally cached data. Unsynced records may be permanently lost.\n\nThis action cannot be undone.',
  confirmText: 'Clear Cache',
  destructive: true,
  onConfirm: onClear,
});

// Clear queue
export const confirmClearQueue = ({ onClear }) => confirm({
  title: 'Clear Offline Queue?',
  message: 'All pending upload records will be discarded and cannot be recovered.',
  confirmText: 'Clear Queue',
  destructive: true,
  onConfirm: onClear,
});

// Conflict resolution — overwrite local
export const confirmConflictOverwriteLocal = ({ recordName, onConfirm }) => confirm({
  title: 'Overwrite Local Record?',
  message: `The cloud version of "${recordName}" is newer.\n\nOverwriting will replace your local changes permanently.`,
  confirmText: 'Use Cloud Version',
  destructive: true,
  onConfirm,
});

// Conflict resolution — keep local
export const confirmConflictKeepLocal = ({ recordName, onConfirm }) => confirm({
  title: 'Keep Local Record?',
  message: `Your local version of "${recordName}" will replace the cloud record.\n\nThis action cannot be undone.`,
  confirmText: 'Keep My Version',
  onConfirm,
});

// Security warning
export const securityWarning = ({ feature, onProceed }) => Alert.alert(
  'Security Warning',
  `Changing your ${feature} will log out all other active sessions.\n\nMake sure you're in a secure environment before proceeding.`,
  [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Proceed', style: 'destructive', onPress: onProceed },
  ]
);

// Retry upload
export const confirmRetryUpload = ({ recordName, onRetry }) => confirm({
  title: 'Retry Upload?',
  message: `Retry uploading "${recordName}"?\n\nMake sure you have a stable internet connection.`,
  confirmText: 'Retry',
  onConfirm: onRetry,
});

// Discard changes
export const confirmDiscard = ({ onDiscard }) => confirm({
  title: 'Discard Changes?',
  message: 'You have unsaved changes. Leaving now will discard them.',
  confirmText: 'Discard',
  destructive: true,
  onConfirm: onDiscard,
});

// Sign out all devices
export const confirmSignOutAllDevices = ({ onConfirm }) => Alert.alert(
  'Sign Out All Devices?',
  'This will immediately revoke all active sessions on every device.\n\nYou will need to log in again on each device.',
  [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign Out All', style: 'destructive', onPress: onConfirm },
  ]
);
