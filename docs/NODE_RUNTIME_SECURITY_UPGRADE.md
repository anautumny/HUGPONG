# Node.js runtime security baseline

The HUGPONG baseline is **Node.js 24.22.1 LTS** following the
[October 21, 2026 Node.js security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
The previous local v24.14.0 predates these fixes. This is a runtime update, not
evidence that the application has been compromised.

## Database / schema

No schema changes or data migration.

## Server / API

- `.node-version` selects 24.22.1 for managed hosting and local version managers.
- Root and Server package engines require `>=24.22.1 <25` so an older or
  untested major runtime is not selected by the declared compatibility range.
- The server logs its actual Node.js version at startup for operator verification.
- API contracts, permissions, and database authority are unchanged.

## Web

The Web build uses the same Node 24 security baseline in its package engines and
lockfile metadata. The browser runs the generated JavaScript, not Node.js.

## Mobile

Mobile package engines and all EAS build profiles select the patched Node 24
baseline. Installed Android/iOS apps run their native JavaScript runtime; Node.js
is used by Expo/Metro and the shared backend. A Node-only security update does not
require users to reinstall an APK.

## CI and validation

GitHub Actions reads `.node-version`, installs all three locked dependency sets,
and runs `npm run verify:release`. When upgrading the security baseline later,
update `.node-version`, the package engine minimums and lockfile metadata, and the
three `mobile/eas.json` profile versions together.

Validate the full release gate using the patched runtime, including Server and
Web tests, Web build, Android Hermes export, and configuration/authority audits.
Downloading a portable official distribution allows this check before changing
the machine-wide Windows installation. Verify distribution SHA256 hashes against
the [official release checksums](https://nodejs.org/en/blog/release/v24.22.1) and the
Windows installer's Authenticode signature before installation.

Verified on October 23, 2026: the full release gate passed under v24.22.1
(555 Server tests, 38 Web tests, Web production build, and Android Hermes export).
The Windows installation was then upgraded to v24.22.1 with npm 11.12.1. Its
`node.exe` SHA256 matches the official portable binary used for validation.

## Deployment verification

Changing repository files does not update an already-running service. After an
authorized redeploy, confirm the build log and startup log both show v24.22.1 or a
newer patched Node 24 release, then check `/health/ready`.

On Render, a service-level `NODE_VERSION` environment variable overrides
`.node-version`. If configured, update it to `24.22.1` or remove the override so
the repository file applies. See [Render's precedence rules](https://render.com/docs/node-version).
Inspect Render's service Root Directory setting too; if it points to `server/`,
the server's bounded `engines.node` range provides the fallback when the root
version file is outside that directory. The live Render runtime has not been
changed by these local edits.

After Windows installation, open a fresh terminal and run `node --version` and
`npm --version`. Restart any local server, Expo process, or IDE terminal that was
already running: existing processes keep their original runtime until restarted.
