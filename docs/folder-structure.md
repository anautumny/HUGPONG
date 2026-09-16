# HUGPONG — System Architecture & Directory Reference

## 🌟 Overview
HUGPONG is an offline-first agricultural management platform for sugarcane block farming, supporting Silay Sugar Regulatory Administration (SRA), Farm Managers, and cooperative Members.

---

## 📁 Repository Directory Structure

```
HUGPONG/
│
├── shared/                                 ← Universal Shared Configuration
│   └── firebase-config.js                  ← Single source of truth for Firebase project (hugpong-ff)
│
├── web/                                    ← Web Client Application
│   ├── index.html                          ← Public portal & app landing
│   ├── login.html                          ← Role-aware login portal with Express auth
│   ├── dashboard.html                      ← Workspace auto-redirector
│   ├── admin.css                           ← Global styling and theme tokens
│   ├── logo.png                            ← Platform brand logo
│   ├── shared/                             ← Web Shared Infrastructure
│   │   ├── firebase-init.js                ← Web Firebase SDK connector & event emitter
│   │   ├── webDataStore.js                 ← Empty-state store & SRA domain configuration
│   │   └── core.js                         ← Database engine, Firestore listeners, session verification
│   │
│   └── roles/                              ← Role-Isolated Workspaces
│       ├── super-admin/
│       │   ├── dashboard.html              ← Super Admin console
│       │   └── super-admin.js              ← User management & system governance
│       ├── sra-admin/
│       │   ├── dashboard.html              ← SRA Administrator console
│       │   └── sra-admin.js                ← SRA weekly prices & QR audit desk
│       └── farm-manager/
│           ├── dashboard.html              ← Block farm operations workspace
│           └── farm-manager.js             ← Field plot allocations & log certification
│
├── server/                                 ← Backend API & Security Gateway
│   ├── server.js                           ← Express server application (port 3000)
│   ├── firebase-admin.js                   ← Firebase Admin SDK initializer
│   ├── package.json                        ← Dependencies: express, firebase-admin, express-session, cors
│   │
│   ├── middleware/
│   │   ├── auth.js                         ← Session verification guard
│   │   └── roleGuard.js                    ← Role authorization clearance middleware
│   │
│   └── routes/
│       ├── auth.js                         ← /auth/login, /auth/logout, /auth/session
│       ├── prices.js                       ← /api/prices
│       ├── users.js                        ← /api/users, /api/users/approve
│       ├── fields.js                       ← /api/fields
│       ├── logs.js                         ← /api/logs, /api/logs/certify
│       └── tickets.js                      ← /api/tickets
│
├── mobile/                                 ← React Native (Expo) Mobile Application
│   ├── App.js
│   ├── index.js
│   ├── app.json
│   ├── package.json
│   │
│   └── src/
│       ├── firebase/config.js              ← React Native Firebase SDK initializer
│       ├── data/dataStore.js               ← Production data store & local cache
│       ├── services/                       ← syncEngine.js, storageService.js, i18n.js
│       ├── components/                     ← AppHeader.js, EmptyState.js, ErrorState.js
│       ├── navigation/RootNavigator.js     ← Tab & stack navigation
│       ├── theme.js                        ← Colors, fonts, spacing, shadows
│       └── screens/
│           ├── HomeScreen.js               ← Modular role router
│           ├── FieldOpsScreen.js           ← Crop cycle operations
│           ├── AnalyticsScreen.js          ← Financial & yield analytics
│           ├── PlannerScreen.js            ← Crop cycle stage planner
│           ├── ProfileScreen.js            ← Profile & preferences
│           ├── SecurityScreen.js           ← PIN & biometric lock
│           ├── SyncMonitorScreen.js        ← Member telemetry & sync health
│           ├── member/                     ← Member-specific modular views
│           ├── manager/                    ← Farm Manager-specific modular views
│           ├── sra/                        ← SRA Admin-specific modular views
│           └── auth/                       ← Login, Register, Forgot Password, Onboarding
│
├── docs/                                   ← Project Documentation
│   ├── system_flow_audit.md                ← Full security & connectivity audit report
│   └── folder-structure.md                 ← Architecture & conventions documentation
│
├── run-web.bat                             ← Launches Web Console
├── run-mobile.bat                          ← Starts Expo development server
└── run-server.bat                          ← Starts Express backend server
```
