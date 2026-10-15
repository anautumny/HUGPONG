'use strict';

const router = require('express').Router();
const { db } = require('../firebase-admin');
const { COLLECTIONS } = require('../schema/firestoreSchema');
const { selection, assertSra, compilationOptions, compileCropYear, compilationHtml } = require('../services/cropYearCompilationService');

router.use((req, res, next) => {
  try {
    assertSra(req.authUser || req.session?.user);
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    next();
  } catch (error) { return res.status(error.status || 500).json({ success: false, error: error.message }); }
});
const actor = req => req.authUser || req.session.user;
router.get('/options', async (req, res) => {
  try { return res.json({ success: true, data: await compilationOptions(db, actor(req)) }); }
  catch (error) { return res.status(error.status || 500).json({ success: false, error: error.message }); }
});
router.get('/preview', async (req, res) => {
  try { return res.json({ success: true, data: await compileCropYear(db, actor(req), req.query, { preview: true }) }); }
  catch (error) { return res.status(error.status || 500).json({ success: false, error: error.message }); }
});
router.get('/', async (req, res) => {
  try {
    const scope = selection(req.query);
    let query = db.collection(COLLECTIONS.CROP_YEAR_COMPILATIONS).where('cropYearCycle', '==', scope.cropYearCycle).where('blockFarmId', '==', scope.blockFarmId).orderBy('compiledAt', 'desc');
    if (req.query.cursor) {
      const cursor = await db.collection(COLLECTIONS.CROP_YEAR_COMPILATIONS).doc(String(req.query.cursor)).get();
      if (!cursor.exists || cursor.data().cropYearCycle !== scope.cropYearCycle || cursor.data().blockFarmId !== scope.blockFarmId) {
        return res.status(400).json({ success: false, error: 'Compilation cursor does not match the selected scope.' });
      }
      query = query.startAfter(cursor);
    }
    const snapshot = await query.limit(21).get();
    const data = snapshot.docs.slice(0, 20).map(document => ({ ...document.data(), id: document.id }));
    return res.json({ success: true, data, hasMore: snapshot.docs.length > 20, nextCursor: snapshot.docs.length > 20 ? data.at(-1).id : null });
  } catch (error) { return res.status(error.status || 500).json({ success: false, error: error.message }); }
});
router.post('/', async (req, res) => {
  try {
    const data = await compileCropYear(db, actor(req), req.body);
    return res.status(data.replayed ? 200 : 201).json({ success: true, data });
  } catch (error) { return res.status(error.status || 500).json({ success: false, error: error.message }); }
});
router.get('/:id/print', async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTIONS.CROP_YEAR_COMPILATIONS).doc(String(req.params.id)).get();
    if (!snapshot.exists) return res.status(404).json({ success: false, error: 'Crop Year compilation was not found.' });
    return res.json({ success: true, data: { html: compilationHtml({ ...snapshot.data(), id: snapshot.id }) } });
  } catch (error) { return res.status(error.status || 500).json({ success: false, error: error.message }); }
});
module.exports = router;
