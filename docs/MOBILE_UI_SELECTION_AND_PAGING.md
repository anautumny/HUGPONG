# Mobile selection and pagination fixes

## Database / schema

No changes or migration. Pagination never removes or edits stored records.

## Server / API

No endpoint or authorization changes. Price history and analytics continue to use
the server's computed projections; paging displays the authorized, synchronized
records already available on the device, including cached records offline.
Existing API history limits and cursor-based archive loading are unchanged.

## Web

- Price history retains its existing 10-record pages; sorting returns to page 1.
- Its paging footer wraps on narrow displays.
- Brand containers compensate for the transparent padding in the shared emblem.
- Native select controls and explicit modal dismissal remain in place.

## Mobile

- Shared sheets have an opaque, clipped background, safe-area spacing, and a
  bounded layout. Searchable choices scroll inside the sheet with a virtualized
  list. Close controls have 44-point touch targets.
- Analytics pickers replace the filter contents within one sheet; Back returns
  to the filters. They no longer open a second native modal over the first.
- Reporting period includes All Months, including when no months are recorded.
  Changing farm clears the plot selection; changing cycle clears the month.
- The header displays the emblem at the same visual scale as the HUGPONG name.
- Added 10-item pages with ranges and Previous/Next controls to weekly/monthly
  price history, expense entity breakdowns, notifications, the manager's expanded
  activity list, supervised farms, pending sync changes, and the audit inbox.
- Price history starts with the newest period. Changing timeframe or scope
  resets the relevant page. Removing records clamps the page to a valid range.
- Existing operation/archive pages and cursor-based audit-history loading stay
  in place. The audit inbox no longer silently hides reports after item 20.
- Outside taps do not dismiss sheets. Selection, explicit controls, and native
  Back retain their intended behavior.

## Verification

Four regression tests exercise pagination transitions, selection/search callbacks,
the single-sheet analytics flow, and interrupted sheet transitions using a mocked
native runtime. The release gate checks the server and Web suites, authority and
binding audits, the Web build, and the Android Hermes export.

No device/emulator was connected for visual verification. Before releasing a new
APK, check short/long selections, search with the keyboard open, analytics Back,
large text, landscape, safe-area spacing, logo alignment, and history paging on
Android and iOS. These changes have not been deployed or packaged as a new APK.
