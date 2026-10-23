'use strict';

const router = require('express').Router();
const crypto = require('node:crypto');
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { COLLECTIONS, nowIso } = require('../schema/firestoreSchema');

// State belongs to the authenticated account. Callers cannot select another
// user, change notification content, or reverse an existing read/dismissal.
function context(req) {
  const user = req.authUser || req.session?.user || {};
  const userId = String(user.employeeId || user.userId || user.uid || '').trim();
  if (!userId) throw Object.assign(new Error('Authentication is required.'), { status: 401 });
  if (req.body?.expectedUserId !== userId) throw Object.assign(new Error('The notification account changed. Refresh your session.'), { status: 409 });
  const supplied = req.body?.ids;
  if (!Array.isArray(supplied) || supplied.length > 100 || supplied.some(id => typeof id !== 'string' || !id.trim() || id.length > 300)) {
    throw Object.assign(new Error('Supply at most 100 valid notification IDs.'), { status: 400 });
  }
  const ids = [...new Set(supplied.map(id => id.trim()))];
  const refs = ids.map(id => db.collection(COLLECTIONS.NOTIFICATION_STATES).doc(
    crypto.createHash('sha256').update(JSON.stringify([userId, id])).digest('hex')
  ));
  return { userId, ids, refs };
}

const projection = (id, value = {}) => ({ id, read: value.read === true || value.dismissed === true, dismissed: value.dismissed === true });

router.post('/state/query', requireAuth, async (req, res) => {
  try {
    const { ids, refs } = context(req);
    const docs = refs.length ? await db.getAll(...refs) : [];
    return res.json({ success: true, data: docs.map((doc, index) => projection(ids[index], doc.data())) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/state', requireAuth, async (req, res) => {
  try {
    const { userId, ids, refs } = context(req);
    const action = req.body?.action;
    if (!['read', 'dismiss'].includes(action)) return res.status(400).json({ success: false, error: 'Choose read or dismiss.' });
    const data = await db.runTransaction(async transaction => {
      const docs = await Promise.all(refs.map(ref => transaction.get(ref)));
      const now = nowIso();
      return docs.map((doc, index) => {
        const previous = doc.data() || {};
        const dismissed = action === 'dismiss' || previous.dismissed === true;
        if (previous.read !== true || (dismissed && previous.dismissed !== true)) {
          transaction.set(refs[index], {
            userId, notificationId: ids[index], read: true, dismissed,
            readAt: previous.readAt || now,
            dismissedAt: dismissed ? previous.dismissedAt || now : null,
            updatedAt: now,
          });
        }
        return projection(ids[index], { read: true, dismissed });
      });
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

module.exports = router;
