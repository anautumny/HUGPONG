# Startup reads and Android download follow-up

16 November 2026. Status: implemented locally; verification and Web/API rollout pending. Android artifact remains the verified 1.1.3 APK.

## Report and interpretation

The user reports more than 1,000 Firestore reads during the first ten minutes using Web and Mobile and confirms Mobile was still an older version. That interval does not isolate the full 1.1.3 client optimizations. Initial field/operation/history loading can produce a burst; continued idle growth at the same rate requires investigation. Firestore reads measure returned documents and other applicable query costs, not HTTP request count. No production usage attribution or per-account inventory was inferred from the screenshot.

At 1,000 additional reads per ten minutes sustained across the project, 50,000 reads would be reached after about eight hours twenty minutes, excluding other work. This is rate arithmetic, not a forecast of this user's traffic. Source: https://firebase.google.com/docs/firestore/pricing and https://firebase.google.com/docs/firestore/quotas.

## Database and server

No schema, index or record migration. Every opening/reopening of a sync stream previously called global cache invalidation, including on the single-writer production Worker. That flushed unrelated owners' response and authorization caches despite no record change. Production streams now preserve those caches. Canonical writes still invalidate dependencies before acknowledgement, startup hydration still invalidates, and stream authentication/periodic reauthorization remain unchanged. Multi-writer Node hosts retain the conservative stream catch-up invalidation.

A mocked regression opens twenty streams while reusing two owners' cached reads. Two initial query executions remain two after all reconnects. Publishing a field mutation then requires two fresh scoped executions. Owner isolation and Node behavior are also checked.

## Web

The user confirms the direct GitHub download works after the website-proxied download produced an Android invalid-package message. The main Android button now points directly to the exact verified artifact URL in the release manifest. GitHub serves the existing signed 1.1.3 APK and its attachment filename. The existing same-origin route remains available for compatibility. The phone-specific failure mechanism was not reproduced; this change uses the working delivery path without claiming APK corruption.

## Mobile

No Android application source or binary change is needed for this follow-up. The server cache fix benefits both platforms. Install the verified 1.1.3 APK to use the earlier approval, notification, always-on-sync and targeted-refresh changes. Existing Mobile first load/reconnect/foreground recovery remains unchanged; avoid weakening offline catch-up based only on an unmeasured aggregate read total.

## Verification and limits

Pending full local gate and live Web/API verification. Do not treat a startup count or a mock budget as proof of actual daily production consumption. Compare additional reads after the latest APK has loaded and settled, separating active navigation/submissions from idle time and other clients or Firebase-console activity.
