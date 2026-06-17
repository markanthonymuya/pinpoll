# PinPoll Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Node.js + Express + WebSocket backend that powers all PinPoll poll lifecycle, voting, real-time events, PDF export, and superadmin operations.

**Architecture:** Express REST API + `ws` WebSocket server share a single HTTP server. Every vote is persisted to PostgreSQL before the WebSocket broadcast fires. The admin path is environment-variable-driven and never appears in source-controlled config.

**Tech Stack:** Node.js 20+, Express 4, `ws` 8, `pg` 8, `bcrypt` 5, `pdfkit` 0.15, `node-cron` 3, `uuid` 9, Jest 29, Supertest 7

## Global Constraints

- Node.js ≥ 20
- All UUIDs generated with `uuid` v4
- Passwords hashed with `bcrypt` cost factor 10
- `session_token` for cookie mode = SHA-256 of a UUID set as `pinpoll_session` cookie (HttpOnly, SameSite=Lax)
- `session_token` for email_hash mode = SHA-256 hex of lowercased email
- WebSocket broadcast fires only after DB write succeeds
- `ADMIN_PATH` env var controls admin route — never hardcoded
- `ADMIN_SECRET` env var holds admin password — never in DB or code
- PDF is never stored on server — streamed directly to response
- Admin deletion always logged to `admin_deletion_log` before poll rows are deleted
- All env vars from `.env` (dev) / Railway env panel (prod); never committed to git

---

## File Structure

```
backend/
├── src/
│   ├── app.js                # Express app factory (no listen call)
│   ├── server.js             # HTTP + WebSocket server bootstrap
│   ├── db/
│   │   ├── pool.js           # pg Pool singleton
│   │   └── migrate.js        # Migration runner
│   ├── routes/
│   │   ├── polls.js          # GET/POST /api/polls, code suggestions
│   │   ├── options.js        # POST /api/polls/:code/options
│   │   ├── vote.js           # POST /api/polls/:code/vote
│   │   ├── tally.js          # POST /api/polls/:code/tally
│   │   ├── manage.js         # auth, close, delete
│   │   ├── unsplash.js       # GET /api/unsplash/search
│   │   ├── pdf.js            # GET /api/polls/:code/pdf
│   │   └── admin.js          # Superadmin panel routes
│   ├── services/
│   │   ├── codeGen.js        # Memorable code generation
│   │   ├── pdfGen.js         # pdfkit report builder
│   │   └── scheduler.js      # Auto-close cron job
│   └── ws/
│       └── wsServer.js       # WebSocket room management + broadcast
├── migrations/
│   └── 001_initial.sql       # Full schema
├── tests/
│   ├── helpers.js            # createTestPool, seedPoll helpers
│   ├── codeGen.test.js
│   ├── polls.test.js
│   ├── options.test.js
│   ├── vote.test.js
│   ├── tally.test.js
│   ├── manage.test.js
│   ├── wsServer.test.js
│   ├── pdf.test.js
│   └── admin.test.js
├── .env.example
├── .gitignore
├── jest.config.js
└── package.json
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `backend/package.json`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`
- Create: `backend/jest.config.js`
- Create: `backend/src/app.js`
- Create: `backend/src/server.js`

**Interfaces:**
- Produces: `createApp(pool, wsServer)` → Express app; `server.js` starts HTTP + WS on `PORT`

- [ ] **Step 1: Initialise the npm project**

```bash
cd backend
npm init -y
npm install express ws pg bcrypt pdfkit node-cron uuid cors dotenv
npm install --save-dev jest supertest
```

- [ ] **Step 2: Write `backend/package.json` scripts section**

Replace the `scripts` block in the generated `package.json`:

```json
{
  "name": "pinpoll-backend",
  "version": "1.0.0",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "migrate": "node src/db/migrate.js",
    "test": "jest --runInBand --forceExit"
  },
  "jest": {
    "testEnvironment": "node",
    "testTimeout": 30000,
    "globalSetup": "./tests/helpers.js"
  }
}
```

- [ ] **Step 3: Write `.env.example`**

```
DATABASE_URL=postgres://user:pass@localhost:5432/pinpoll
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/pinpoll_test
PORT=4000
UNSPLASH_ACCESS_KEY=your_unsplash_key
ADMIN_PATH=super-secret-admin-path
ADMIN_SECRET=change-me-in-production
BCRYPT_ROUNDS=10
FRONTEND_URL=http://localhost:3000
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
.env
*.log
```

- [ ] **Step 5: Write `backend/jest.config.js`**

```js
module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  setupFilesAfterFramework: [],
};
```

- [ ] **Step 6: Write `backend/src/app.js`**

```js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

function createApp(pool, wsServer) {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
  app.use(express.json());

  app.locals.pool = pool;
  app.locals.wsServer = wsServer;

  app.use('/api/polls', require('./routes/polls'));
  app.use('/api/polls', require('./routes/options'));
  app.use('/api/polls', require('./routes/vote'));
  app.use('/api/polls', require('./routes/tally'));
  app.use('/api/polls', require('./routes/manage'));
  app.use('/api/polls', require('./routes/pdf'));
  app.use('/api/unsplash', require('./routes/unsplash'));

  const adminPath = process.env.ADMIN_PATH;
  if (adminPath) {
    app.use(`/${adminPath}`, require('./routes/admin'));
  }

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 7: Write `backend/src/server.js`**

```js
require('dotenv').config();
const http = require('http');
const { Pool } = require('pg');
const { createApp } = require('./app');
const { createWsServer } = require('./ws/wsServer');
const { runMigrations } = require('./db/migrate');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await runMigrations(pool);

  const wsServer = createWsServer();
  const app = createApp(pool, wsServer);
  const server = http.createServer(app);

  server.on('upgrade', (req, socket, head) => {
    wsServer.handleUpgrade(req, socket, head, (ws) => {
      wsServer.emit('connection', ws, req);
    });
  });

  const port = process.env.PORT || 4000;
  server.listen(port, () => console.log(`PinPoll backend on port ${port}`));
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 8: Verify the app starts without error**

