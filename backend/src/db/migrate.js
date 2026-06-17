const fs = require('fs');
const path = require('path');

async function runMigrations(pool) {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../migrations/001_initial.sql'),
    'utf8'
  );
  await pool.query(sql);
}

module.exports = { runMigrations };
