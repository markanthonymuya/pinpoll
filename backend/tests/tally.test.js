const request = require('supertest');
const { createApp } = require('../src/app');
const { createTestPool, cleanDb, seedPoll, seedOption } = require('./helpers');

let pool, app;
const mockWs = { broadcast: jest.fn() };

beforeAll(async () => {
  pool = await createTestPool();
  app = createApp(pool, mockWs);
});
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await cleanDb(pool); mockWs.broadcast.mockClear(); });

test('initiator tally tap records initiator_tap vote', async () => {
  const poll = await seedPoll(pool, { code: 'test-AB12', status: 'active', password: 'testpass' });
  const option = await seedOption(pool, poll.id);
  const res = await request(app)
    .post('/api/polls/test-AB12/tally')
    .send({ option_id: option.id, password: 'testpass' });
  expect(res.status).toBe(201);
  expect(res.body.vote_event.source).toBe('initiator_tap');
  expect(mockWs.broadcast).toHaveBeenCalledWith('test-AB12', expect.objectContaining({ type: 'tally_tap' }));
});

test('initiator can tap multiple times (no dedup)', async () => {
  const poll = await seedPoll(pool, { code: 'test-AB12', status: 'active', password: 'testpass' });
  const option = await seedOption(pool, poll.id);
  await request(app).post('/api/polls/test-AB12/tally').send({ option_id: option.id, password: 'testpass' });
  const res2 = await request(app).post('/api/polls/test-AB12/tally').send({ option_id: option.id, password: 'testpass' });
  expect(res2.status).toBe(201);
});

test('rejects wrong password', async () => {
  const poll = await seedPoll(pool, { code: 'test-AB12', status: 'active', password: 'testpass' });
  const option = await seedOption(pool, poll.id);
  const res = await request(app)
    .post('/api/polls/test-AB12/tally')
    .send({ option_id: option.id, password: 'wrong' });
  expect(res.status).toBe(401);
});

test('rejects tally on closed poll', async () => {
  const poll = await seedPoll(pool, { code: 'test-AB12', status: 'closed', password: 'testpass' });
  const option = await seedOption(pool, poll.id);
  const res = await request(app)
    .post('/api/polls/test-AB12/tally')
    .send({ option_id: option.id, password: 'testpass' });
  expect(res.status).toBe(403);
});