```bash
# Copy .env.example to .env and fill in your local postgres credentials
cp .env.example .env
# Then:
node src/server.js
```
Expected: `PinPoll backend on port 4000` (will fail on DB connection until Task 2 — that's OK)

- [ ] **Step 9: Commit**

```bash
git init
git add backend/
git commit -m "feat: backend project scaffold with Express + WS skeleton"
```

---

### Task 2: Database Pool + Migrations

**Files:**
- Create: `backend/src/db/pool.js`
- Create: `backend/src/db/migrate.js`
- Create: `backend/migrations/001_initial.sql`
- Create: `backend/tests/helpers.js`

**Interfaces:**
- Produces: `pool` (pg Pool); `runMigrations(pool)` → Promise\<void\>; `helpers.js` exports `createTestPool()`, `cleanDb(pool)`, `seedPoll(pool, overrides)` for all test files

- [ ] **Step 1: Write `backend/migrations/001_initial.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE poll_status AS ENUM ('draft', 'active', 'closed', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE dedup_mode AS ENUM ('cookie', 'email_hash');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE poll_visibility AS ENUM ('public', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vote_source AS ENUM ('self_vote', 'initiator_tap');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(12) UNIQUE NOT NULL,
  topic TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status poll_status NOT NULL DEFAULT 'draft',
  deduplication_mode dedup_mode NOT NULL DEFAULT 'cookie',
  auto_close_at TIMESTAMPTZ,
  visibility poll_visibility NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT,
  icon_key TEXT,
  display_order INTEGER NOT NULL,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vote_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES options(id) ON DELETE CASCADE,
  source vote_source NOT NULL,
  session_token TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_code VARCHAR(12) NOT NULL,
  poll_topic TEXT NOT NULL,
  total_votes INTEGER NOT NULL,
  pdf_downloaded BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Write `backend/src/db/pool.js`**

```js
const { Pool } = require('pg');

let _pool;

function getPool() {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

module.exports = { getPool };
```

- [ ] **Step 3: Write `backend/src/db/migrate.js`**

```js
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
```

- [ ] **Step 4: Write `backend/tests/helpers.js`**

```js
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

module.exports = { createTestPool, cleanDb, seedPoll, seedOption };
```

- [ ] **Step 5: Write a migration smoke test**

Create `backend/tests/migrate.test.js`:

```js
const { createTestPool, cleanDb } = require('./helpers');

let pool;

beforeAll(async () => { pool = await createTestPool(); });
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await cleanDb(pool); });

test('polls table exists', async () => {
  const { rows } = await pool.query(`SELECT to_regclass('public.polls') AS t`);
  expect(rows[0].t).toBe('polls');
});

test('options table exists', async () => {
  const { rows } = await pool.query(`SELECT to_regclass('public.options') AS t`);
  expect(rows[0].t).toBe('options');
});

test('vote_events table exists', async () => {
  const { rows } = await pool.query(`SELECT to_regclass('public.vote_events') AS t`);
  expect(rows[0].t).toBe('vote_events');
});

test('admin_deletion_log table exists', async () => {
  const { rows } = await pool.query(`SELECT to_regclass('public.admin_deletion_log') AS t`);
  expect(rows[0].t).toBe('admin_deletion_log');
});
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx jest tests/migrate.test.js --verbose
```
Expected: 4 passing

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: database pool, migrations, and test helpers"
```

---

### Task 3: Code Generation Service

**Files:**
- Create: `backend/src/services/codeGen.js`
- Create: `backend/tests/codeGen.test.js`

**Interfaces:**
- Produces: `generateCode()` → string like `"calm-K4T2"`; `generateSuggestions(pool)` → Promise\<string[]\> (3 unique unused codes)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/codeGen.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/codeGen.test.js --verbose
```
Expected: FAIL — `Cannot find module '../src/services/codeGen'`

- [ ] **Step 3: Write `backend/src/services/codeGen.js`**

```js
const WORDS_4 = [
  'able','arch','bare','bold','calm','care','cool','cube','cure','dark',
  'dear','deep','door','draw','each','easy','edge','even','ever','face',
  'fact','fair','fall','feel','file','find','fine','fire','flag','flat',
  'flip','flow','fold','font','food','form','free','fuel','full','fund',
  'gain','game','gear','glad','glow','goal','gold','good','grab','gray',
  'grid','grow','gulf','half','hall','hand','hard','harm','head','heal',
  'heat','held','help','hero','hide','high','hill','hint','hold','hole',
  'home','hook','hope','host','huge','hunt','icon','idea','idle','item',
  'join','jump','just','keep','kind','knot','lack','lake','land','lane',
  'last','late','lead','leaf','lean','left','lend','less','lift','like',
  'line','link','lion','list','live','load','lock','long','look','loop',
  'loss','love','mail','main','make','many','mark','mass','math','mean',
  'meet','mesh','mile','mill','mind','mint','miss','mode','moon','more',
  'most','move','much','must','neat','open','pure','real','safe','slim',
  'soft','sure','tall','thin','true','vast','warm','wide','wise','yarn',
];

const WORDS_6 = [
  'bright','center','change','chosen','circle','client','closer','clouds',
  'colors','commit','common','create','custom','cycles','detail','dialog',
  'direct','domain','driven','enable','engine','expand','factor','finger',
  'follow','forest','formal','foster','freely','friend','frozen','future',
  'garden','gentle','glance','global','golden','ground','guided','happen',
  'harbor','health','hidden','higher','honest','impact','inside','island',
  'joyful','jungle','keeper','knight','launch','leader','leaves','legacy',
  'linear','linked','listen','lively','longer','lovely','master','matter',
  'member','mental','mirror','modern','moment','motion','narrow','nature',
  'nearby','nested','normal','notify','object','online','opener','option',
  'orange','origin','output','parent','people','pillar','planet','player',
  'plenty','portal','prefer','pretty','public','purple','puzzle','random',
  'reader','recent','record','remind','remote','render','repeat','report',
  'rescue','result','reveal','review','reward','rising','robust','rocket',
  'rotate','router','sample','select','series','shared','signal','silver',
  'simple','single','sketch','smooth','source','spring','stable','static',
  'status','steady','stream','string','strong','studio','submit','summit',
  'switch','system','target','tender','ticket','timber','toggle','travel',
  'tunnel','update','useful','verify','vision','wonder','worker','yellow',
];

