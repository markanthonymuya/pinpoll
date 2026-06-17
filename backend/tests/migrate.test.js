const { createTestPool, cleanDb } = require('./helpers');

let pool;

beforeAll(async () => { pool = await createTestPool(); });
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await cleanDb(pool); });

test('polls table exists', async () => {
  const { rows } = await pool.query(`SELECT to_regclass('public.polls') AS t`);
  expect(rows[0].t).toBe('polls');
});

test('options table exists', async () => {
  const { rows } = await pool.query(`SELECT to_regclass('public.options') AS t`);
  expect(rows[0].t).toBe('options');
});

test('vote_events table exists', async () => {
  const { rows } = await pool.query(`SELECT to_regclass('public.vote_events') AS t`);
  expect(rows[0].t).toBe('vote_events');
});

test('admin_deletion_log table exists', async () => {
  const { rows } = await pool.query(`SELECT to_regclass('public.admin_deletion_log') AS t`);
  expect(rows[0].t).toBe('admin_deletion_log');
});
