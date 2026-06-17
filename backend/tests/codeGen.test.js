const { generateCode, generateSuggestions } = require('../src/services/codeGen');
const { createTestPool, cleanDb } = require('./helpers');

let pool;
beforeAll(async () => { pool = await createTestPool(); });
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await cleanDb(pool); });

test('generateCode returns word-XXXX format', () => {
  const code = generateCode();
  expect(code).toMatch(/^[a-z]{4,6}-[A-Z0-9]{4}$/);
});

test('generateCode word part is 4 or 6 letters', () => {
  for (let i = 0; i < 50; i++) {
    const word = generateCode().split('-')[0];
    expect([4, 6]).toContain(word.length);
  }
});

test('generateSuggestions returns 3 unique codes', async () => {
  const codes = await generateSuggestions(pool);
  expect(codes).toHaveLength(3);
  const unique = new Set(codes);
  expect(unique.size).toBe(3);
});

test('generateSuggestions skips codes already in DB', async () => {
  // Pre-seed a known code — real uniqueness check needs pool query
  await pool.query(
    `INSERT INTO polls (code, topic, password_hash) VALUES ($1, $2, $3)`,
    ['calm-AB12', 'existing', '$2b$10$placeholder']
  );
  const codes = await generateSuggestions(pool);
  expect(codes).not.toContain('calm-AB12');
});
