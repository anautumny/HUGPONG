# Beta 1.0.2 interface changes

## Database / schema

Registration selection and APK downloads require no database changes. Historical price statuses and import details are documented separately in [Historical SRA prices](HISTORICAL_SRA_PRICES.md).

## Server / API

`GET /downloads/android/:version` is public and precedes session creation. It streams only the GitHub APK declared in the server's checked-in release manifest. No request parameter can choose a destination URL. The response supplies an APK content type and `Content-Disposition: attachment`; the browser receives no GitHub redirect. Single byte ranges and HEAD requests are supported, and client disconnections cancel upstream streaming. Missing/obsolete releases return explicit errors.

Phone verification continues to use the existing server-authorized SMS/review endpoints. Selecting a method alone does not send an SMS or create a review request.

## Web

First-login phone verification uses outlined selection buttons, icons, a visible checked state, keyboard navigation, and a separate Continue button. Both methods have the same prominence before selection. The main Android download action uses HUGPONG's same-origin attachment endpoint; the separate GitHub Releases navigation link remains available. A browser or operating system can still ask where to save the file or whether to allow a download.

## Mobile

Registration and first-login verification share the same method-selection component, with large touch targets, radio semantics, distinct selected styling, and a separate Continue action. The alternative review action after SMS failure also has a strong outline and action icon. The server still determines eligibility, approval, and verification state. Existing SMS attempt locks and loading guards remain in effect.

## Validation

Server integration tests exercise direct attachment download, no redirects, fixed artifact selection, byte ranges, obsolete versions, upstream failure, and rejected destinations. The updated verification selection is included in onboarding contracts and the Android bundle/build. Physical-device registration and real-browser download acceptance remain operator checks.
