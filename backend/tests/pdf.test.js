const request = require('supertest');
const { createApp } = require('../src/app');
const { createTestPool, cleanDb, seedPoll, seedOption } = require('./helpers');
const crypto = require('crypto');

let pool, app;
beforeAll(async () => {
  pool = await createTestPool();
  app = createApp(pool, null);
});
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await cleanDb(pool); });

test('GET /api/polls/:code/pdf returns PDF content-type', async () => {
  const poll = await seedPoll(pool, { code: 'test-AB12', status: 'closed' });
  await seedOption(pool, poll.id, { name: 'Python' });
  const res = await request(app).get('/api/polls/test-AB12/pdf');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('application/pdf');
  expect(res.headers['content-disposition']).toContain('test-AB12');
});

test('GET /api/polls/:code/pdf returns 404 for unknown poll', async () => {
  const res = await request(app).get('/api/polls/unkn-0000/pdf');
  expect(res.status).toBe(404);
});

test('PDF buffer starts with PDF magic bytes', async () => {
  const { generatePollPDF } = require('../src/services/pdfGen');
  const buf = await generatePollPDF({
    poll: { topic: 'Test', code: 'test-AB12', created_at: new Date(), closed_at: new Date() },
    options: [{ name: 'Python', vote_count: 10, percentage: 100 }],
    events: [{ source: 'self_vote', option_name: 'Python', timestamp: new Date() }],
  });
  expect(buf.slice(0, 4).toString()).toBe('%PDF');
});
