# HUGPONG System Architecture and Directory Reference

```text
HUGPONG/
├── firestore.rules                 authenticated read rules; canonical client writes denied
├── package.json                    root build/start/test shortcuts
├── run-web.bat                     builds/opens the root SPA through Express
├── server/
│   ├── server.js                   Express auth/API gateway and SPA history fallback
│   ├── routes/                     auth and server-authoritative domain endpoints
│   ├── services/                   lifecycle, scope, outbox/idempotency, SMS, reset services
│   ├── schema/                     canonical Firestore validation and relationships
│   ├── security/                   password, token, Firebase claims, and projections
│   ├── scripts/                    explicit development reset/bootstrap tools
│   └── tests/                      security, RBAC, lifecycle, outbox, and migration checks
├── web/
│   ├── react-app/
│   │   ├── index.html              the single maintained web HTML entry
│   │   ├── vite.config.js
│   │   └── src/
│   │       ├── auth/               React authentication context
│   │       ├── components/         shared presentation/layout components
│   │       ├── domain/             pure routing, price, and selector rules
│   │       ├── features/           registry, operations, regulatory, and system sections
│   │       ├── hooks/              replica/action hooks
│   │       ├── pages/              landing, legal, login, overview, workspace routing
│   │       └── services/           API, Firebase auth/read, session, and replica adapters
│   ├── react-dist/                 generated production build; ignored by Git
│   └── logo.png                    reusable brand asset
└── mobile/
    └── src/
        ├── data/                   local replica orchestration
        ├── domain/                 pure mobile business rules
        ├── services/               explicit outbox, API, storage, and Firebase reads
        ├── components/             reusable native UI
        └── screens/                role/mobile workflows
```

## Authority boundaries

- Firestore and Express are the canonical persistent system.
- Express owns all authentication and persistent mutations.
- Web and mobile use Firebase only for authenticated realtime reads.
- Mobile user actions create explicit outbox mutations; snapshots update the replica only.
- Web mutations go through focused API services; React components do not write to Firestore.
