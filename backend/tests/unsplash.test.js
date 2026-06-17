const request = require('supertest');
const { createApp } = require('../src/app');
const { createTestPool } = require('./helpers');

let pool, app;
beforeAll(async () => {
  pool = await createTestPool();
  app = createApp(pool, null);
});
afterAll(async () => { await pool.end(); });

test('returns 400 when q param missing', async () => {
  const res = await request(app).get('/api/unsplash/search');
  expect(res.status).toBe(400);
});

test('returns { url } structure', async () => {
  if (!process.env.UNSPLASH_ACCESS_KEY) return; // skip in CI without key
  const res = await request(app).get('/api/unsplash/search?q=python');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('url');
});
