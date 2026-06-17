const { closeOverduePolls } = require('../src/services/scheduler');
const { createTestPool, cleanDb, seedPoll } = require('./helpers');

let pool;
const mockWs = { broadcast: jest.fn() };

beforeAll(async () => { pool = await createTestPool(); });
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await cleanDb(pool); mockWs.broadcast.mockClear(); });

test('closes polls past their auto_close_at and broadcasts poll_closed', async () => {
  await seedPoll(pool, {
    code: 'test-AB12',
    status: 'active',
    // auto_close_at in the past
  });
  await pool.query(
    `UPDATE polls SET auto_close_at = NOW() - INTERVAL '1 minute' WHERE code = 'test-AB12'`
  );

  await closeOverduePolls(pool, mockWs);

  const { rows } = await pool.query(`SELECT status FROM polls WHERE code = 'test-AB12'`);
  expect(rows[0].status).toBe('closed');
  expect(mockWs.broadcast).toHaveBeenCalledWith('test-AB12', { type: 'poll_closed' });
});

test('does not close polls with future auto_close_at', async () => {
  await seedPoll(pool, { code: 'test-AB12', status: 'active' });
  await pool.query(
    `UPDATE polls SET auto_close_at = NOW() + INTERVAL '1 hour' WHERE code = 'test-AB12'`
  );

  await closeOverduePolls(pool, mockWs);

  const { rows } = await pool.query(`SELECT status FROM polls WHERE code = 'test-AB12'`);
  expect(rows[0].status).toBe('active');
  expect(mockWs.broadcast).not.toHaveBeenCalled();
});
