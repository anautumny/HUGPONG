# HUGPONG Architecture and Directory Reference

## Repository structure

```text
HUGPONG/
|-- mobile/                         Expo / React Native Android client
|   |-- App.js                      application-level network/AppState sync triggers
|   |-- assets/                     mobile brand assets
|   `-- src/
|       |-- components/             reusable native UI and analytics components
|       |-- constants/              six-stage crop-cycle adapter
|       |-- data/                   local store, cache reconciliation, schema adapter
|       |-- domain/                 fourteen-operation catalogue adapter
|       |-- firebase/               read-only Firebase client initialization
|       |-- navigation/             stack and tab registration
|       |-- screens/                role-aware mobile screens
|       |-- services/               auth, outbox, sync, storage, network, telemetry
|       `-- utils/                  pure mobile helpers
|-- server/                         Node / Express authority and security gateway
|   |-- domain/                     crop-stage contract and legacy bookmark mapping
|   |-- middleware/                 authentication, role, and Takeover guards
|   |-- routes/                     authenticated HTTP API controllers
|   |-- schema/                     canonical Firestore serializers and validators
|   |-- scripts/                    gated development reset/bootstrap utilities
|   |-- security/                   token, password, OTP, claims, Takeover signing
|   |-- services/                   domain transactions and scope services
|   |-- tests/                      server, security, parity, and runtime regressions
|   `-- server.js                   API and React production host
|-- web/react-app/                  canonical React / Vite / Tailwind web console
|   |-- public/                     production web assets
|   |-- src/
|   |   |-- components/             reusable React UI
|   |   |-- constants/              six-stage crop-cycle adapter
|   |   |-- context/                auth, sync, and theme state
|   |   |-- domain/                 fourteen-operation catalogue adapter
|   |   |-- services/               scoped reads and authoritative API mutations
|   |   |-- utils/                  role mapping and formatting
|   |   `-- views/                  routed role workspaces
|   `-- tests/                      web contract and parity regressions
|-- docs/                           historical audits and current documentation
|-- firestore.rules                 least-privilege client read rules
|-- firebase.json                   Firebase rule configuration
|-- run-server.bat                  start the backend API
|-- run-web.bat                     build and serve the React console
`-- run-mobile.bat                  start Expo
```

## Ownership boundaries

- Node/Express owns validation, authorization, and all canonical mutations.
- Firestore is the canonical cloud database. Client SDK access is read-only and scope constrained.
- React/Vite/Tailwind is the only active web UI. Old standalone HTML and DOM-driven dashboards were removed in Phase 8; legacy bookmark paths remain server redirects.
- React Native is the canonical Android UI.
- AsyncStorage and `@hugpong_outbox` own mobile offline persistence and retry state.
- Platform-local stage and operation adapters are protected by parity tests because Metro, Vite, and Node have different module/runtime boundaries.

Historical baseline documents describe earlier revisions and should not be treated as the current runtime architecture.
