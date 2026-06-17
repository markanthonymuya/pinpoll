const request = require('supertest');
const crypto = require('crypto');
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

async function setupActivePollWithOption() {
  const poll = await seedPoll(pool, { code: 'test-AB12', status: 'active' });
  const option = await seedOption(pool, poll.id, { name: 'Python' });
  return { poll, option };
}

test('casts vote in cookie mode and returns 201', async () => {
  const { poll, option } = await setupActivePollWithOption();
  const token = crypto.randomUUID();
  const res = await request(app)
    .post('/api/polls/test-AB12/vote')
    .set('Cookie', `pinpoll_session=${token}`)
    .send({ option_id: option.id });
  expect(res.status).toBe(201);
  expect(res.body.vote_event.option_id).toBe(option.id);
  expect(mockWs.broadcast).toHaveBeenCalledWith('test-AB12', expect.objectContaining({ type: 'vote_cast' }));
});

test('activates draft poll on first vote', async () => {
  const poll = await seedPoll(pool, { code: 'test-AB12', status: 'draft' });
  const option = await seedOption(pool, poll.id);
  const token = crypto.randomUUID();
  await request(app)
    .post('/api/polls/test-AB12/vote')
    .set('Cookie', `pinpoll_session=${token}`)
    .send({ option_id: option.id });
  const { rows } = await pool.query('SELECT status FROM polls WHERE code = $1', ['test-AB12']);
  expect(rows[0].status).toBe('active');
});

test('locks all existing options on first vote', async () => {
  const poll = await seedPoll(pool, { code: 'test-AB12', status: 'draft' });
  const opt1 = await seedOption(pool, poll.id, { name: 'A' });
  const opt2 = await seedOption(pool, poll.id, { name: 'B', display_order: 1 });
  const token = crypto.randomUUID();
  await request(app)
    .post('/api/polls/test-AB12/vote')
    .set('Cookie', `pinpoll_session=${token}`)
    .send({ option_id: opt1.id });
  const { rows } = await pool.query('SELECT locked FROM options WHERE poll_id = $1', [poll.id]);
  expect(rows.every(r => r.locked)).toBe(true);
});

test('rejects duplicate vote in cookie mode with 409', async () => {
  const { poll, option } = await setupActivePollWithOption();
  const token = crypto.randomUUID();
  await request(app)
    .post('/api/polls/test-AB12/vote')
    .set('Cookie', `pinpoll_session=${token}`)
    .send({ option_id: option.id });
  const res2 = await request(app)
    .post('/api/polls/test-AB12/vote')
    .set('Cookie', `pinpoll_session=${token}`)
    .send({ option_id: option.id });
  expect(res2.status).toBe(409);
});

test('rejects vote on closed poll', async () => {
  const poll = await seedPoll(pool, { code: 'test-AB12', status: 'closed' });
  const option = await seedOption(pool, poll.id);
  const token = crypto.randomUUID();
  const res = await request(app)
    .post('/api/polls/test-AB12/vote')
    .set('Cookie', `pinpoll_session=${token}`)
    .send({ option_id: option.id });
  expect(res.status).toBe(403);
});

test('casts vote in email_hash mode', async () => {
  const poll = await seedPoll(pool, { code: 'test-AB12', status: 'active', deduplication_mode: 'email_hash' });
  const option = await seedOption(pool, poll.id);
  const res = await request(app)
    .post('/api/polls/test-AB12/vote')
    .send({ option_id: option.id, email: 'voter@example.com' });
  expect(res.status).toBe(201);
});

test('rejects duplicate email in email_hash mode with 409', async () => {
  const poll = await seedPoll(pool, { code: 'test-AB12', status: 'active', deduplication_mode: 'email_hash' });
  const option = await seedOption(pool, poll.id);
  await request(app)
    .post('/api/polls/test-AB12/vote')
    .send({ option_id: option.id, email: 'voter@example.com' });
  const res2 = await request(app)
    .post('/api/polls/test-AB12/vote')
    .send({ option_id: option.id, email: 'voter@example.com' });
  expect(res2.status).toBe(409);
});
