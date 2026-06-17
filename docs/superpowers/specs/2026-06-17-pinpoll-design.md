# PinPoll — Design Specification
**Date:** 2026-06-17  
**Status:** Approved

---

## 1. Overview

PinPoll is a public, no-account poll web application designed for classroom and conference use. Anyone can create a live poll in seconds, share a memorable link, and watch votes arrive in real time on a large projected display or on participants' personal devices. Poll records and timestamps are publicly accessible and downloadable for research and educational purposes.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (React) |
| Backend | Node.js + Express + `ws` (WebSocket) |
| Database | PostgreSQL |
| Hosting (frontend) | Vercel |
| Hosting (backend + DB) | Railway |
| Image source | Unsplash API (proxied through backend) |
| PDF export | `pdfkit` (Node.js) |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  VERCEL (Frontend)                   │
│  Next.js App                                         │
│  ├── / (Homepage)                                    │
│  ├── /manual (Interactive guide)                     │
│  ├── /create (Poll creation wizard)                  │
│  ├── /poll/[code] (Audience voting view)             │
│  ├── /manage/[code] (Initiator control panel)        │
│  └── /results/[code] (Public results + PDF download) │
└───────────────────┬─────────────────────────────────┘
                    │ HTTP + WebSocket
┌───────────────────▼─────────────────────────────────┐
│              RAILWAY (Backend)                       │
│  Node.js + Express + ws (WebSocket server)           │
│  ├── REST API: poll CRUD, vote submission            │
│  ├── WebSocket: broadcasts live vote events          │
│  └── Unsplash API proxy (hides API key)              │
└───────────────────┬─────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────┐
│           PostgreSQL on Railway                      │
│  polls · options · vote_events · initiator_sessions  │
└─────────────────────────────────────────────────────┘
```

---

## 4. Database Schema

### `polls`
| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| code | VARCHAR(12) | Unique. Format: `[4-or-6-letter-word]-[4-char-alphanum]` e.g. `calm-K4T2` |
| topic | TEXT | The poll question/topic |
| password_hash | TEXT | bcrypt hash of initiator password |
| status | ENUM | `draft`, `active`, `closed`, `deleted` |
| deduplication_mode | ENUM | `cookie`, `email_hash` |
| auto_close_at | TIMESTAMPTZ | Optional scheduled close time |
| visibility | ENUM | `public`, `deleted` |
| created_at | TIMESTAMPTZ | |
| closed_at | TIMESTAMPTZ | Nullable |

### `options`
| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| poll_id | UUID | FK → polls |
| name | TEXT | Option label |
| image_url | TEXT | Unsplash URL or null |
| icon_key | TEXT | System icon identifier or null |
| display_order | INTEGER | Insertion order |
| locked | BOOLEAN | True once first vote is cast |
| created_at | TIMESTAMPTZ | |

### `admin_deletion_log`
| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| poll_code | VARCHAR(12) | The deleted poll's code (retained after poll deletion) |
| poll_topic | TEXT | Snapshot of topic at time of deletion |
| total_votes | INTEGER | Snapshot of total vote count at time of deletion |
| pdf_downloaded | BOOLEAN | Whether the admin downloaded the PDF record before deleting |
| deleted_at | TIMESTAMPTZ | |

### `vote_events`
| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| poll_id | UUID | FK → polls |
| option_id | UUID | FK → options |
| source | ENUM | `self_vote`, `initiator_tap` |
| session_token | TEXT | Hashed cookie (cookie mode) or email hash (email_hash mode) |
| timestamp | TIMESTAMPTZ | Exact time of vote |

---

## 5. Memorable Code Format

- **Format:** `[word]-[code]`  
  - `word` — a common English word of exactly **4 or 6 letters**, drawn from a curated word list  
  - `code` — 4-character uppercase alphanumeric (e.g. `K4T2`)  
- **Examples:** `calm-K4T2`, `river-P9X1`, `bright-J3M7`  
- At poll creation, **3 suggestions** are generated and displayed. The initiator picks one or regenerates.  
- The code is the single identifier for both the public poll URL and the manage URL:
  - Public: `pinpoll.app/poll/calm-K4T2`
  - Manage: `pinpoll.app/manage/calm-K4T2`

---

## 6. Poll Creation Flow

1. **Topic entry** — Initiator types the poll question/topic. No account required.
2. **Code selection** — Three memorable code suggestions are shown. Initiator picks one or regenerates.
3. **Password** — Initiator sets a password (minimum 6 characters). A clear warning is shown: *"If you lose this, you cannot manage or delete your poll."* No recovery mechanism exists.
4. **Deduplication mode** — Initiator selects:
   - **Standard (Cookie-based):** No personal data collected. One vote per browser.
   - **Verified (Email hash):** Voter enters email; only a one-way SHA-256 hash is stored. A "Verified Poll" badge displays on the poll page.
5. **Poll options** — Options added one at a time or bulk (comma-separated). Per option:
   - Name typed → Unsplash auto-fetches a preview image
   - Initiator can swap image, pick from system icon library, or leave as letter-avatar
   - Up to **500 options** supported
6. **Settings:**
   - Optional auto-close time (minutes, hours, or days) — or manual close only
   - Default visibility after close: **Keep Public**
7. **Transparency notice (mandatory)** — Before going live, initiator must tick a checkbox confirming: *"All votes, including timestamps and option selections, are publicly accessible and downloadable for research purposes."*
8. **Confirmation screen** — Shows public link, manage link, and a reminder to save the code and password. Option to copy to clipboard or download a `.txt` reminder card.

---

## 7. Option Locking Rule

- **Before the first vote:** All options are fully editable (name, image, order).
- **After the first vote is cast:** All existing options are permanently locked — no renaming, reordering, or deletion.
- **New options can always be added** by the initiator while the poll is ACTIVE, regardless of vote count.
- Locked options are visually indicated in the manage panel.

---

## 8. Poll Lifecycle

```
DRAFT → ACTIVE → CLOSED → [DELETED]
```

| State | Description |
|---|---|
| DRAFT | Poll created, zero votes. All options fully editable. The public link is live but no voting has occurred yet. |
| ACTIVE | Triggered automatically on the first vote cast. Existing options permanently locked. New options can still be added by the initiator. Voting and live tally both enabled. Poll can remain ACTIVE indefinitely. |
| CLOSED | Initiator clicks "Close Poll". All voting stops instantly. WebSocket broadcasts closure to all connected screens. No further vote counts or option additions possible. |
| DELETED | Initiator permanently deletes poll and all vote records. URL returns 404. Irreversible. |

**After closing**, the initiator is presented with two options only:
- **Keep Public** — Poll and results remain accessible at the public URL.
- **Permanently Delete** — All data wiped. Cannot be undone.

---

## 9. Voting Experience & Visual Display

### Large Screens (desktop / projected display)
Grid of large square cards — optimal for classroom projection and conference displays.

```
┌──────────────────┐
│                  │
│   [LARGE IMAGE]  │
│                  │
│     Python       │
│      ████ 42     │
└──────────────────┘
```

- Responsive grid: 2 columns (mobile) → 3–4 (tablet) → 4–6 (widescreen/projected)
- New cards animate in without disrupting existing ones
- Vote bars grow in real time via WebSocket

### Mobile / Tablet (or polls with many options)
Switches to a compact vertical list:

```
┌─────────────────────────────────────────────┐
│ [icon] Python                        42 ████│
└─────────────────────────────────────────────┘
```

- Icon (40px, left-aligned), name (center), vote count + mini bar (right)
- One tap per row casts vote
- Smooth scrollable list handles up to 500 options

**Layout threshold:** 12 or fewer options on a large screen → grid. More than 12 options OR small screen (mobile/tablet) → list view.

### Image Hierarchy (per option)
1. **Unsplash photo** — Auto-fetched based on option name keyword
2. **System icon** — From built-in icon library; initiator can manually select
3. **Letter-avatar** — Colored circle with the first letter of the option name (fallback when offline or no match found)

---

## 10. Two Voting Modes (Run Simultaneously)

| Mode | Who acts | How |
|---|---|---|
| Self-service | Audience member | Opens link on own device, taps option card |
| Live tally | Initiator | Taps +1 on manage screen; each tap fires one vote event |

Both modes write to `vote_events` simultaneously. The `source` column distinguishes them in the data.

### Deduplication in Self-service Mode
- **Cookie mode:** A session token is stored in the browser after voting. Subsequent visits show chosen option highlighted; vote button disabled.
- **Email hash mode:** Voter enters email address. SHA-256 hash stored. Original email immediately discarded. Mandatory notice shown: *"Your email address is never stored. An anonymous fingerprint is used solely to prevent duplicate votes."* A "Verified Poll" badge appears on the poll page.

Live tally taps by the initiator have no deduplication restriction.

---

## 11. Real-time System

### WebSocket Room Model
Every poll has a room identified by its code. All connected clients (audience screens, manage screen, results page) join the room on page load.

### Event Types

| Event | Triggered by | Received by |
|---|---|---|
| `vote_cast` | Audience self-vote | All connected screens |
| `tally_tap` | Initiator +1 tap | All connected screens |
| `option_added` | Initiator adds new option | All connected screens |
| `poll_closed` | Initiator closes poll | All connected screens |

### Auto-save Guarantee
Every vote event is persisted to PostgreSQL **before** the WebSocket broadcast fires. If the DB write fails, no broadcast is sent and the client receives an error with a retry indicator. The live display and the database are always in sync.

### Reconnection
On disconnect, the browser retries with exponential backoff. On reconnect, it fetches current vote counts via REST to resync before reattaching to the WebSocket room.

---

## 12. Poll Management (`/manage/[code]`)

- Password prompted on every visit — no session persisted
- Initiator can:
  - Add new options (while ACTIVE)
  - Tap +1 on any option (live tally)
  - Close the poll
  - After closing: Keep Public or Permanently Delete
- Locked options are visually marked (greyed label, no edit controls)

---

## 13. Public Results Page (`/results/[code]`)

- Accessible to anyone while the poll is ACTIVE or CLOSED
- Displays: poll topic, all options with vote counts and percentage bars, full timestamped event log
- **Permanent notice at top:** *"All responses and timestamps in this poll are publicly accessible and downloadable for research and educational purposes."*
- **Download button** exports a **PDF report** containing:
  - Poll topic / question
  - Each option with final vote count and percentage
  - Full timestamped vote event log
  - Poll open and close timestamps
  - Footer: *"Data exported from PinPoll for research and educational purposes."*

---

## 14. Homepage (`/`)

- **Hero:** Full-width, bold headline — *"Run a live poll in 30 seconds."* Single large **"Create a Poll →"** CTA button. Animated background showing a live poll grid with vote counts ticking up — communicates the app's purpose instantly.
- **How it works strip:** Three steps with icons — `① Type your topic` → `② Share the link` → `③ Watch votes roll in`
- **Feature highlights:** Three cards — "No account needed", "Works on any device", "Live results, always saved."
- **Footer:** Link to `/manual`, privacy notice, tagline.

The homepage is designed to be fully self-explanatory on first glance — no onboarding required.

---

## 15. Interactive Manual (`/manual`)

A single scrollable page with interactive demo elements (clickable mockups, not real polls):

1. Creating a Poll
2. Sharing the Link
3. Voting as an Audience Member
4. Managing & Closing a Poll
5. Downloading Results as PDF

---

## 16. Superadmin Panel

### Access
- **URL:** A deliberately obscure path (e.g. `/[random-slug]-admin`) defined only in a server environment variable (`ADMIN_PATH`). The path is never referenced in any public page, the manual, the footer, or source-controlled config files.
- **Authentication:** On visiting the path, a password prompt is shown. The password is validated against `ADMIN_SECRET` stored in the Railway environment variables — never hardcoded in source code and never written to the database. No session is persisted; the password is required on every visit.
- **Not documented:** This panel is intentionally absent from `/manual`, the homepage, and all public-facing documentation.

### Dashboard Features

| Feature | Description |
|---|---|
| Active polls overview | Count of currently ACTIVE polls, total votes cast today, total votes all-time |
| Top poll by respondents | The poll with the highest total vote count, shown with its code, topic, and vote total |
| Poll search | Search any poll by its link code (e.g. `calm-K4T2`) to view its topic, status, creation date, vote count, and full timestamped results |
| PDF export before deletion | Before deleting any poll, the admin is presented with a **"Download PDF Record"** button. The PDF contains the full poll topic, all options with vote counts and percentages, the complete timestamped vote event log, and poll open/close timestamps. This PDF is generated server-side via `pdfkit` and downloaded directly to the admin's device — it is never stored on the server. Intended as an offline legal/audit record in cases where a survey is suspected to be malicious or is sought by government or regulatory authorities. |
| Permanent delete | Admin can permanently delete any poll and all its vote records, regardless of the poll's current state. The deletion flow enforces a two-step sequence: **(1) Download PDF Record** (strongly encouraged, clearly labeled), then **(2) Type the poll code to confirm deletion.** Cannot edit or modify any vote records. |

### Security Rules
- No edit capability — the admin can only view and delete, never alter vote data
- Every admin deletion is logged server-side with a timestamp (stored separately from poll data, not deletable via the panel)
- The panel is never linked from any client-side route or navigation component

---

## 17. Privacy & Data Transparency

- All vote records and timestamps are public by design — this is disclosed at poll creation (mandatory checkbox) and on every public poll page.
- In **cookie mode**: no personal data is collected from voters.
- In **email hash mode**: the email is hashed immediately and never stored in plaintext. Voters are explicitly notified before voting.
- The initiator holds the only right to close and permanently delete all data.
- No user accounts. No tracking beyond what is necessary for deduplication.