const SUFFIX_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode() {
  const allWords = [...WORDS_4, ...WORDS_6];
  const word = allWords[Math.floor(Math.random() * allWords.length)];
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)];
  }
  return `${word}-${suffix}`;
}

async function generateSuggestions(pool) {
  const suggestions = [];
  let attempts = 0;
  while (suggestions.length < 3 && attempts < 30) {
    attempts++;
    const code = generateCode();
    const { rows } = await pool.query('SELECT 1 FROM polls WHERE code = $1', [code]);
    if (rows.length === 0 && !suggestions.includes(code)) {
      suggestions.push(code);
    }
  }
  return suggestions;
}

module.exports = { generateCode, generateSuggestions };
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest tests/codeGen.test.js --verbose
```
Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add src/services/codeGen.js tests/codeGen.test.js
git commit -m "feat: memorable code generation service"
```

---

### Task 4: Poll REST API (create, read, code suggestions)

**Files:**
- Create: `backend/src/routes/polls.js`
- Create: `backend/tests/polls.test.js`

**Interfaces:**
- Consumes: `createApp(pool, null)` from app.js; `generateSuggestions(pool)` from codeGen.js; `bcrypt` for password hashing
- Produces:
  - `POST /api/polls` → `{ poll: { id, code, topic, status, deduplication_mode, created_at } }`
  - `GET /api/polls/:code` → `{ poll: {...}, options: [{id, name, image_url, icon_key, display_order, locked, vote_count}] }`
  - `GET /api/polls/:code/code-suggestions` → `{ suggestions: ["word-XXXX", ...] }`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/polls.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/polls.test.js --verbose
```
Expected: FAIL — routes not defined

- [ ] **Step 3: Write `backend/src/routes/polls.js`**

```js
const router = require('express').Router();
const bcrypt = require('bcrypt');
const { generateSuggestions } = require('../services/codeGen');

router.get('/:code/code-suggestions', async (req, res, next) => {
  try {
    const suggestions = await generateSuggestions(req.app.locals.pool);
    res.json({ suggestions });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { topic, code, password, deduplication_mode, auto_close_at } = req.body;
    if (!topic || !topic.trim()) return res.status(400).json({ error: 'topic required' });
    if (!code) return res.status(400).json({ error: 'code required' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
    if (!['cookie', 'email_hash'].includes(deduplication_mode)) {
      return res.status(400).json({ error: 'invalid deduplication_mode' });
    }

    const pool = req.app.locals.pool;
    const existing = await pool.query('SELECT 1 FROM polls WHERE code = $1', [code]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'code already taken' });

    const password_hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 10);
    const { rows } = await pool.query(
      `INSERT INTO polls (code, topic, password_hash, deduplication_mode, auto_close_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, code, topic, status, deduplication_mode, created_at`,
      [code, topic.trim(), password_hash, deduplication_mode, auto_close_at || null]
    );

    res.status(201).json({ poll: rows[0] });
  } catch (err) { next(err); }
});

