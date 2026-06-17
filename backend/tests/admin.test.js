const request = require('supertest');
const { createApp } = require('../src/app');
const { createTestPool, cleanDb, seedPoll, seedOption } = require('./helpers');

process.env.ADMIN_PATH = 'test-admin-xyz';
process.env.ADMIN_SECRET = 'supersecret';

let pool, app;
beforeAll(async () => {
  pool = await createTestPool();
  app = createApp(pool, null);
});
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await cleanDb(pool); });

const adminGet = (path) =>
  request(app).get(`/test-admin-xyz${path}`).set('X-Admin-Secret', 'supersecret');

const adminDel = (path) =>
  request(app).delete(`/test-admin-xyz${path}`).set('X-Admin-Secret', 'supersecret');

test('GET /dashboard returns stats', async () => {
  await seedPoll(pool, { code: 'test-AB12', status: 'active' });
  const res = await adminGet('/dashboard');
  expect(res.status).toBe(200);
  expect(typeof res.body.active_count).toBe('number');
  expect(typeof res.body.total_votes).toBe('number');
});

test('GET /dashboard returns 401 without secret', async () => {
  const res = await request(app).get('/test-admin-xyz/dashboard');
  expect(res.status).toBe(401);
});

test('GET /polls/:code returns poll and events', async () => {
  await seedPoll(pool, { code: 'test-AB12' });
  const res = await adminGet('/polls/test-AB12');
  expect(res.status).toBe(200);
  expect(res.body.poll.code).toBe('test-AB12');
  expect(Array.isArray(res.body.options)).toBe(true);
  expect(Array.isArray(res.body.events)).toBe(true);
});

test('DELETE /polls/:code hard-deletes poll with correct confirm_code', async () => {
  await seedPoll(pool, { code: 'test-AB12', status: 'closed' });
  const res = await adminDel('/polls/test-AB12').send({ confirm_code: 'test-AB12' });
  expect(res.status).toBe(204);
  const { rows } = await pool.query(`SELECT 1 FROM polls WHERE code = 'test-AB12'`);
  expect(rows).toHaveLength(0);
});

test('DELETE /polls/:code logs to admin_deletion_log', async () => {
  await seedPoll(pool, { code: 'test-AB12', status: 'closed' });
  await adminDel('/polls/test-AB12').send({ confirm_code: 'test-AB12' });
  const { rows } = await pool.query(`SELECT * FROM admin_deletion_log WHERE poll_code = 'test-AB12'`);
  expect(rows).toHaveLength(1);
  expect(rows[0].poll_topic).toBeTruthy();
});

test('DELETE /polls/:code rejects wrong confirm_code', async () => {
  await seedPoll(pool, { code: 'test-AB12' });
  const res = await adminDel('/polls/test-AB12').send({ confirm_code: 'wrong-code' });
  expect(res.status).toBe(400);
});
