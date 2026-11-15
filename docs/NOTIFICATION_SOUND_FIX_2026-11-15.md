# Android default notification sound error

15 November 2026. Fixed locally; no deployment, new APK or device installation performed.

The system-update channel in `mobile/src/services/systemNotificationService.js` passed `sound: 'default'` to setNotificationChannelAsync. The installed Expo Android implementation checks any provided non-null channel sound string as a bundled raw resource filename. Its customSoundExists method therefore rejects the literal filename default and logs the reported error. Omitting the channel sound key passes that check and preserves the platform's default notification sound.

The fix removes only that channel property and documents the SDK behavior. The existing system-updates channel ID, importance, local notification content, recipient filtering, durable inbox, retry logic, push binding and deduplication remain in use. The account-recovery and planner channels already omit a custom sound. No channel was deleted or recreated, and no bundled sound asset or Expo plugin configuration change is required.

Database/schema: unchanged. No record migration or data changes.

Server/API: unchanged. The Expo push message's sound value default is valid and remains intact; this field is distinct from Android native channel options. See [Expo push message format](https://docs.expo.dev/push-notifications/sending-notifications/). Authentication, server-authoritative notification delivery and permissions are preserved.

Web: unchanged. The Web notification inbox uses the existing server API and has no native Android sound channel.

Mobile: the system-update channel now uses the same implicit platform sound approach as the existing recovery and planner channels. iOS notification content retains its valid default sound setting.

Verification: 32 tests passed across system-notification-clients, system-notifications, recovery-push-notifications and planner-notifications, with zero failures or skipped tests. The runtime client regression captures the actual channel arguments and asserts that no sound filename is supplied, while scheduled notification content retains sound default. Existing reconnect, deduplication, recipient isolation, permission, native-failure and push-delivery tests pass. Client binding audit reports zero findings; git diff --check passes.

Evidence: `output/notification-sound-checks-2026-11-15.tap`. Test modification: `server/tests/system-notification-clients.test.js`.

Remaining check: verify on a physical Android device after installing the pending APK. Sound remains subject to the device's channel preferences, notification permission, volume and Do Not Disturb settings. Native playback or the disappearance of this warning on an installed APK has not been claimed from local tests alone. Do not uninstall the app or clear its data for this fix.
