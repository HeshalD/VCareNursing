// SUPER_ADMIN "override" delete for a client profile.
//
// The normal delete (clientController.deleteClientProfile) only removes the users
// row and relies on FK cascades, so it fails with 23503 as soon as the client has
// bookings, invoices, payments, etc. This walks the FK graph (pg_constraint) from
// the client outwards, deletes every dependent row leaf-first, then removes the
// client profile and its login account — all inside one transaction.
//
// Rules for a row that points at something being deleted:
//   * FK straight to client_profiles  -> the row belongs to the client: delete it
//   * NOT NULL FK anywhere deeper      -> the row cannot exist without its parent: delete it
//   * nullable FK deeper, or to users  -> the row has its own life (staff pay, audit
//                                         trails, created_by columns): set the column
//                                         NULL rather than destroy it
//
// A dry run executes the exact same walk and rolls back, so the counts shown to the
// admin are what a real delete would remove.
const db = require('../config/db');

const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;

async function getReferencingKeys(tx, ctx, table) {
  if (ctx.fkCache.has(table)) return ctx.fkCache.get(table);
  const { rows } = await tx.query(
    `SELECT c.conrelid::regclass::text AS child_table,
            ca.attname                 AS child_col,
            pa.attname                 AS parent_col,
            NOT ca.attnotnull          AS nullable
       FROM pg_constraint c
       JOIN pg_attribute ca ON ca.attrelid = c.conrelid  AND ca.attnum = c.conkey[1]
       JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
      WHERE c.contype = 'f'
        AND c.confrelid = $1::regclass
        AND array_length(c.conkey, 1) = 1`,
    [table]
  );
  const keys = rows.map((r) => ({
    childTable: r.child_table,
    childCol: r.child_col,
    parentCol: r.parent_col,
    nullable: r.nullable,
  }));
  ctx.fkCache.set(table, keys);
  return keys;
}

function bump(map, table, n) {
  if (n > 0) map[table] = (map[table] || 0) + n;
}

// Deletes the rows of `table` matching whereSql, after clearing everything that
// references them.
async function purgeRows(tx, ctx, table, whereSql, params) {
  const keys = await getReferencingKeys(tx, ctx, table);

  for (const fk of keys) {
    const { rows } = await tx.query(
      `SELECT DISTINCT ${ident(fk.parentCol)} AS v FROM ${table} WHERE ${whereSql}`,
      params
    );
    const seenKey = `${fk.childTable}.${fk.childCol}`;
    const seen = ctx.seen.get(seenKey) || new Set();
    ctx.seen.set(seenKey, seen);
    const fresh = rows.map((r) => r.v).filter((v) => v != null && !seen.has(String(v)));
    if (fresh.length === 0) continue;
    fresh.forEach((v) => seen.add(String(v)));

    if (fk.nullable && table !== 'client_profiles') {
      const res = await tx.query(
        `UPDATE ${fk.childTable} SET ${ident(fk.childCol)} = NULL WHERE ${ident(fk.childCol)} = ANY($1)`,
        [fresh]
      );
      bump(ctx.unlinked, fk.childTable, res.rowCount);
    } else {
      await purgeRows(tx, ctx, fk.childTable, `${ident(fk.childCol)} = ANY($1)`, [fresh]);
    }
  }

  const res = await tx.query(`DELETE FROM ${table} WHERE ${whereSql}`, params);
  bump(ctx.deleted, table, res.rowCount);
}

/**
 * @param {string}  clientProfileId
 * @param {object}  opts
 * @param {boolean} opts.dryRun  when true, nothing is committed
 * @returns {Promise<{deleted: Object<string, number>, unlinked: Object<string, number>}>}
 *          or null when the client does not exist
 */
async function purgeClient(clientProfileId, { dryRun = false } = {}) {
  const tx = await db.pool.connect();
  const ctx = { fkCache: new Map(), seen: new Map(), deleted: {}, unlinked: {} };
  try {
    await tx.query('BEGIN');
    await tx.query('SET LOCAL statement_timeout = 0');

    const found = await tx.query(
      'SELECT user_id FROM client_profiles WHERE client_profile_id = $1 FOR UPDATE',
      [clientProfileId]
    );
    if (found.rows.length === 0) {
      await tx.query('ROLLBACK');
      return null;
    }
    const userId = found.rows[0].user_id;

    await purgeRows(tx, ctx, 'client_profiles', 'client_profile_id = $1', [clientProfileId]);
    if (userId) await purgeRows(tx, ctx, 'users', 'user_id = $1', [userId]);

    await tx.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    return { deleted: ctx.deleted, unlinked: ctx.unlinked };
  } catch (err) {
    try { await tx.query('ROLLBACK'); } catch (_) { /* connection already gone */ }
    throw err;
  } finally {
    tx.release();
  }
}

module.exports = { purgeClient };
