'use strict';

// Serialized, atomic transactions for behavioral tests; never initializes Firebase.
function memoryFirestore(seed = {}) {
  const records = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
  let pending = Promise.resolve();
  const snapshot = ref => ({ id: ref.id, ref, exists: records.has(ref.path), data: () => structuredClone(records.get(ref.path)) });
  const database = {
    records,
    collection(name) {
      const query = (filters = [], orders = [], maximum = Infinity, after = null) => ({
        where(field, op, expected) { return query([...filters, [field, op, expected]], orders, maximum, after); },
        orderBy(field, direction = 'asc') { return query(filters, [...orders, [field, direction]], maximum, after); },
        limit(value) { return query(filters, orders, value, after); },
        startAfter(...values) { return query(filters, orders, maximum, values[0]?.data ? orders.map(([field]) => field === '__name__' ? values[0].id : values[0].data()[field]) : values); },
        async get() {
          let rows = [...records].filter(([key, row]) => key.startsWith(`${name}/`) && filters.every(([field, op, expected]) => {
            const value = field === '__name__' ? key.slice(name.length + 1) : row[field];
            if (op === '==') return value === expected;
            if (op === 'in') return expected.includes(value);
            if (op === '>') return value > expected;
            if (op === '<=') return value <= expected;
            throw new Error(`Unsupported test query operator ${op}`);
          })).map(([key]) => snapshot(database.collection(name).doc(key.slice(name.length + 1))));
          const compare = (row, values) => {
            for (let index = 0; index < orders.length; index++) {
              const [field, direction] = orders[index];
              const value = field === '__name__' ? row.id : row.data()[field];
              const order = value < values[index] ? -1 : value > values[index] ? 1 : 0;
              if (order) return order * (direction === 'desc' ? -1 : 1);
            }
            return 0;
          };
          if (orders.length) rows.sort((a, b) => compare(a, orders.map(([field]) => field === '__name__' ? b.id : b.data()[field])));
          if (after) rows = rows.filter(row => compare(row, after) > 0);
          rows = rows.slice(0, maximum);
          return { docs: rows, empty: !rows.length, size: rows.length };
        }
      });
      return { ...query(), doc(id) {
        const ref = { id, path: `${name}/${id}` };
        ref.get = async () => snapshot(ref);
        ref.set = async (value, options) => records.set(ref.path, options?.merge ? { ...records.get(ref.path), ...structuredClone(value) } : structuredClone(value));
        ref.delete = async () => records.delete(ref.path);
        return ref;
      } };
    },
    async getAll(...refs) { return refs.map(snapshot); },
    runTransaction(work) {
      const run = pending.then(async () => {
        const writes = [];
        let writing = false;
        const writer = {
          async get(ref) { if (writing) throw new Error('Firestore transactions require all reads before writes.'); return ref.get(); },
          set(ref, value, options) { writing = true; writes.push(() => records.set(ref.path, options?.merge ? { ...records.get(ref.path), ...structuredClone(value) } : structuredClone(value))); },
          update(ref, value) { writing = true; writes.push(() => { if (!records.has(ref.path)) throw new Error('missing document'); records.set(ref.path, { ...records.get(ref.path), ...structuredClone(value) }); }); },
          create(ref, value) { writing = true; writes.push(() => { if (records.has(ref.path)) throw new Error('already exists'); records.set(ref.path, structuredClone(value)); }); },
          delete(ref) { writing = true; writes.push(() => records.delete(ref.path)); }
        };
        const result = await work(writer);
        const before = new Map(records);
        try { writes.forEach(write => write()); }
        catch (error) { records.clear(); before.forEach((value, key) => records.set(key, value)); throw error; }
        return result;
      });
      pending = run.catch(() => {});
      return run;
    }
  };
  return database;
}
module.exports = { memoryFirestore };
