const request = require('supertest');
const { createApp } = require('../src/app');
const { createTestPool, cleanDb, seedPoll } = require('./helpers');

let pool, app;
const mockWs = { broadcast: jest.fn() };

beforeAll(async () => {
  pool = await createTestPool();
  app = createApp(pool, mockWs);
});
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await cleanDb(pool); mockWs.broadcast.mockClear(); });

describe('POST /api/polls/:code/auth', () => {
  test('returns 204 for correct password', async () => {
    await seedPoll(pool, { code: 'test-AB12', password: 'testpass' });
    const res = await request(app).post('/api/polls/test-AB12/auth').send({ password: 'testpass' });
    expect(res.status).toBe(204);
  });

  test('returns 401 for wrong password', async () => {
    await seedPoll(pool, { code: 'test-AB12', password: 'testpass' });
    const res = await request(app).post('/api/polls/test-AB12/auth').send({ password: 'wrong' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/polls/:code/close', () => {
  test('closes an active poll', async () => {
    await seedPoll(pool, { code: 'test-AB12', status: 'active', password: 'testpass' });
    const res = await request(app).post('/api/polls/test-AB12/close').send({ password: 'testpass' });
    expect(res.status).toBe(200);
    expect(res.body.poll.status).toBe('closed');
    expect(res.body.poll.closed_at).toBeTruthy();
    expect(mockWs.broadcast).toHaveBeenCalledWith('test-AB12', { type: 'poll_closed' });
  });

  test('returns 401 for wrong password', async () => {
    await seedPoll(pool, { code: 'test-AB12', status: 'active', password: 'testpass' });
    const res = await request(app).post('/api/polls/test-AB12/close').send({ password: 'bad' });
    expect(res.status).toBe(401);
  });

  test('returns 403 for already-closed poll', async () => {
    await seedPoll(pool, { code: 'test-AB12', status: 'closed', password: 'testpass' });
    const res = await request(app).post('/api/polls/test-AB12/close').send({ password: 'testpass' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/polls/:code', () => {
  test('marks poll as deleted', async () => {
    await seedPoll(pool, { code: 'test-AB12', status: 'closed', password: 'testpass' });
    const res = await request(app).delete('/api/polls/test-AB12').send({ password: 'testpass' });
    expect(res.status).toBe(204);
    const { rows } = await pool.query(`SELECT visibility FROM polls WHERE code = 'test-AB12'`);
    expect(rows[0].visibility).toBe('deleted');
  });

  test('returns 404 after deletion (GET)', async () => {
    await seedPoll(pool, { code: 'test-AB12', status: 'closed', password: 'testpass' });
    await request(app).delete('/api/polls/test-AB12').send({ password: 'testpass' });
    const res = await request(app).get('/api/polls/test-AB12');
    expect(res.status).toBe(404);
  });
});
