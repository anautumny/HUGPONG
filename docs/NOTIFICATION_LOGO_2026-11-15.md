# HUGPONG notification branding - 15 November 2026

Status: implemented and verified locally with the pending 1.1.2 changes. Not deployed; no APK built or installed for this correction.

The Android notification plugin had no custom icon configuration, so the native notification builder fell back to the launcher icon. Launcher/adaptive icons do not provide the dedicated monochrome small notification glyph shown beside the app name in the supplied screenshot.

## Implementation

- Database/schema: no changes or record writes.
- Server/API: no changes. Push delivery, permission checks, channels, event deduplication and notification contents retain the existing implementation.
- Mobile: `mobile/assets/notification-icon.png` is a 96x96, white-on-transparent small glyph derived from the HUGPONG emblem. `mobile/app.json` configures it through the existing `expo-notifications` plugin, with brand-green tint and the existing full-colour `icon-foreground.png` as the large notification icon. The plugin supplies both Firebase and Expo notification defaults, covering push notifications and locally scheduled notifications without new delivery code.
- Web: `web/react-app/src/components/auth/AccountRecoveryModal.jsx` supplies the existing `/icon-foreground.png` to its browser recovery notification. In-app notification delivery is unchanged.

## Verification

- Checked PNG dimensions, pure-white visible pixels, transparent background and opaque glyph pixels; visually inspected the glyph against a dark background.
- Executed the installed Expo native plugin against an isolated directory under workspace `tmp`: generated all five density variants of the small and large icons (10 resources). Verified expected sizes and generated manifest metadata for Firebase/Expo small icons, large icon and tint. Evidence: `output/notification-icon-native-verification-2026-11-15.json`.
- Existing system notification, notification lifecycle, planner notification and runtime stabilization suites: **99 passed, zero failures**. Evidence: `output/notification-icon-regressions-2026-11-15.tap`.
- Web production build passed; `git diff --check` passed. Evidence: `output/notification-logo-web-build-2026-11-15.txt`.
- No test notification was sent to production users. The icon is native build configuration and requires an updated APK; JavaScript refresh alone cannot change it. Final notification placement/tint is controlled by the phone's Android notification UI. Physical-device checks remain: install the next APK over the current app, receive a new price notification with the app active/backgrounded/closed, and inspect lock screen and notification shade.

Reference: [Expo SDK 58 notification configuration](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/). The small icon uses the required monochrome transparent format; the larger image retains the existing colour logo.