router.get('/:code', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { rows: pollRows } = await pool.query(
      `SELECT id, code, topic, status, deduplication_mode, created_at, closed_at, auto_close_at
       FROM polls WHERE code = $1 AND visibility = 'public'`,
      [req.params.code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });

    const poll = pollRows[0];
    const { rows: options } = await pool.query(
      `SELECT o.id, o.name, o.image_url, o.icon_key, o.display_order, o.locked,
              COUNT(v.id)::int AS vote_count
       FROM options o
       LEFT JOIN vote_events v ON v.option_id = o.id
       WHERE o.poll_id = $1
       GROUP BY o.id
       ORDER BY o.display_order ASC`,
      [poll.id]
    );

    res.json({ poll, options });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest tests/polls.test.js --verbose
```
Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add src/routes/polls.js tests/polls.test.js
git commit -m "feat: poll CRUD REST API with code suggestions"
```

---

### Task 5: Options API

**Files:**
- Create: `backend/src/routes/options.js`
- Create: `backend/tests/options.test.js`

**Interfaces:**
- Consumes: `poll.id`, `poll.status`; `options.locked` field; initiator password for auth
- Produces: `POST /api/polls/:code/options` → `{ option: {id, name, image_url, icon_key, display_order, locked} }`; broadcasts `option_added` WS event

- [ ] **Step 1: Write failing tests**

Create `backend/tests/options.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/options.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write `backend/src/routes/options.js`**

```js
const router = require('express').Router();
const bcrypt = require('bcrypt');

async function verifyInitiator(pool, code, password) {
  const { rows } = await pool.query(
    'SELECT id, status, password_hash FROM polls WHERE code = $1 AND visibility = $2',
    [code, 'public']
  );
  if (rows.length === 0) return { error: 'not_found', status: 404 };
  const poll = rows[0];
  const ok = await bcrypt.compare(password, poll.password_hash);
  if (!ok) return { error: 'unauthorized', status: 401 };
  return { poll };
}

router.post('/:code/options', async (req, res, next) => {
  try {
    const { name, password, image_url, icon_key } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

    const pool = req.app.locals.pool;
    const auth = await verifyInitiator(pool, req.params.code, password);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { poll } = auth;
    if (poll.status === 'closed' || poll.status === 'deleted') {
      return res.status(403).json({ error: 'cannot add options to a closed poll' });
    }

    const { rows: orderRows } = await pool.query(
      'SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM options WHERE poll_id = $1',
      [poll.id]
    );
    const display_order = orderRows[0].next_order;

    const { rows } = await pool.query(
      `INSERT INTO options (poll_id, name, image_url, icon_key, display_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, image_url, icon_key, display_order, locked`,
      [poll.id, name.trim(), image_url || null, icon_key || null, display_order]
    );

    const option = rows[0];
    const wsServer = req.app.locals.wsServer;
    if (wsServer) {
      wsServer.broadcast(req.params.code, {
        type: 'option_added',
        option: { ...option, vote_count: 0 },
      });
    }

    res.status(201).json({ option });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Run tests**

```bash
npx jest tests/options.test.js --verbose
```
Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add src/routes/options.js tests/options.test.js
git commit -m "feat: options API with initiator auth and poll status guard"
```

---

### Task 6: Unsplash Proxy

**Files:**
- Create: `backend/src/routes/unsplash.js`
- Create: `backend/tests/unsplash.test.js`

**Interfaces:**
- Produces: `GET /api/unsplash/search?q=python` → `{ url: "https://images.unsplash.com/..." }` or `{ url: null }` if no match

- [ ] **Step 1: Write failing test**

Create `backend/tests/unsplash.test.js`:

```js
const request = require('supertest');
const { createApp } = require('../src/app');
const { createTestPool } = require('./helpers');

let pool, app;
beforeAll(async () => {
  pool = await createTestPool();
  app = createApp(pool, null);
});
afterAll(async () => { await pool.end(); });

test('returns 400 when q param missing', async () => {
  const res = await request(app).get('/api/unsplash/search');
  expect(res.status).toBe(400);
});

test('returns { url } structure', async () => {
  if (!process.env.UNSPLASH_ACCESS_KEY) return; // skip in CI without key
  const res = await request(app).get('/api/unsplash/search?q=python');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('url');
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx jest tests/unsplash.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write `backend/src/routes/unsplash.js`**

```js
const router = require('express').Router();
const https = require('https');

router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) return res.status(400).json({ error: 'q param required' });

    const key = process.env.UNSPLASH_ACCESS_KEY;
    if (!key) return res.json({ url: null });

    const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(q)}&orientation=squarish&client_id=${key}`;

    const data = await new Promise((resolve, reject) => {
      https.get(url, { headers: { 'Accept-Version': 'v1' } }, (r) => {
        let body = '';
        r.on('data', (chunk) => (body += chunk));
        r.on('end', () => {
          if (r.statusCode !== 200) return resolve(null);
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      }).on('error', reject);
    });

    const imageUrl = data?.urls?.regular || null;
    res.json({ url: imageUrl });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Run tests**

```bash
npx jest tests/unsplash.test.js --verbose
```
Expected: passing (skips live Unsplash test if no key set)

- [ ] **Step 5: Commit**

```bash
git add src/routes/unsplash.js tests/unsplash.test.js
git commit -m "feat: Unsplash proxy endpoint"
```

---

### Task 7: Vote API (self-vote with deduplication)

**Files:**
- Create: `backend/src/routes/vote.js`
- Create: `backend/tests/vote.test.js`

**Interfaces:**
- Consumes: `poll.deduplication_mode`, `poll.status`; sets `pinpoll_session` cookie; SHA-256 for email_hash mode
- Produces:
  - `POST /api/polls/:code/vote` body: `{ option_id, session_token? /* cookie mode uses cookie */, email? /* email_hash mode */ }` → `{ vote_event: {id, option_id, source, timestamp} }`
  - Sets `Set-Cookie: pinpoll_session=<token>; HttpOnly; SameSite=Lax` on first cookie-mode vote
  - Broadcasts `vote_cast` WS event to poll room
  - Returns 409 if duplicate vote detected

- [ ] **Step 1: Write failing tests**

Create `backend/tests/vote.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/vote.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write `backend/src/routes/vote.js`**

```js
const router = require('express').Router();
const crypto = require('crypto');

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

router.post('/:code/vote', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { code } = req.params;
    const { option_id, email } = req.body;

    if (!option_id) return res.status(400).json({ error: 'option_id required' });

    const { rows: pollRows } = await pool.query(
      `SELECT id, status, deduplication_mode FROM polls WHERE code = $1 AND visibility = 'public'`,
      [code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });

    const poll = pollRows[0];
    if (poll.status === 'closed' || poll.status === 'deleted') {
      return res.status(403).json({ error: 'poll is closed' });
    }

    // Verify option belongs to this poll
    const { rows: optRows } = await pool.query(
      'SELECT id FROM options WHERE id = $1 AND poll_id = $2',
      [option_id, poll.id]
    );
    if (optRows.length === 0) return res.status(400).json({ error: 'invalid option_id' });

    let session_token;

    if (poll.deduplication_mode === 'cookie') {
      let cookieToken = req.cookies?.pinpoll_session;
      if (!cookieToken) {
        cookieToken = crypto.randomUUID();
      }
      session_token = sha256(cookieToken);

      // Check duplicate
      const { rows: dupRows } = await pool.query(
        'SELECT 1 FROM vote_events WHERE poll_id = $1 AND session_token = $2',
        [poll.id, session_token]
      );
      if (dupRows.length > 0) return res.status(409).json({ error: 'already voted' });

      // Set cookie on response
      res.cookie('pinpoll_session', cookieToken, {
        httpOnly: true,
        sameSite: 'Lax',
        maxAge: 365 * 24 * 60 * 60 * 1000,
      });
    } else {
      // email_hash mode
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'email required for verified poll' });
      }
      session_token = sha256(email.trim().toLowerCase());

      const { rows: dupRows } = await pool.query(
        'SELECT 1 FROM vote_events WHERE poll_id = $1 AND session_token = $2',
        [poll.id, session_token]
      );
      if (dupRows.length > 0) return res.status(409).json({ error: 'already voted' });
    }

    // If draft, activate poll and lock all existing options
    if (poll.status === 'draft') {
      await pool.query(
        `UPDATE polls SET status = 'active' WHERE id = $1`,
        [poll.id]
      );
      await pool.query(
        `UPDATE options SET locked = TRUE WHERE poll_id = $1`,
        [poll.id]
      );
    }

    // Persist vote — broadcast only after successful DB write
    const { rows: voteRows } = await pool.query(
      `INSERT INTO vote_events (poll_id, option_id, source, session_token)
       VALUES ($1, $2, 'self_vote', $3)
       RETURNING id, option_id, source, timestamp`,
      [poll.id, option_id, session_token]
    );

    const vote_event = voteRows[0];

    const wsServer = req.app.locals.wsServer;
    if (wsServer) {
      wsServer.broadcast(code, { type: 'vote_cast', option_id, vote_event });
    }

    res.status(201).json({ vote_event });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Add cookie-parser middleware to app.js**

In `backend/src/app.js`, add after `require('dotenv').config()`:

```js
const cookieParser = require('cookie-parser');
```

And in `createApp`, after `app.use(express.json())`:

```js
app.use(cookieParser());
```

Also install the package:

```bash
npm install cookie-parser
```

- [ ] **Step 5: Run tests**

```bash
npx jest tests/vote.test.js --verbose
```
Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add src/routes/vote.js tests/vote.test.js src/app.js package.json
git commit -m "feat: vote API with cookie and email_hash deduplication, draft→active lifecycle"
```

---

### Task 8: Live Tally API (initiator +1 tap)

**Files:**
- Create: `backend/src/routes/tally.js`
- Create: `backend/tests/tally.test.js`

**Interfaces:**
- Consumes: initiator password; active poll only
- Produces: `POST /api/polls/:code/tally` body `{ option_id, password }` → `{ vote_event: {...} }`; broadcasts `tally_tap` WS event; no deduplication restriction

- [ ] **Step 1: Write failing tests**

Create `backend/tests/tally.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/tally.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write `backend/src/routes/tally.js`**

```js
const router = require('express').Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');

router.post('/:code/tally', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { code } = req.params;
    const { option_id, password } = req.body;

    if (!option_id) return res.status(400).json({ error: 'option_id required' });

    const { rows: pollRows } = await pool.query(
      `SELECT id, status, password_hash FROM polls WHERE code = $1 AND visibility = 'public'`,
      [code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });

    const poll = pollRows[0];
    const ok = await bcrypt.compare(password || '', poll.password_hash);
    if (!ok) return res.status(401).json({ error: 'unauthorized' });

    if (poll.status === 'closed' || poll.status === 'deleted') {
      return res.status(403).json({ error: 'poll is closed' });
    }

    const { rows: optRows } = await pool.query(
      'SELECT id FROM options WHERE id = $1 AND poll_id = $2',
      [option_id, poll.id]
    );
    if (optRows.length === 0) return res.status(400).json({ error: 'invalid option_id' });

    // Initiator tap: unique session_token per tap (no dedup)
    const session_token = `tally:${crypto.randomUUID()}`;

    const { rows } = await pool.query(
      `INSERT INTO vote_events (poll_id, option_id, source, session_token)
       VALUES ($1, $2, 'initiator_tap', $3)
       RETURNING id, option_id, source, timestamp`,
      [poll.id, option_id, session_token]
    );

    const vote_event = rows[0];

    const wsServer = req.app.locals.wsServer;
    if (wsServer) {
      wsServer.broadcast(code, { type: 'tally_tap', option_id, vote_event });
    }

    res.status(201).json({ vote_event });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Run tests**

```bash
npx jest tests/tally.test.js --verbose
```
Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add src/routes/tally.js tests/tally.test.js
git commit -m "feat: live tally API for initiator +1 taps"
```

---

### Task 9: Poll Management API (auth check, close, delete)

**Files:**
- Create: `backend/src/routes/manage.js`
- Create: `backend/tests/manage.test.js`

**Interfaces:**
- Produces:
  - `POST /api/polls/:code/auth` body `{ password }` → `204` or `401`
  - `POST /api/polls/:code/close` body `{ password }` → `{ poll: { status: 'closed', closed_at } }`; broadcasts `poll_closed` WS event
  - `DELETE /api/polls/:code` body `{ password }` → `204`; sets `visibility='deleted'`, `status='deleted'`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/manage.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/manage.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write `backend/src/routes/manage.js`**

```js
const router = require('express').Router();
const bcrypt = require('bcrypt');

async function verifyPassword(pool, code, password) {
  const { rows } = await pool.query(
    `SELECT id, status, password_hash FROM polls WHERE code = $1`,
    [code]
  );
  if (rows.length === 0) return { error: 'not_found', status: 404 };
  const poll = rows[0];
  const ok = await bcrypt.compare(password || '', poll.password_hash);
  if (!ok) return { error: 'unauthorized', status: 401 };
  return { poll };
}

router.post('/:code/auth', async (req, res, next) => {
  try {
    const auth = await verifyPassword(req.app.locals.pool, req.params.code, req.body.password);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    res.status(204).end();
  } catch (err) { next(err); }
});

router.post('/:code/close', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const auth = await verifyPassword(pool, req.params.code, req.body.password);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { poll } = auth;
    if (poll.status === 'closed' || poll.status === 'deleted') {
      return res.status(403).json({ error: 'poll already closed or deleted' });
    }

    const { rows } = await pool.query(
      `UPDATE polls SET status = 'closed', closed_at = NOW()
       WHERE id = $1
       RETURNING id, code, status, closed_at`,
      [poll.id]
    );

    const wsServer = req.app.locals.wsServer;
    if (wsServer) wsServer.broadcast(req.params.code, { type: 'poll_closed' });

    res.json({ poll: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/:code', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const auth = await verifyPassword(pool, req.params.code, req.body.password);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    await pool.query(
      `UPDATE polls SET visibility = 'deleted', status = 'deleted' WHERE id = $1`,
      [auth.poll.id]
    );

    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Run tests**

```bash
npx jest tests/manage.test.js --verbose
```
Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add src/routes/manage.js tests/manage.test.js
git commit -m "feat: poll management API - auth, close, delete"
```

---

### Task 10: WebSocket Server

**Files:**
- Create: `backend/src/ws/wsServer.js`
- Create: `backend/tests/wsServer.test.js`

**Interfaces:**
- Consumes: `ws` package
- Produces: `createWsServer()` → WebSocket.Server with `.broadcast(code, payload)` method; clients join by sending `{ type: "join", code: "calm-K4T2" }` message

- [ ] **Step 1: Write failing tests**

Create `backend/tests/wsServer.test.js`:

```js
const http = require('http');
const WebSocket = require('ws');
const { createWsServer } = require('../src/ws/wsServer');
const { createApp } = require('../src/app');
const { createTestPool, cleanDb } = require('./helpers');

let pool, server, wsServer, baseUrl;

beforeAll(async () => {
  pool = await createTestPool();
  wsServer = createWsServer();
  const app = createApp(pool, wsServer);
  server = http.createServer(app);
  server.on('upgrade', (req, socket, head) => {
    wsServer.handleUpgrade(req, socket, head, (ws) => {
      wsServer.emit('connection', ws, req);
    });
  });
  await new Promise((res) => server.listen(0, res));
  baseUrl = `ws://localhost:${server.address().port}`;
});

afterAll(async () => {
  await pool.end();
  await new Promise((res) => server.close(res));
});

beforeEach(async () => { await cleanDb(pool); });

function connectClient(code) {
  return new Promise((resolve) => {
    const ws = new WebSocket(baseUrl);
    ws.once('open', () => {
      ws.send(JSON.stringify({ type: 'join', code }));
      resolve(ws);
    });
  });
}

function waitForMessage(ws) {
  return new Promise((resolve) => ws.once('message', (data) => resolve(JSON.parse(data))));
}

test('client receives broadcast after joining room', async () => {
  const client = await connectClient('test-AB12');
  const msgPromise = waitForMessage(client);
  wsServer.broadcast('test-AB12', { type: 'vote_cast', option_id: '123' });
  const msg = await msgPromise;
  expect(msg.type).toBe('vote_cast');
  client.close();
});

test('client in different room does not receive broadcast', async () => {
  const clientA = await connectClient('room-AAAA');
  const clientB = await connectClient('room-BBBB');

  let bReceived = false;
  clientB.on('message', () => { bReceived = true; });

  wsServer.broadcast('room-AAAA', { type: 'vote_cast', option_id: '123' });
  await new Promise((r) => setTimeout(r, 100));
  expect(bReceived).toBe(false);
  clientA.close();
  clientB.close();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/wsServer.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write `backend/src/ws/wsServer.js`**

```js
const WebSocket = require('ws');

function createWsServer() {
  const wss = new WebSocket.Server({ noServer: true });
  const rooms = new Map(); // code → Set<WebSocket>

  wss.on('connection', (ws) => {
    let joinedCode = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'join' && msg.code) {
          joinedCode = msg.code;
          if (!rooms.has(joinedCode)) rooms.set(joinedCode, new Set());
          rooms.get(joinedCode).add(ws);
        }
      } catch (_) {}
    });

    ws.on('close', () => {
      if (joinedCode && rooms.has(joinedCode)) {
        rooms.get(joinedCode).delete(ws);
        if (rooms.get(joinedCode).size === 0) rooms.delete(joinedCode);
      }
    });
  });

  wss.broadcast = (code, payload) => {
    const clients = rooms.get(code);
    if (!clients) return;
    const data = JSON.stringify(payload);
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
  };

  return wss;
}

module.exports = { createWsServer };
```

- [ ] **Step 4: Run tests**

```bash
npx jest tests/wsServer.test.js --verbose
```
Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add src/ws/wsServer.js tests/wsServer.test.js
git commit -m "feat: WebSocket room server with join and broadcast"
```

---

### Task 11: Auto-close Scheduler

**Files:**
- Create: `backend/src/services/scheduler.js`
- Create: `backend/tests/scheduler.test.js`

**Interfaces:**
- Consumes: `pool`, `wsServer`; `node-cron`
- Produces: `startScheduler(pool, wsServer)` → starts a cron job that every minute closes polls where `auto_close_at <= NOW()` and `status = 'active'`; broadcasts `poll_closed` per closed poll

- [ ] **Step 1: Write failing test**

Create `backend/tests/scheduler.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/scheduler.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write `backend/src/services/scheduler.js`**

```js
const cron = require('node-cron');

async function closeOverduePolls(pool, wsServer) {
  const { rows } = await pool.query(
    `UPDATE polls
     SET status = 'closed', closed_at = NOW()
     WHERE status = 'active' AND auto_close_at IS NOT NULL AND auto_close_at <= NOW()
     RETURNING code`
  );
  rows.forEach(({ code }) => {
    if (wsServer) wsServer.broadcast(code, { type: 'poll_closed' });
  });
}

function startScheduler(pool, wsServer) {
  cron.schedule('* * * * *', () => closeOverduePolls(pool, wsServer));
}

module.exports = { startScheduler, closeOverduePolls };
```

- [ ] **Step 4: Wire scheduler into `server.js`**

In `backend/src/server.js`, after `await runMigrations(pool)`:

```js
const { startScheduler } = require('./services/scheduler');
// ... after wsServer and app creation:
startScheduler(pool, wsServer);
```

- [ ] **Step 5: Run tests**

```bash
npx jest tests/scheduler.test.js --verbose
```
Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add src/services/scheduler.js tests/scheduler.test.js src/server.js
git commit -m "feat: auto-close scheduler via node-cron"
```

---

### Task 12: PDF Generation + PDF Route

**Files:**
- Create: `backend/src/services/pdfGen.js`
- Create: `backend/src/routes/pdf.js`
- Create: `backend/tests/pdf.test.js`

**Interfaces:**
- Produces:
  - `generatePollPDF(pollData)` → Buffer (pdfkit output)
  - `GET /api/polls/:code/pdf` → PDF binary stream with `Content-Disposition: attachment; filename=pinpoll-<code>.pdf`
  - `pollData` shape: `{ poll: {...}, options: [{name, vote_count, percentage}], events: [{source, option_name, timestamp}] }`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/pdf.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/pdf.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write `backend/src/services/pdfGen.js`**

```js
const PDFDocument = require('pdfkit');

function generatePollPDF(pollData) {
  return new Promise((resolve, reject) => {
    const { poll, options, events } = pollData;
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.fontSize(20).text('PinPoll — Results Report', { align: 'center' });
    doc.moveDown();

    // Poll info
    doc.fontSize(14).text(`Topic: ${poll.topic}`);
    doc.fontSize(11).text(`Code: ${poll.code}`);
    doc.text(`Created: ${new Date(poll.created_at).toISOString()}`);
    if (poll.closed_at) doc.text(`Closed: ${new Date(poll.closed_at).toISOString()}`);
    doc.moveDown();

    // Options
    doc.fontSize(14).text('Results', { underline: true });
    doc.moveDown(0.5);
    options.forEach((opt) => {
      doc.fontSize(11).text(`${opt.name}: ${opt.vote_count} votes (${opt.percentage.toFixed(1)}%)`);
    });
    doc.moveDown();

    // Event log
    doc.fontSize(14).text('Vote Event Log', { underline: true });
    doc.moveDown(0.5);
    if (events.length === 0) {
      doc.fontSize(10).text('No votes recorded.');
    } else {
      events.forEach((evt) => {
        const ts = new Date(evt.timestamp).toISOString();
        doc.fontSize(9).text(`[${ts}] ${evt.source} → ${evt.option_name}`);
      });
    }
    doc.moveDown();

    // Footer
    doc.fontSize(9).fillColor('gray')
      .text('Data exported from PinPoll for research and educational purposes.', { align: 'center' });

    doc.end();
  });
}

module.exports = { generatePollPDF };
```

- [ ] **Step 4: Write `backend/src/routes/pdf.js`**

```js
const router = require('express').Router();
const { generatePollPDF } = require('../services/pdfGen');

router.get('/:code/pdf', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { rows: pollRows } = await pool.query(
      `SELECT id, code, topic, status, created_at, closed_at FROM polls WHERE code = $1 AND visibility = 'public'`,
      [req.params.code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });

    const poll = pollRows[0];

    const { rows: optRows } = await pool.query(
      `SELECT o.name, COUNT(v.id)::int AS vote_count
       FROM options o
       LEFT JOIN vote_events v ON v.option_id = o.id
       WHERE o.poll_id = $1
       GROUP BY o.id, o.name, o.display_order
       ORDER BY o.display_order`,
      [poll.id]
    );
    const totalVotes = optRows.reduce((sum, o) => sum + o.vote_count, 0);
    const options = optRows.map((o) => ({
      ...o,
      percentage: totalVotes > 0 ? (o.vote_count / totalVotes) * 100 : 0,
    }));

    const { rows: eventRows } = await pool.query(
      `SELECT v.source, o.name AS option_name, v.timestamp
       FROM vote_events v
       JOIN options o ON o.id = v.option_id
       WHERE v.poll_id = $1
       ORDER BY v.timestamp ASC`,
      [poll.id]
    );

    const pdfBuffer = await generatePollPDF({ poll, options, events: eventRows });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=pinpoll-${poll.code}.pdf`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 5: Run tests**

```bash
npx jest tests/pdf.test.js --verbose
```
Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add src/services/pdfGen.js src/routes/pdf.js tests/pdf.test.js
git commit -m "feat: PDF generation and download route using pdfkit"
```

---

### Task 13: Superadmin API

**Files:**
- Create: `backend/src/routes/admin.js`
- Create: `backend/tests/admin.test.js`

**Interfaces:**
- Consumes: `ADMIN_PATH` env (route prefix); `ADMIN_SECRET` env (password); `generatePollPDF` for pre-deletion PDF; `admin_deletion_log` table
- Produces (all routes require `X-Admin-Secret` header matching `ADMIN_SECRET`):
  - `GET /[ADMIN_PATH]/dashboard` → `{ active_count, today_votes, total_votes, top_poll: {code, topic, vote_count} | null }`
  - `GET /[ADMIN_PATH]/polls/:code` → `{ poll, options, events }`
  - `GET /[ADMIN_PATH]/polls/:code/pdf` → PDF stream (same as public PDF, works even for deleted polls)
  - `DELETE /[ADMIN_PATH]/polls/:code` body `{ confirm_code }` → `204`; logs to `admin_deletion_log`; hard-deletes all rows

- [ ] **Step 1: Write failing tests**

Create `backend/tests/admin.test.js`:

```js
const request = require('supertest');
const { createApp } = require('../src/app');
const { createTestPool, cleanDb, seedPoll, seedOption } = require('./helpers');

process.env.ADMIN_PATH = 'test-admin-xyz';
process.env.ADMIN_SECRET = 'supersecret';

let pool, app;
beforeAll(async () => {
  pool = await createTestPool();
  app = createApp(pool, null);
});
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await cleanDb(pool); });

const adminGet = (path) =>
  request(app).get(`/test-admin-xyz${path}`).set('X-Admin-Secret', 'supersecret');

const adminDel = (path) =>
  request(app).delete(`/test-admin-xyz${path}`).set('X-Admin-Secret', 'supersecret');

test('GET /dashboard returns stats', async () => {
  await seedPoll(pool, { code: 'test-AB12', status: 'active' });
  const res = await adminGet('/dashboard');
  expect(res.status).toBe(200);
  expect(typeof res.body.active_count).toBe('number');
  expect(typeof res.body.total_votes).toBe('number');
});

test('GET /dashboard returns 401 without secret', async () => {
  const res = await request(app).get('/test-admin-xyz/dashboard');
  expect(res.status).toBe(401);
});

test('GET /polls/:code returns poll and events', async () => {
  await seedPoll(pool, { code: 'test-AB12' });
  const res = await adminGet('/polls/test-AB12');
  expect(res.status).toBe(200);
  expect(res.body.poll.code).toBe('test-AB12');
  expect(Array.isArray(res.body.options)).toBe(true);
  expect(Array.isArray(res.body.events)).toBe(true);
});

test('DELETE /polls/:code hard-deletes poll with correct confirm_code', async () => {
  await seedPoll(pool, { code: 'test-AB12', status: 'closed' });
  const res = await adminDel('/polls/test-AB12').send({ confirm_code: 'test-AB12' });
  expect(res.status).toBe(204);
  const { rows } = await pool.query(`SELECT 1 FROM polls WHERE code = 'test-AB12'`);
  expect(rows).toHaveLength(0);
});

test('DELETE /polls/:code logs to admin_deletion_log', async () => {
  await seedPoll(pool, { code: 'test-AB12', status: 'closed' });
  await adminDel('/polls/test-AB12').send({ confirm_code: 'test-AB12' });
  const { rows } = await pool.query(`SELECT * FROM admin_deletion_log WHERE poll_code = 'test-AB12'`);
  expect(rows).toHaveLength(1);
  expect(rows[0].poll_topic).toBeTruthy();
});

test('DELETE /polls/:code rejects wrong confirm_code', async () => {
  await seedPoll(pool, { code: 'test-AB12' });
  const res = await adminDel('/polls/test-AB12').send({ confirm_code: 'wrong-code' });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/admin.test.js --verbose
```
Expected: FAIL

- [ ] **Step 3: Write `backend/src/routes/admin.js`**

```js
const router = require('express').Router();
const { generatePollPDF } = require('../services/pdfGen');

function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers['x-admin-secret'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

router.use(requireAdmin);

router.get('/dashboard', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;

    const { rows: activeRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM polls WHERE status = 'active'`
    );
    const { rows: todayRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM vote_events WHERE timestamp >= CURRENT_DATE`
    );
    const { rows: totalRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM vote_events`
    );
    const { rows: topRows } = await pool.query(
      `SELECT p.code, p.topic, COUNT(v.id)::int AS vote_count
       FROM polls p
       LEFT JOIN vote_events v ON v.poll_id = p.id
       GROUP BY p.id
       ORDER BY vote_count DESC
       LIMIT 1`
    );

    res.json({
      active_count: activeRows[0].count,
      today_votes: todayRows[0].count,
      total_votes: totalRows[0].count,
      top_poll: topRows[0] || null,
    });
  } catch (err) { next(err); }
});

router.get('/polls/:code', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { rows: pollRows } = await pool.query(
      `SELECT id, code, topic, status, deduplication_mode, created_at, closed_at FROM polls WHERE code = $1`,
      [req.params.code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });

    const poll = pollRows[0];
    const { rows: options } = await pool.query(
      `SELECT o.id, o.name, o.image_url, o.icon_key, o.display_order, o.locked,
              COUNT(v.id)::int AS vote_count
       FROM options o
       LEFT JOIN vote_events v ON v.option_id = o.id
       WHERE o.poll_id = $1
       GROUP BY o.id
       ORDER BY o.display_order`,
      [poll.id]
    );
    const { rows: events } = await pool.query(
      `SELECT v.id, v.source, o.name AS option_name, v.timestamp
       FROM vote_events v
       JOIN options o ON o.id = v.option_id
       WHERE v.poll_id = $1
       ORDER BY v.timestamp ASC`,
      [poll.id]
    );

    res.json({ poll, options, events });
  } catch (err) { next(err); }
});

router.get('/polls/:code/pdf', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { rows: pollRows } = await pool.query(
      `SELECT id, code, topic, status, created_at, closed_at FROM polls WHERE code = $1`,
      [req.params.code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });

    const poll = pollRows[0];
    const { rows: optRows } = await pool.query(
      `SELECT o.name, COUNT(v.id)::int AS vote_count
       FROM options o
       LEFT JOIN vote_events v ON v.option_id = o.id
       WHERE o.poll_id = $1
       GROUP BY o.id, o.name, o.display_order
       ORDER BY o.display_order`,
      [poll.id]
    );
    const total = optRows.reduce((s, o) => s + o.vote_count, 0);
    const options = optRows.map((o) => ({ ...o, percentage: total > 0 ? (o.vote_count / total) * 100 : 0 }));

    const { rows: events } = await pool.query(
      `SELECT v.source, o.name AS option_name, v.timestamp
       FROM vote_events v JOIN options o ON o.id = v.option_id
       WHERE v.poll_id = $1 ORDER BY v.timestamp`,
      [poll.id]
    );

    const pdfBuffer = await generatePollPDF({ poll, options, events });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=pinpoll-admin-${poll.code}.pdf`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

router.delete('/polls/:code', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { confirm_code } = req.body;

    if (confirm_code !== req.params.code) {
      return res.status(400).json({ error: 'confirm_code does not match poll code' });
    }

    const { rows: pollRows } = await pool.query(
      `SELECT id, topic FROM polls WHERE code = $1`,
      [req.params.code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });

    const poll = pollRows[0];
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM vote_events WHERE poll_id = $1`,
      [poll.id]
    );

    await pool.query(
      `INSERT INTO admin_deletion_log (poll_code, poll_topic, total_votes)
       VALUES ($1, $2, $3)`,
      [req.params.code, poll.topic, countRows[0].total]
    );

    // Hard delete — cascade removes options and vote_events
    await pool.query(`DELETE FROM polls WHERE id = $1`, [poll.id]);

    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Run all tests**

```bash
npx jest --verbose
```
Expected: all test suites passing

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin.js tests/admin.test.js
git commit -m "feat: superadmin API - dashboard, poll search, PDF export, hard delete with audit log"
```

---

## Self-Review

### Spec Coverage
- [x] Poll CRUD with memorable code format — Task 3 + 4
- [x] Password hashing, 6-char minimum — Task 4
- [x] Deduplication cookie + email_hash — Task 7
- [x] Option locking on first vote — Task 7
- [x] Draft → Active lifecycle on first vote — Task 7
- [x] New options always addable by initiator while ACTIVE — Task 5
- [x] Poll close + WebSocket broadcast — Task 9
- [x] Soft delete (visibility=deleted, 404 on public) — Task 9
- [x] Live tally initiator tap, no dedup — Task 8
- [x] WebSocket rooms: vote_cast, tally_tap, option_added, poll_closed — Tasks 8, 9, 10
- [x] DB write before WS broadcast — Tasks 7, 8
- [x] Auto-close scheduler — Task 11
- [x] PDF: topic, options, percentages, event log, timestamps, footer — Task 12
- [x] Unsplash proxy — Task 6
- [x] Superadmin: obscure path from env, no session, dashboard, search, delete — Task 13
- [x] Admin deletion log — Task 13
- [x] Admin PDF before delete — Task 13 (GET /admin/polls/:code/pdf)

### Placeholder Scan
No TBDs or incomplete steps found.

### Type Consistency
`wsServer.broadcast(code, payload)` used consistently in Tasks 5, 7, 8, 9, 10. `mockWs.broadcast` matches the signature in all tests.
