const request = require('supertest');
const { createApp } = require('../src/app');
const { createTestPool, cleanDb, seedPoll } = require('./helpers');

let pool, app;
beforeAll(async () => {
  pool = await createTestPool();
  app = createApp(pool, null);
});
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await cleanDb(pool); });

describe('POST /api/polls', () => {
  test('creates a poll and returns 201', async () => {
    const res = await request(app).post('/api/polls').send({
      topic: 'Best programming language?',
      code: 'test-AB12',
      password: 'secret123',
      deduplication_mode: 'cookie',
    });
    expect(res.status).toBe(201);
    expect(res.body.poll.code).toBe('test-AB12');
    expect(res.body.poll.topic).toBe('Best programming language?');
    expect(res.body.poll.status).toBe('draft');
    expect(res.body.poll.password_hash).toBeUndefined();
  });

  test('rejects duplicate code with 409', async () => {
    await seedPoll(pool, { code: 'test-AB12' });
    const res = await request(app).post('/api/polls').send({
      topic: 'Another poll',
      code: 'test-AB12',
      password: 'secret123',
      deduplication_mode: 'cookie',
    });
    expect(res.status).toBe(409);
  });

  test('rejects password shorter than 6 chars', async () => {
    const res = await request(app).post('/api/polls').send({
      topic: 'Poll',
      code: 'test-CD34',
      password: 'abc',
      deduplication_mode: 'cookie',
    });
    expect(res.status).toBe(400);
  });

  test('rejects missing topic', async () => {
    const res = await request(app).post('/api/polls').send({
      code: 'test-EF56',
      password: 'secret123',
      deduplication_mode: 'cookie',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/polls/:code', () => {
  test('returns poll with empty options array', async () => {
    await seedPoll(pool, { code: 'test-AB12' });
    const res = await request(app).get('/api/polls/test-AB12');
    expect(res.status).toBe(200);
    expect(res.body.poll.code).toBe('test-AB12');
    expect(res.body.options).toEqual([]);
  });

  test('returns 404 for unknown code', async () => {
    const res = await request(app).get('/api/polls/unkn-0000');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/polls/:code/code-suggestions', () => {
  test('returns array of 3 unique codes', async () => {
    const res = await request(app).get('/api/polls/any-code/code-suggestions');
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(3);
    res.body.suggestions.forEach(s => {
      expect(s).toMatch(/^[a-z]{4,6}-[A-Z0-9]{4}$/);
    });
  });
});
