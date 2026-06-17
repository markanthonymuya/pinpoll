require('dotenv').config();
const { Pool } = require('pg');
const { runMigrations } = require('../src/db/migrate');
const bcrypt = require('bcrypt');

async function createTestPool() {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await runMigrations(pool);
  return pool;
}

async function cleanDb(pool) {
  await pool.query('DELETE FROM vote_events');
  await pool.query('DELETE FROM options');
  await pool.query('DELETE FROM polls');
  await pool.query('DELETE FROM admin_deletion_log');
}

async function seedPoll(pool, overrides = {}) {
  const passwordHash = await bcrypt.hash(overrides.password || 'testpass', 10);
  const code = overrides.code || 'test-AB12';
  const { rows } = await pool.query(
    `INSERT INTO polls (code, topic, password_hash, status, deduplication_mode)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      code,
      overrides.topic || 'Test Topic',
      passwordHash,
      overrides.status || 'draft',
      overrides.deduplication_mode || 'cookie',
    ]
  );
  return rows[0];
}

async function seedOption(pool, pollId, overrides = {}) {
  const { rows } = await pool.query(
    `INSERT INTO options (poll_id, name, display_order, locked)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [pollId, overrides.name || 'Option A', overrides.display_order || 0, overrides.locked || false]
  );
  return rows[0];
}

// Default export satisfies Jest globalSetup requirement (no-op)
async function globalSetup() {}

module.exports = globalSetup;
module.exports.createTestPool = createTestPool;
module.exports.cleanDb = cleanDb;
module.exports.seedPoll = seedPoll;
module.exports.seedOption = seedOption;
