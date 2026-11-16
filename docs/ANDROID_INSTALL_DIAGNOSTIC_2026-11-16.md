# Android 1.1.3 installation investigation

16 November 2026. Status: the user reports the direct GitHub download works. The exact phone-specific installer failure was not reproduced. No replacement Android binary was required; the website download-button follow-up is documented separately.

## Report

The phone displays “App not installed as package appears to be invalid” when opening the website-downloaded 1.1.3 APK. The user reports that the error persists after uninstalling. The exact phone model, OS version and Android package-manager failure code are unavailable. The user subsequently reports that the direct GitHub download works. This identifies a working delivery path without proving which phone/browser/proxy condition caused the earlier message.

## Artifact and delivery checks

- Package `com.hugpong.app`, version 1.1.3, version code 15, minimum SDK 24 and target SDK 36.
- Android manifest matches 1.1.2 except the version name and version code. All 97 compared native-library/DEX entries are byte-identical between the two releases.
- Android apksigner verifies the cryptographic signature, and the certificate matches previous releases.
- ZIP decompression of all 1,406 entries succeeds. Android zipalign's 16 KB check passes.
- A fresh complete website download with Android browser-style headers is 112,789,895 bytes, with no content encoding and the correct attachment MIME type. Its SHA-256 matches the published artifact: `be026a8b25a9f99671bb45c51556a934875a023f3cd8fb064a96a9cd1fef3f1e`.

## Actual installation checks

The existing Android 14/API 34 emulator was started headless in a nonpersistent read-only session. Network was disabled before app testing. No physical phone, saved emulator image or production business records were changed.

1. An initial update over an old development build failed with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, as expected because that debug build uses a different signer. This is a test-device condition and does not establish the phone's cause.
2. After removing that development package only from the temporary emulator session, the signed 1.1.2 APK installed successfully.
3. Updating signed 1.1.2 to signed 1.1.3 succeeded without uninstalling the release app.
4. A separate clean 1.1.3 installation succeeded.
5. Its main activity launched successfully, and the installed version reads 1.1.3/code 15.

## Next diagnostic boundary

The screenshot alone does not distinguish a damaged phone download, residual differently signed installation/profile, or a phone-specific package-manager rejection. The verified artifact installs on the tested Android configuration; that is not proof it installs on the affected phone. Do not recommend uninstalling or clearing app data to diagnose this generic error. Obtain the direct-download result or exact installer failure code before claiming a cause or issuing a speculative rebuilt APK.

## Database and platform impact

Database/schema, API business logic, Web implementation and Mobile application source are unchanged. The direct APK is the same verified 1.1.3 artifact, not a separate business-data authority or a modified build. Existing server records remain available to the same account after successful installation and sign-in.

Evidence: `output/install-issue-emulator-verification.json`, `output/install-issue-browser-download.json`, `output/install-issue-native-comparison.json`, and the `output/install-issue-emulator-*.txt` installer logs.
