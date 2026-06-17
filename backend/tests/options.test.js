const request = require('supertest');
const { createApp } = require('../src/app');
const { createTestPool, cleanDb, seedPoll, seedOption } = require('./helpers');
const bcrypt = require('bcrypt');

let pool, app;
const mockWs = { broadcast: jest.fn() };

beforeAll(async () => {
  pool = await createTestPool();
  app = createApp(pool, mockWs);
});
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await cleanDb(pool); mockWs.broadcast.mockClear(); });

test('adds option to draft poll', async () => {
  const poll = await seedPoll(pool, { code: 'test-AB12', password: 'testpass' });
  const res = await request(app)
    .post('/api/polls/test-AB12/options')
    .send({ name: 'Python', password: 'testpass' });
  expect(res.status).toBe(201);
  expect(res.body.option.name).toBe('Python');
  expect(res.body.option.locked).toBe(false);
});

test('adds option to active poll', async () => {
  await seedPoll(pool, { code: 'test-AB12', status: 'active', password: 'testpass' });
  const res = await request(app)
    .post('/api/polls/test-AB12/options')
    .send({ name: 'JavaScript', password: 'testpass' });
  expect(res.status).toBe(201);
});

test('rejects wrong password', async () => {
  await seedPoll(pool, { code: 'test-AB12', password: 'testpass' });
  const res = await request(app)
    .post('/api/polls/test-AB12/options')
    .send({ name: 'Rust', password: 'wrongpass' });
  expect(res.status).toBe(401);
});

test('rejects option add on closed poll', async () => {
  await seedPoll(pool, { code: 'test-AB12', status: 'closed', password: 'testpass' });
  const res = await request(app)
    .post('/api/polls/test-AB12/options')
    .send({ name: 'Go', password: 'testpass' });
  expect(res.status).toBe(403);
});

test('rejects empty option name', async () => {
  await seedPoll(pool, { code: 'test-AB12', password: 'testpass' });
  const res = await request(app)
    .post('/api/polls/test-AB12/options')
    .send({ name: '', password: 'testpass' });
  expect(res.status).toBe(400);
});
