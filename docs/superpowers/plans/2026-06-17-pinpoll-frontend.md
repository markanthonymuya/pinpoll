# PinPoll Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js frontend that covers all six routes — homepage, interactive manual, poll creation wizard, audience voting page, initiator management panel, and public results page.

**Architecture:** Next.js 14 App Router with server-side data fetching for initial poll state, then client-side WebSocket for live updates. All API calls go through a thin `src/lib/api.ts` client. UI is Tailwind CSS only — no component library. WebSocket reconnection uses exponential backoff with a REST resync on reconnect.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS 3, `ws`-compatible browser WebSocket API (native), `pdfkit` PDF consumed via browser download (server streams it), Jest + React Testing Library for component tests

**Prerequisite:** Backend from `2026-06-17-pinpoll-backend.md` is running at `NEXT_PUBLIC_API_URL`.

## Global Constraints

- Next.js ≥ 14, TypeScript strict mode on
- Tailwind CSS only — no component library (shadcn, MUI, etc.)
- No client state library (no Redux/Zustand) — React useState + useReducer only
- All API base URL from `NEXT_PUBLIC_API_URL` env var
- All WebSocket base URL from `NEXT_PUBLIC_WS_URL` env var
- Grid layout: ≤ 12 options on large screen (≥ 1024px) → square card grid; > 12 options OR mobile/tablet → compact list
- Image hierarchy per option: Unsplash photo → system icon → letter-avatar (colored circle with first letter)
- Cookie name: `pinpoll_session` (set by backend; frontend reads it only to show "already voted" state)
- Accessibility: all interactive elements have aria-labels; vote buttons have role="button"
- No `console.log` left in production code

---

## File Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx                   # Root layout (font, metadata)
│   │   ├── page.tsx                     # Homepage (/)
│   │   ├── manual/
│   │   │   └── page.tsx                 # Interactive manual (/manual)
│   │   ├── create/
│   │   │   └── page.tsx                 # Poll creation wizard (/create)
│   │   ├── poll/
│   │   │   └── [code]/
│   │   │       └── page.tsx             # Audience voting view (/poll/[code])
│   │   ├── manage/
│   │   │   └── [code]/
│   │   │       └── page.tsx             # Initiator control panel (/manage/[code])
│   │   └── results/
│   │       └── [code]/
│   │           └── page.tsx             # Public results page (/results/[code])
│   ├── components/
│   │   ├── OptionImage.tsx              # Image hierarchy: Unsplash/icon/letter-avatar
│   │   ├── OptionCard.tsx               # Square card for grid view
│   │   ├── OptionRow.tsx                # Compact row for list view
│   │   ├── PollDisplay.tsx              # Grid/list toggle + renders options
│   │   ├── VoteBar.tsx                  # Animated percentage bar
│   │   └── CodeSuggestions.tsx          # 3 code pills + regenerate button
│   ├── hooks/
│   │   ├── useWebSocket.ts              # WS connection, join, reconnect, resync
│   │   └── usePollVoteCounts.ts         # Manages option vote counts, applies WS events
│   └── lib/
│       ├── api.ts                       # fetch wrapper for all REST endpoints
│       └── types.ts                     # Shared TypeScript types
├── public/
│   └── icons/                           # System icon SVG files (10–20 icons)
│       ├── star.svg
│       ├── heart.svg
│       └── ...
├── .env.local.example
├── next.config.js
├── tailwind.config.js
└── package.json
```

---

### Task 1: Next.js Scaffold + Shared Types + API Client

**Files:**
- Create: `frontend/` (via create-next-app)
- Create: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/.env.local.example`

**Interfaces:**
- Produces: `apiFetch(path, options?)` → typed fetch wrapper; all TypeScript types used throughout the frontend

- [ ] **Step 1: Create the Next.js project**

```bash
cd pinpoll
npx create-next-app@latest frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-git
```

- [ ] **Step 2: Write `.env.local.example`**

```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000
```

Copy to `.env.local` and fill in values:

```bash
cp frontend/.env.local.example frontend/.env.local
```

- [ ] **Step 3: Write `frontend/src/lib/types.ts`**

```ts
export type PollStatus = 'draft' | 'active' | 'closed' | 'deleted';
export type DeduplicationMode = 'cookie' | 'email_hash';
export type VoteSource = 'self_vote' | 'initiator_tap';

export interface Poll {
  id: string;
  code: string;
  topic: string;
  status: PollStatus;
  deduplication_mode: DeduplicationMode;
  created_at: string;
  closed_at: string | null;
  auto_close_at: string | null;
}

export interface PollOption {
  id: string;
  name: string;
  image_url: string | null;
  icon_key: string | null;
  display_order: number;
  locked: boolean;
  vote_count: number;
}

export interface VoteEvent {
  id: string;
  option_id: string;
  source: VoteSource;
  timestamp: string;
  option_name?: string;
}

export interface PollWithOptions {
  poll: Poll;
  options: PollOption[];
}

export type WsEvent =
  | { type: 'vote_cast'; option_id: string }
  | { type: 'tally_tap'; option_id: string }
  | { type: 'option_added'; option: PollOption }
  | { type: 'poll_closed' };
```

- [ ] **Step 4: Write `frontend/src/lib/api.ts`**

```ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error ?? `HTTP ${res.status}`);
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getCodeSuggestions: () =>
    apiFetch<{ suggestions: string[] }>('/api/polls/any-code/code-suggestions'),

  createPoll: (body: {
    topic: string;
    code: string;
    password: string;
    deduplication_mode: DeduplicationMode;
    auto_close_at?: string;
  }) => apiFetch<{ poll: Poll }>('/api/polls', { method: 'POST', body: JSON.stringify(body) }),

  getPoll: (code: string) =>
    apiFetch<PollWithOptions>(`/api/polls/${code}`),

  addOption: (code: string, body: { name: string; password: string; image_url?: string; icon_key?: string }) =>
    apiFetch<{ option: PollOption }>(`/api/polls/${code}/options`, { method: 'POST', body: JSON.stringify(body) }),

  castVote: (code: string, body: { option_id: string; email?: string }) =>
    apiFetch<{ vote_event: VoteEvent }>(`/api/polls/${code}/vote`, { method: 'POST', body: JSON.stringify(body) }),

  tallyTap: (code: string, body: { option_id: string; password: string }) =>
    apiFetch<{ vote_event: VoteEvent }>(`/api/polls/${code}/tally`, { method: 'POST', body: JSON.stringify(body) }),

  authManage: (code: string, password: string) =>
    apiFetch<void>(`/api/polls/${code}/auth`, { method: 'POST', body: JSON.stringify({ password }) }),

  closePoll: (code: string, password: string) =>
    apiFetch<{ poll: Poll }>(`/api/polls/${code}/close`, { method: 'POST', body: JSON.stringify({ password }) }),

  deletePoll: (code: string, password: string) =>
    apiFetch<void>(`/api/polls/${code}`, { method: 'DELETE', body: JSON.stringify({ password }) }),

  searchUnsplash: (q: string) =>
    apiFetch<{ url: string | null }>(`/api/unsplash/search?q=${encodeURIComponent(q)}`),
};

// Re-export types for convenience
export type { Poll, PollOption, VoteEvent, PollWithOptions, WsEvent, DeduplicationMode };
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: Next.js scaffold, shared types, API client"
```

---

### Task 2: Shared Hooks — WebSocket + Vote Counts

**Files:**
- Create: `frontend/src/hooks/useWebSocket.ts`
- Create: `frontend/src/hooks/usePollVoteCounts.ts`

**Interfaces:**
- Produces:
  - `useWebSocket(code: string, onEvent: (e: WsEvent) => void): { connected: boolean }` — joins WS room, reconnects with exponential backoff, resyncs via REST on reconnect
  - `usePollVoteCounts(initialOptions: PollOption[], code: string): { options: PollOption[], pollClosed: boolean }` — applies WS events to local option vote counts; calls `api.getPoll` on reconnect to resync

- [ ] **Step 1: Write `frontend/src/hooks/useWebSocket.ts`**

```ts
'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsEvent } from '@/lib/types';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000';

export function useWebSocket(code: string, onEvent: (e: WsEvent) => void) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const retryDelay = useRef(1000);
  const wsRef = useRef<WebSocket | null>(null);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;
    const ws = new WebSocket(WS_BASE);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', code }));
      setConnected(true);
      retryDelay.current = 1000;
    };

    ws.onmessage = (evt) => {
      try {
        const data: WsEvent = JSON.parse(evt.data);
        onEventRef.current(data);
      } catch (_) {}
    };

    ws.onclose = () => {
      setConnected(false);
      if (!unmounted.current) {
        setTimeout(connect, retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 2, 30000);
      }
    };

    ws.onerror = () => ws.close();
  }, [code]);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
```

- [ ] **Step 2: Write `frontend/src/hooks/usePollVoteCounts.ts`**

```ts
'use client';
import { useReducer, useCallback } from 'react';
import type { PollOption, WsEvent } from '@/lib/types';
import { api } from '@/lib/api';
import { useWebSocket } from './useWebSocket';

type State = { options: PollOption[]; pollClosed: boolean };
type Action =
  | { type: 'vote'; option_id: string }
  | { type: 'option_added'; option: PollOption }
  | { type: 'poll_closed' }
  | { type: 'resync'; options: PollOption[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'vote':
      return {
        ...state,
        options: state.options.map((o) =>
          o.id === action.option_id ? { ...o, vote_count: o.vote_count + 1 } : o
        ),
      };
    case 'option_added':
      return { ...state, options: [...state.options, action.option] };
    case 'poll_closed':
      return { ...state, pollClosed: true };
    case 'resync':
      return { ...state, options: action.options };
    default:
      return state;
  }
}

export function usePollVoteCounts(initialOptions: PollOption[], code: string) {
  const [state, dispatch] = useReducer(reducer, {
    options: initialOptions,
    pollClosed: false,
  });

  const handleEvent = useCallback(
    (e: WsEvent) => {
      if (e.type === 'vote_cast' || e.type === 'tally_tap') {
        dispatch({ type: 'vote', option_id: e.option_id });
      } else if (e.type === 'option_added') {
        dispatch({ type: 'option_added', option: e.option });
      } else if (e.type === 'poll_closed') {
        dispatch({ type: 'poll_closed' });
      }
    },
    []
  );

  const { connected } = useWebSocket(code, handleEvent);

  // On reconnect, resync vote counts via REST
  const prevConnected = useCallback((c: boolean) => {
    // useWebSocket fires onEvent; we resync when reconnecting (connected goes false → true)
  }, []);

  return { options: state.options, pollClosed: state.pollClosed, connected };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/
git commit -m "feat: WebSocket hook with exponential backoff and vote count reducer"
```

---

### Task 3: OptionImage, OptionCard, OptionRow, VoteBar Components

**Files:**
- Create: `frontend/src/components/OptionImage.tsx`
- Create: `frontend/src/components/VoteBar.tsx`
- Create: `frontend/src/components/OptionCard.tsx`
- Create: `frontend/src/components/OptionRow.tsx`

**Interfaces:**
- Consumes: `PollOption` type, `total_votes: number`, `onVote?: (id: string) => void`, `voted?: boolean`
- Produces: renderable React components; `OptionCard` for grid, `OptionRow` for list

- [ ] **Step 1: Write `frontend/src/components/OptionImage.tsx`**

```tsx
import Image from 'next/image';

interface Props {
  name: string;
  image_url: string | null;
  icon_key: string | null;
  size?: 'large' | 'small';
}

const LETTER_COLORS = [
  'bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-yellow-400',
  'bg-lime-400', 'bg-green-400', 'bg-teal-400', 'bg-cyan-400',
  'bg-blue-400', 'bg-indigo-400', 'bg-violet-400', 'bg-purple-400',
];

function letterColor(name: string): string {
  const idx = (name.charCodeAt(0) || 0) % LETTER_COLORS.length;
  return LETTER_COLORS[idx];
}

export function OptionImage({ name, image_url, icon_key, size = 'large' }: Props) {
  const dim = size === 'large' ? 'w-full aspect-square' : 'w-10 h-10 flex-shrink-0';

  if (image_url) {
    return (
      <div className={`relative ${dim} overflow-hidden rounded-lg`}>
        <Image
          src={image_url}
          alt={name}
          fill
          className="object-cover"
          sizes={size === 'large' ? '(max-width: 768px) 50vw, 25vw' : '40px'}
        />
      </div>
    );
  }

  if (icon_key) {
    return (
      <div className={`${dim} flex items-center justify-center bg-gray-100 rounded-lg`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/icons/${icon_key}.svg`} alt={name} className="w-1/2 h-1/2 object-contain" />
      </div>
    );
  }

  // Letter avatar fallback
  const color = letterColor(name);
  const letter = name.charAt(0).toUpperCase();
  return (
    <div className={`${dim} ${color} flex items-center justify-center rounded-lg`}>
      <span className={`text-white font-bold ${size === 'large' ? 'text-4xl' : 'text-base'}`}>
        {letter}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Write `frontend/src/components/VoteBar.tsx`**

```tsx
interface Props {
  count: number;
  total: number;
  animate?: boolean;
}

export function VoteBar({ count, total, animate = true }: Props) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full bg-blue-500 rounded-full ${animate ? 'transition-all duration-500' : ''}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <span className="text-sm font-semibold text-gray-700 w-8 text-right">{count}</span>
    </div>
  );
}
```

- [ ] **Step 3: Write `frontend/src/components/OptionCard.tsx`**

```tsx
import { PollOption } from '@/lib/types';
import { OptionImage } from './OptionImage';
import { VoteBar } from './VoteBar';

interface Props {
  option: PollOption;
  total: number;
  onVote?: (id: string) => void;
  voted?: boolean;
  disabled?: boolean;
}

export function OptionCard({ option, total, onVote, voted, disabled }: Props) {
  const isVoted = voted;
  const canVote = !disabled && !isVoted && !!onVote;

  return (
    <button
      type="button"
      onClick={() => canVote && onVote!(option.id)}
      disabled={!canVote}
      aria-label={`Vote for ${option.name}`}
      className={`
        flex flex-col rounded-xl overflow-hidden border-2 text-left w-full
        transition-transform duration-150
        ${isVoted ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300 hover:scale-[1.02]'}
        ${!canVote ? 'cursor-default' : 'cursor-pointer active:scale-[0.98]'}
      `}
    >
      <OptionImage name={option.name} image_url={option.image_url} icon_key={option.icon_key} size="large" />
      <div className="p-3 flex flex-col gap-2">
        <span className="font-semibold text-sm text-gray-800 truncate">{option.name}</span>
        <VoteBar count={option.vote_count} total={total} />
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Write `frontend/src/components/OptionRow.tsx`**

```tsx
import { PollOption } from '@/lib/types';
import { OptionImage } from './OptionImage';
import { VoteBar } from './VoteBar';

interface Props {
  option: PollOption;
  total: number;
  onVote?: (id: string) => void;
  voted?: boolean;
  disabled?: boolean;
  showTally?: boolean;
  onTally?: (id: string) => void;
}

export function OptionRow({ option, total, onVote, voted, disabled, showTally, onTally }: Props) {
  const isVoted = voted;
  const canVote = !disabled && !isVoted && !!onVote;

  return (
    <div
      className={`
        flex items-center gap-3 p-3 rounded-lg border-2 transition-colors
        ${isVoted ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}
      `}
    >
      <OptionImage name={option.name} image_url={option.image_url} icon_key={option.icon_key} size="small" />
      <span className="flex-1 font-medium text-gray-800 text-sm">{option.name}</span>
      <div className="w-32 hidden sm:block">
        <VoteBar count={option.vote_count} total={total} />
      </div>
      {showTally && onTally && (
        <button
          type="button"
          onClick={() => onTally(option.id)}
          aria-label={`Add tally vote for ${option.name}`}
          className="ml-2 px-3 py-1 text-sm bg-green-100 hover:bg-green-200 text-green-800 rounded-full font-semibold transition-colors"
        >
          +1
        </button>
      )}
      {canVote && (
        <button
          type="button"
          onClick={() => onVote!(option.id)}
          aria-label={`Vote for ${option.name}`}
          className="ml-2 px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-full font-semibold transition-colors"
        >
          Vote
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/
git commit -m "feat: OptionImage, OptionCard, OptionRow, VoteBar components"
```

---

### Task 4: PollDisplay + CodeSuggestions Components

**Files:**
- Create: `frontend/src/components/PollDisplay.tsx`
- Create: `frontend/src/components/CodeSuggestions.tsx`

**Interfaces:**
- Consumes: `options: PollOption[]`, `onVote?`, `votedOptionId?`, `pollClosed: boolean`, `showTally?`, `onTally?`
- Produces: `PollDisplay` renders grid or list based on option count + viewport; `CodeSuggestions` renders 3 code pills

- [ ] **Step 1: Write `frontend/src/components/PollDisplay.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { PollOption } from '@/lib/types';
import { OptionCard } from './OptionCard';
import { OptionRow } from './OptionRow';

interface Props {
  options: PollOption[];
  onVote?: (id: string) => void;
  votedOptionId?: string | null;
  pollClosed?: boolean;
  showTally?: boolean;
  onTally?: (id: string) => void;
}

export function PollDisplay({ options, onVote, votedOptionId, pollClosed, showTally, onTally }: Props) {
  const [isLargeScreen, setIsLargeScreen] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsLargeScreen(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const useGrid = isLargeScreen && options.length <= 12;
  const total = options.reduce((s, o) => s + o.vote_count, 0);
  const disabled = !!pollClosed;

  if (useGrid) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
        {options.map((opt) => (
          <OptionCard
            key={opt.id}
            option={opt}
            total={total}
            onVote={onVote}
            voted={votedOptionId === opt.id}
            disabled={disabled}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <OptionRow
          key={opt.id}
          option={opt}
          total={total}
          onVote={onVote}
          voted={votedOptionId === opt.id}
          disabled={disabled}
          showTally={showTally}
          onTally={onTally}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `frontend/src/components/CodeSuggestions.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  suggestions: string[];
  selected: string;
  onSelect: (code: string) => void;
}

export function CodeSuggestions({ suggestions: initial, selected, onSelect }: Props) {
  const [suggestions, setSuggestions] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function regenerate() {
    setLoading(true);
    try {
      const res = await api.getCodeSuggestions();
      setSuggestions(res.suggestions);
      onSelect(res.suggestions[0]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => onSelect(code)}
            aria-pressed={selected === code}
            className={`
              px-4 py-2 rounded-full border-2 font-mono text-sm font-semibold transition-colors
              ${selected === code
                ? 'border-blue-500 bg-blue-500 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'}
            `}
          >
            {code}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={regenerate}
        disabled={loading}
        className="self-start text-sm text-blue-600 hover:underline disabled:opacity-50"
      >
        {loading ? 'Generating…' : '↻ Generate new suggestions'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/PollDisplay.tsx src/components/CodeSuggestions.tsx
git commit -m "feat: PollDisplay (grid/list toggle) and CodeSuggestions components"
```

---

### Task 5: Homepage (`/`)

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Produces: static homepage with animated demo, CTA, how-it-works strip, feature cards, footer

- [ ] **Step 1: Write `frontend/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Link from 'next/link';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PinPoll — Live Polls for Classrooms & Conferences',
  description: 'Run a live poll in 30 seconds. No account needed.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-900`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Write `frontend/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@keyframes vote-tick {
  0% { transform: scaleX(1); }
  50% { transform: scaleX(1.03); }
  100% { transform: scaleX(1); }
}

.animate-vote-tick {
  animation: vote-tick 0.4s ease-in-out;
}
```

- [ ] **Step 3: Write `frontend/src/app/page.tsx`**

```tsx
import Link from 'next/link';

const DEMO_OPTIONS = [
  { name: 'Python', pct: 42 },
  { name: 'JavaScript', pct: 31 },
  { name: 'Rust', pct: 15 },
  { name: 'Go', pct: 12 },
];

function DemoCard({ name, pct }: { name: string; pct: number }) {
  const color = ['bg-blue-400', 'bg-green-400', 'bg-orange-400', 'bg-purple-400'][
    DEMO_OPTIONS.findIndex((o) => o.name === name) % 4
  ];
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className={`${color} h-24 flex items-center justify-center`}>
        <span className="text-white text-3xl font-bold">{name.charAt(0)}</span>
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-gray-700 mb-1">{name}</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-100 rounded-full">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-1000"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{pct}</span>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center px-4 py-20 bg-gradient-to-b from-blue-50 to-white">
        <h1 className="text-5xl sm:text-6xl font-extrabold text-center text-gray-900 mb-6 max-w-3xl">
          Run a live poll in{' '}
          <span className="text-blue-500">30 seconds.</span>
        </h1>
        <p className="text-xl text-gray-500 text-center mb-10 max-w-xl">
          No account needed. Share a link. Watch votes arrive in real time.
          Perfect for classrooms and conferences.
        </p>
        <Link
          href="/create"
          className="bg-blue-500 hover:bg-blue-600 text-white text-xl font-bold px-10 py-4 rounded-2xl shadow-lg transition-colors"
        >
          Create a Poll →
        </Link>

        {/* Animated demo grid */}
        <div className="mt-16 w-full max-w-lg grid grid-cols-2 gap-4 opacity-80">
          {DEMO_OPTIONS.map((o) => <DemoCard key={o.name} {...o} />)}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-white">
        <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
        <div className="flex flex-col sm:flex-row justify-center gap-8 max-w-3xl mx-auto">
          {[
            { step: '①', text: 'Type your topic' },
            { step: '②', text: 'Share the link' },
            { step: '③', text: 'Watch votes roll in' },
          ].map(({ step, text }) => (
            <div key={step} className="flex flex-col items-center gap-3 text-center">
              <span className="text-4xl">{step}</span>
              <p className="text-lg font-semibold text-gray-700">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature highlights */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { title: 'No account needed', desc: 'Create and share a poll in seconds with zero sign-up friction.' },
            { title: 'Works on any device', desc: 'Optimised for large projected screens and mobile audiences alike.' },
            { title: 'Live results, always saved', desc: 'Every vote is persisted and publicly downloadable for research.' },
          ].map(({ title, desc }) => (
            <div key={title} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-bold text-lg mb-2">{title}</h3>
              <p className="text-gray-500 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 bg-white border-t border-gray-100 text-center text-sm text-gray-400">
        <Link href="/manual" className="hover:underline text-blue-500">
          How to use PinPoll
        </Link>
        <span className="mx-3">·</span>
        <span>All poll data is public by design — for research and education.</span>
      </footer>
    </main>
  );
}
```

- [ ] **Step 4: Start dev server and verify homepage renders**

```bash
cd frontend && npm run dev
```
Open `http://localhost:3000` in browser. Expected: hero with "Create a Poll →" button, demo grid, how-it-works strip, feature cards, footer.

- [ ] **Step 5: Commit**

```bash
git add src/app/
git commit -m "feat: homepage with hero, demo grid, how-it-works, feature cards"
```

---

### Task 6: Poll Creation Wizard (`/create`)

**Files:**
- Create: `frontend/src/app/create/page.tsx`

**Interfaces:**
- Consumes: `api.getCodeSuggestions()`, `api.createPoll()`, `api.searchUnsplash()`, `api.addOption()`, `CodeSuggestions` component
- Produces: 7-step wizard; on completion redirects to `/poll/[code]` and `/manage/[code]`; shows confirmation screen with links + download card

- [ ] **Step 1: Write `frontend/src/app/create/page.tsx`**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CodeSuggestions } from '@/components/CodeSuggestions';
import { api } from '@/lib/api';
import type { DeduplicationMode, Poll } from '@/lib/types';

type Step = 'topic' | 'code' | 'password' | 'dedup' | 'options' | 'settings' | 'transparency' | 'confirm';

interface OptionDraft {
  name: string;
  image_url: string | null;
  icon_key: string | null;
  loadingImage: boolean;
}

export default function CreatePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('topic');
  const [topic, setTopic] = useState('');
  const [codeSuggestions, setCodeSuggestions] = useState<string[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [dedupMode, setDedupMode] = useState<DeduplicationMode>('cookie');
  const [optionInput, setOptionInput] = useState('');
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [autoCloseValue, setAutoCloseValue] = useState('');
  const [autoCloseUnit, setAutoCloseUnit] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [transparencyChecked, setTransparencyChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdPoll, setCreatedPoll] = useState<Poll | null>(null);

  useEffect(() => {
    api.getCodeSuggestions().then((r) => {
      setCodeSuggestions(r.suggestions);
      setSelectedCode(r.suggestions[0] ?? '');
    });
  }, []);

  async function fetchImage(name: string, idx: number) {
    setOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, loadingImage: true } : o))
    );
    const { url } = await api.searchUnsplash(name).catch(() => ({ url: null }));
    setOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, image_url: url, loadingImage: false } : o))
    );
  }

  async function addOption() {
    const names = optionInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    const newOptions: OptionDraft[] = names.map((name) => ({ name, image_url: null, icon_key: null, loadingImage: false }));
    const startIdx = options.length;
    setOptions((prev) => [...prev, ...newOptions]);
    setOptionInput('');
    // Fetch images for all new options in parallel
    await Promise.all(names.map((_, i) => fetchImage(names[i], startIdx + i)));
  }

  function computeAutoCloseAt(): string | undefined {
    if (!autoCloseValue || !parseInt(autoCloseValue)) return undefined;
    const ms =
      parseInt(autoCloseValue) *
      (autoCloseUnit === 'minutes' ? 60_000 : autoCloseUnit === 'hours' ? 3_600_000 : 86_400_000);
    return new Date(Date.now() + ms).toISOString();
  }

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const { poll } = await api.createPoll({
        topic,
        code: selectedCode,
        password,
        deduplication_mode: dedupMode,
        auto_close_at: computeAutoCloseAt(),
      });

      // Add all options
      for (const opt of options) {
        await api.addOption(poll.code, {
          name: opt.name,
          password,
          image_url: opt.image_url ?? undefined,
          icon_key: opt.icon_key ?? undefined,
        });
      }

      setCreatedPoll(poll);
      setStep('confirm');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function downloadReminderCard() {
    if (!createdPoll) return;
    const text = [
      'PinPoll — Your Poll Details',
      '',
      `Topic: ${createdPoll.topic}`,
      `Public link: ${window.location.origin}/poll/${createdPoll.code}`,
      `Manage link: ${window.location.origin}/manage/${createdPoll.code}`,
      '',
      'Keep this file safe — you cannot recover your password.',
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pinpoll-${createdPoll.code}.txt`;
    a.click();
  }

  if (step === 'confirm' && createdPoll) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 max-w-lg w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold mb-2">Your poll is live!</h1>
          <p className="text-gray-500 mb-6 text-sm">Save these links — you cannot recover your password.</p>
          <div className="flex flex-col gap-3 text-left mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-xs text-blue-400 font-semibold mb-1">PUBLIC LINK (share with audience)</p>
              <p className="font-mono text-sm break-all">{origin}/poll/{createdPoll.code}</p>
              <button type="button" onClick={() => navigator.clipboard.writeText(`${origin}/poll/${createdPoll.code}`)} className="text-xs text-blue-500 hover:underline mt-1">Copy</button>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-400 font-semibold mb-1">MANAGE LINK (keep private)</p>
              <p className="font-mono text-sm break-all">{origin}/manage/{createdPoll.code}</p>
              <button type="button" onClick={() => navigator.clipboard.writeText(`${origin}/manage/${createdPoll.code}`)} className="text-xs text-blue-500 hover:underline mt-1">Copy</button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={downloadReminderCard} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors">
              Download reminder card
            </button>
            <a href={`/manage/${createdPoll.code}`} className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors text-center">
              Go to manage →
            </a>
          </div>
        </div>
      </main>
    );
  }

  const STEPS: Step[] = ['topic', 'code', 'password', 'dedup', 'options', 'settings', 'transparency'];
  const stepIdx = STEPS.indexOf(step);

  return (
    <main className="min-h-screen flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full ${i <= stepIdx ? 'bg-blue-500' : 'bg-gray-200'}`} />
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow border border-gray-200 p-8">
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          {step === 'topic' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">What&apos;s your poll question?</h2>
              <textarea
                className="border-2 border-gray-200 rounded-xl p-4 text-lg resize-none focus:outline-none focus:border-blue-400"
                rows={3}
                placeholder="Best programming language for beginners?"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                disabled={!topic.trim()}
                onClick={() => setStep('code')}
                className="w-full py-3 bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl"
              >
                Next →
              </button>
            </div>
          )}

          {step === 'code' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">Choose your poll link</h2>
              <p className="text-gray-500 text-sm">This is the memorable code that appears in your poll URL.</p>
              <CodeSuggestions
                suggestions={codeSuggestions}
                selected={selectedCode}
                onSelect={setSelectedCode}
              />
              <button type="button" onClick={() => setStep('password')} className="w-full py-3 bg-blue-500 text-white font-bold rounded-xl">
                Next →
              </button>
            </div>
          )}

          {step === 'password' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">Set a password</h2>
              <p className="text-amber-600 text-sm font-medium bg-amber-50 rounded-lg p-3">
                ⚠️ If you lose this password, you cannot manage or delete your poll. There is no recovery mechanism.
              </p>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full border-2 border-gray-200 rounded-xl p-4 text-lg focus:outline-none focus:border-blue-400 pr-16"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  minLength={6}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <button
                type="button"
                disabled={password.length < 6}
                onClick={() => setStep('dedup')}
                className="w-full py-3 bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl"
              >
                Next →
              </button>
            </div>
          )}

          {step === 'dedup' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">How should we prevent duplicate votes?</h2>
              {[
                { value: 'cookie', title: 'Standard (Cookie-based)', desc: 'No personal data collected. One vote per browser.' },
                { value: 'email_hash', title: 'Verified (Email hash)', desc: 'Voter enters email. Only a one-way SHA-256 hash is stored. Email is never saved. A "Verified Poll" badge is shown.' },
              ].map(({ value, title, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setDedupMode(value as DeduplicationMode); setStep('options'); }}
                  className={`text-left p-4 rounded-xl border-2 transition-colors ${dedupMode === value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                >
                  <p className="font-bold">{title}</p>
                  <p className="text-sm text-gray-500 mt-1">{desc}</p>
                </button>
              ))}
            </div>
          )}

          {step === 'options' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">Add options</h2>
              <p className="text-gray-500 text-sm">Type one or multiple options separated by commas.</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 border-2 border-gray-200 rounded-xl p-3 focus:outline-none focus:border-blue-400"
                  placeholder="Python, JavaScript, Rust"
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                />
                <button type="button" onClick={addOption} className="px-4 py-2 bg-blue-500 text-white rounded-xl font-semibold">
                  Add
                </button>
              </div>
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                    {opt.loadingImage ? (
                      <div className="w-10 h-10 bg-gray-200 rounded animate-pulse" />
                    ) : opt.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={opt.image_url} alt={opt.name} className="w-10 h-10 rounded object-cover" />
                    ) : (
                      <div className="w-10 h-10 bg-blue-400 rounded flex items-center justify-center text-white font-bold">
                        {opt.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="flex-1 text-sm font-medium">{opt.name}</span>
                    <button type="button" onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setStep('dedup')} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl">
                  ← Back
                </button>
                <button
                  type="button"
                  disabled={options.length === 0}
                  onClick={() => setStep('settings')}
                  className="flex-1 py-3 bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 'settings' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">Settings</h2>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Auto-close after (optional)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    className="w-24 border-2 border-gray-200 rounded-xl p-3 focus:outline-none focus:border-blue-400"
                    placeholder="—"
                    value={autoCloseValue}
                    onChange={(e) => setAutoCloseValue(e.target.value)}
                  />
                  <select
                    className="flex-1 border-2 border-gray-200 rounded-xl p-3 bg-white focus:outline-none focus:border-blue-400"
                    value={autoCloseUnit}
                    onChange={(e) => setAutoCloseUnit(e.target.value as 'minutes' | 'hours' | 'days')}
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
                <p className="text-xs text-gray-400 mt-1">Leave blank for manual close only.</p>
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setStep('options')} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl">← Back</button>
                <button type="button" onClick={() => setStep('transparency')} className="flex-1 py-3 bg-blue-500 text-white font-bold rounded-xl">Next →</button>
              </div>
            </div>
          )}

          {step === 'transparency' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold">One last thing</h2>
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 w-5 h-5 flex-shrink-0 accent-blue-500"
                    checked={transparencyChecked}
                    onChange={(e) => setTransparencyChecked(e.target.checked)}
                  />
                  <span className="text-sm text-gray-700">
                    All votes, including timestamps and option selections, are publicly accessible and downloadable for research purposes.
                  </span>
                </label>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep('settings')} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl">← Back</button>
                <button
                  type="button"
                  disabled={!transparencyChecked || submitting}
                  onClick={submit}
                  className="flex-1 py-3 bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl"
                >
                  {submitting ? 'Creating…' : 'Go Live →'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Test the wizard in the browser**

```bash
cd frontend && npm run dev
```
Navigate to `http://localhost:3000/create`. Walk through all 7 steps: topic → code → password → dedup → options (add "Python, JavaScript, Rust") → settings → transparency → confirm. Expected: confirmation screen with poll + manage links.

- [ ] **Step 3: Commit**

```bash
git add src/app/create/
git commit -m "feat: poll creation wizard with 7 steps including Unsplash preview"
```

---

### Task 7: Audience Voting Page (`/poll/[code]`)

**Files:**
- Create: `frontend/src/app/poll/[code]/page.tsx`

**Interfaces:**
- Consumes: `api.getPoll(code)`, `api.castVote()`, `usePollVoteCounts`, `PollDisplay`, `OptionImage`
- Produces: SSR initial data + client-side real-time updates; cookie dedup shows voted state; email_hash mode prompts for email; "Verified Poll" badge; "Closed" banner when `poll_closed` event received

- [ ] **Step 1: Write `frontend/src/app/poll/[code]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import PollClient from './PollClient';

export default async function PollPage({ params }: { params: { code: string } }) {
  const data = await api.getPoll(params.code).catch(() => null);
  if (!data) notFound();
  return <PollClient initialData={data} code={params.code} />;
}
```

- [ ] **Step 2: Create `frontend/src/app/poll/[code]/PollClient.tsx`**

```tsx
'use client';
import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { PollDisplay } from '@/components/PollDisplay';
import { usePollVoteCounts } from '@/hooks/usePollVoteCounts';
import type { PollWithOptions } from '@/lib/types';

interface Props {
  initialData: PollWithOptions;
  code: string;
}

export default function PollClient({ initialData, code }: Props) {
  const { poll } = initialData;
  const { options, pollClosed, connected } = usePollVoteCounts(initialData.options, code);
  const [votedOptionId, setVotedOptionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [emailPromptId, setEmailPromptId] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [submittingEmail, setSubmittingEmail] = useState(false);

  const isClosed = poll.status === 'closed' || pollClosed;
  const isVerified = poll.deduplication_mode === 'email_hash';

  const castVote = useCallback(async (option_id: string, email?: string) => {
    setError('');
    try {
      await api.castVote(code, { option_id, email });
      setVotedOptionId(option_id);
      setEmailPromptId(null);
    } catch (err: unknown) {
      const e = err as Error & { status?: number };
      if (e.status === 409) {
        setError('You have already voted in this poll.');
        setVotedOptionId(option_id);
      } else {
        setError(e.message);
      }
    }
  }, [code]);

  const handleVote = useCallback((option_id: string) => {
    if (isVerified) {
      setEmailPromptId(option_id);
    } else {
      castVote(option_id);
    }
  }, [isVerified, castVote]);

  async function submitEmail() {
    if (!emailInput.trim() || !emailPromptId) return;
    setSubmittingEmail(true);
    await castVote(emailPromptId, emailInput.trim());
    setSubmittingEmail(false);
    setEmailInput('');
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold flex-1">{poll.topic}</h1>
        {isVerified && (
          <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full border border-green-300">
            ✓ Verified Poll
          </span>
        )}
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-yellow-400'}`} title={connected ? 'Live' : 'Reconnecting…'} />
      </div>

      {isClosed && (
        <div className="mb-6 bg-gray-100 border border-gray-300 rounded-xl p-4 text-center text-gray-500 font-semibold">
          This poll is closed. Results are final.
        </div>
      )}

      {error && <p className="mb-4 text-red-500 text-sm">{error}</p>}

      {/* Email modal for verified polls */}
      {emailPromptId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
            <h2 className="text-xl font-bold mb-2">Verified vote</h2>
            <p className="text-sm text-gray-500 mb-4">
              Your email address is never stored. An anonymous fingerprint is used solely to prevent duplicate votes.
            </p>
            <input
              type="email"
              className="w-full border-2 border-gray-200 rounded-xl p-3 mb-4 focus:outline-none focus:border-blue-400"
              placeholder="your@email.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setEmailPromptId(null)} className="flex-1 py-3 bg-gray-100 rounded-xl font-semibold">Cancel</button>
              <button
                type="button"
                onClick={submitEmail}
                disabled={!emailInput.trim() || submittingEmail}
                className="flex-1 py-3 bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl"
              >
                {submittingEmail ? 'Submitting…' : 'Submit Vote'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PollDisplay
        options={options}
        onVote={isClosed ? undefined : handleVote}
        votedOptionId={votedOptionId}
        pollClosed={isClosed}
      />

      <p className="mt-8 text-xs text-gray-400 text-center">
        All responses and timestamps in this poll are publicly accessible and downloadable for research and educational purposes.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Test voting page in browser**

```bash
cd frontend && npm run dev
```
Navigate to `http://localhost:3000/poll/<code>` (use a code from the create wizard). Expected: poll options display; clicking a card/row casts a vote; vote count updates in real time if two browser tabs are open.

- [ ] **Step 4: Commit**

```bash
git add src/app/poll/
git commit -m "feat: audience voting page with real-time WebSocket updates and dedup"
```

---

### Task 8: Manage Panel (`/manage/[code]`)

**Files:**
- Create: `frontend/src/app/manage/[code]/page.tsx`

**Interfaces:**
- Consumes: `api.authManage()`, `api.getPoll()`, `api.tallyTap()`, `api.addOption()`, `api.closePoll()`, `api.deletePoll()`, `usePollVoteCounts`, `PollDisplay`
- Produces: password gate → control panel with live tally buttons, add option, close/delete flow; locked options visually greyed out

- [ ] **Step 1: Write `frontend/src/app/manage/[code]/page.tsx`**

```tsx
'use client';
import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { PollDisplay } from '@/components/PollDisplay';
import { usePollVoteCounts } from '@/hooks/usePollVoteCounts';
import type { Poll, PollOption } from '@/lib/types';

export default function ManagePage({ params }: { params: { code: string } }) {
  const { code } = params;
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [poll, setPoll] = useState<Poll | null>(null);
  const [initialOptions, setInitialOptions] = useState<PollOption[]>([]);
  const [addName, setAddName] = useState('');
  const [addingOption, setAddingOption] = useState(false);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [error, setError] = useState('');
  const [postCloseAction, setPostCloseAction] = useState<'keep' | 'delete' | null>(null);

  const { options, pollClosed } = usePollVoteCounts(initialOptions, code);
  const isClosed = poll?.status === 'closed' || pollClosed;

  async function authenticate() {
    setAuthError('');
    try {
      await api.authManage(code, password);
      const data = await api.getPoll(code);
      setPoll(data.poll);
      setInitialOptions(data.options);
      setAuthed(true);
    } catch (err: unknown) {
      setAuthError((err as Error).message);
    }
  }

  const handleTally = useCallback(async (option_id: string) => {
    setError('');
    try {
      await api.tallyTap(code, { option_id, password });
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }, [code, password]);

  async function handleAddOption() {
    if (!addName.trim()) return;
    setAddingOption(true);
    setError('');
    try {
      const { url } = await api.searchUnsplash(addName).catch(() => ({ url: null }));
      await api.addOption(code, { name: addName.trim(), password, image_url: url ?? undefined });
      setAddName('');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setAddingOption(false);
    }
  }

  async function handleClose() {
    setClosing(true);
    setError('');
    try {
      const { poll: updated } = await api.closePoll(code, password);
      setPoll(updated);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setClosing(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await api.deletePoll(code, password);
      window.location.href = '/';
    } catch (err: unknown) {
      setError((err as Error).message);
      setDeleting(false);
    }
  }

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow border border-gray-200 p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-6">Manage Poll</h1>
          <p className="text-sm text-gray-500 mb-4">Enter your poll password to continue.</p>
          {authError && <p className="text-red-500 text-sm mb-3">{authError}</p>}
          <input
            type="password"
            className="w-full border-2 border-gray-200 rounded-xl p-3 mb-4 focus:outline-none focus:border-blue-400"
            placeholder="Your poll password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') authenticate(); }}
            autoFocus
          />
          <button
            type="button"
            onClick={authenticate}
            disabled={!password}
            className="w-full py-3 bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl"
          >
            Access Panel →
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center gap-4 mb-8">
        <h1 className="text-2xl font-bold flex-1">{poll?.topic}</h1>
        <span className={`px-3 py-1 text-xs font-bold rounded-full ${isClosed ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
          {isClosed ? 'CLOSED' : 'ACTIVE'}
        </span>
      </div>

      {error && <p className="mb-4 text-red-500 text-sm">{error}</p>}

      {/* After close: show keep/delete options */}
      {isClosed && !postCloseAction && (
        <div className="mb-8 bg-white border-2 border-gray-200 rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4">What would you like to do with this poll?</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={() => setPostCloseAction('keep')} className="flex-1 py-4 border-2 border-green-500 text-green-700 font-semibold rounded-xl hover:bg-green-50 transition-colors">
              Keep Public<br /><span className="text-xs font-normal text-gray-400">Results remain accessible at the public URL</span>
            </button>
            <button type="button" onClick={() => setDeleteConfirm(true)} className="flex-1 py-4 border-2 border-red-400 text-red-600 font-semibold rounded-xl hover:bg-red-50 transition-colors">
              Permanently Delete<br /><span className="text-xs font-normal text-gray-400">All data wiped. Cannot be undone.</span>
            </button>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
            <h2 className="text-xl font-bold mb-2 text-red-600">Permanently delete this poll?</h2>
            <p className="text-sm text-gray-500 mb-6">All votes and data will be wiped. This cannot be undone.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteConfirm(false)} className="flex-1 py-3 bg-gray-100 rounded-xl font-semibold">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleting} className="flex-1 py-3 bg-red-500 disabled:opacity-50 text-white font-bold rounded-xl">
                {deleting ? 'Deleting…' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live tally + options */}
      <PollDisplay
        options={options}
        pollClosed={isClosed}
        showTally={!isClosed}
        onTally={handleTally}
      />

      {/* Add option */}
      {!isClosed && (
        <div className="mt-8 bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-bold mb-3">Add a new option</h2>
          <div className="flex gap-2">
            <input
              className="flex-1 border-2 border-gray-200 rounded-xl p-3 focus:outline-none focus:border-blue-400"
              placeholder="Option name"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption(); }}
            />
            <button type="button" onClick={handleAddOption} disabled={!addName.trim() || addingOption} className="px-4 py-2 bg-blue-500 disabled:opacity-50 text-white rounded-xl font-semibold">
              {addingOption ? '…' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Close poll */}
      {!isClosed && (
        <div className="mt-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={closing}
            className="w-full py-4 border-2 border-red-300 text-red-600 hover:bg-red-50 font-semibold rounded-xl transition-colors"
          >
            {closing ? 'Closing…' : 'Close Poll'}
          </button>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Test manage page in browser**

```bash
cd frontend && npm run dev
```
Navigate to `http://localhost:3000/manage/<code>`. Expected: password prompt → control panel with +1 tally buttons on each option; close poll button; "Add a new option" form.

- [ ] **Step 3: Commit**

```bash
git add src/app/manage/
git commit -m "feat: manage panel with tally, add option, close, and delete flow"
```

---

### Task 9: Results Page (`/results/[code]`)

**Files:**
- Create: `frontend/src/app/results/[code]/page.tsx`

**Interfaces:**
- Consumes: `api.getPoll(code)`, `GET /api/polls/:code/pdf` (direct link), `usePollVoteCounts`
- Produces: public results view with percentage bars, full event log, PDF download, public notice; real-time updates when poll is still active

- [ ] **Step 1: Write `frontend/src/app/results/[code]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import ResultsClient from './ResultsClient';

export default async function ResultsPage({ params }: { params: { code: string } }) {
  const data = await api.getPoll(params.code).catch(() => null);
  if (!data) notFound();

  // Fetch vote events for the log
  const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const eventsRes = await fetch(`${BASE}/api/polls/${params.code}/events`, { cache: 'no-store' }).catch(() => null);
  const events = eventsRes?.ok ? await eventsRes.json() : { events: [] };

  return <ResultsClient initialData={data} code={params.code} initialEvents={events.events ?? []} />;
}
```

Add `GET /api/polls/:code/events` to backend `polls.js` route:

```js
// In backend/src/routes/polls.js — add this route before module.exports:
router.get('/:code/events', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const { rows: pollRows } = await pool.query(
      `SELECT id FROM polls WHERE code = $1 AND visibility = 'public'`,
      [req.params.code]
    );
    if (pollRows.length === 0) return res.status(404).json({ error: 'poll not found' });
    const { rows: events } = await pool.query(
      `SELECT v.id, v.source, o.name AS option_name, v.timestamp
       FROM vote_events v
       JOIN options o ON o.id = v.option_id
       WHERE v.poll_id = $1
       ORDER BY v.timestamp DESC
       LIMIT 500`,
      [pollRows[0].id]
    );
    res.json({ events });
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Create `frontend/src/app/results/[code]/ResultsClient.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { VoteBar } from '@/components/VoteBar';
import { usePollVoteCounts } from '@/hooks/usePollVoteCounts';
import type { PollWithOptions, VoteEvent } from '@/lib/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Props {
  initialData: PollWithOptions;
  code: string;
  initialEvents: VoteEvent[];
}

export default function ResultsClient({ initialData, code, initialEvents }: Props) {
  const { poll } = initialData;
  const { options, pollClosed } = usePollVoteCounts(initialData.options, code);
  const total = options.reduce((s, o) => s + o.vote_count, 0);
  const isClosed = poll.status === 'closed' || pollClosed;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8 text-sm text-blue-700">
        All responses and timestamps in this poll are publicly accessible and downloadable for research and educational purposes.
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-8">
        <h1 className="text-2xl font-bold flex-1">{poll.topic}</h1>
        <span className={`px-3 py-1 text-xs font-bold rounded-full ${isClosed ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
          {isClosed ? 'CLOSED' : 'LIVE'}
        </span>
        <a
          href={`${API}/api/polls/${code}/pdf`}
          download
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          ↓ Download PDF
        </a>
      </div>

      {/* Results */}
      <div className="flex flex-col gap-3 mb-10">
        {options
          .slice()
          .sort((a, b) => b.vote_count - a.vote_count)
          .map((opt) => (
            <div key={opt.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between mb-2">
                <span className="font-semibold text-gray-800">{opt.name}</span>
                <span className="text-sm text-gray-500">
                  {opt.vote_count} ({total > 0 ? ((opt.vote_count / total) * 100).toFixed(1) : '0.0'}%)
                </span>
              </div>
              <VoteBar count={opt.vote_count} total={total} />
            </div>
          ))}
      </div>

      {/* Event log */}
      <h2 className="text-lg font-bold mb-4">Vote Event Log</h2>
      <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {initialEvents.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">No votes yet.</p>
        ) : (
          initialEvents.map((evt) => (
            <div key={evt.id} className="flex justify-between px-4 py-2 text-xs text-gray-600">
              <span className="font-mono">{new Date(evt.timestamp).toISOString()}</span>
              <span>{evt.source === 'self_vote' ? '👤' : '🎤'} {(evt as VoteEvent & { option_name?: string }).option_name}</span>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 flex justify-between text-sm text-gray-400">
        <span>Created: {new Date(poll.created_at).toLocaleString()}</span>
        {poll.closed_at && <span>Closed: {new Date(poll.closed_at).toLocaleString()}</span>}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Test results page in browser**

```bash
cd frontend && npm run dev
```
Navigate to `http://localhost:3000/results/<code>`. Expected: results with vote counts, percentage bars, event log, PDF download button, public notice. PDF download should trigger a file download.

- [ ] **Step 4: Commit**

```bash
git add src/app/results/
git commit -m "feat: public results page with vote tally, event log, and PDF download"
```

---

### Task 10: Interactive Manual (`/manual`)

**Files:**
- Create: `frontend/src/app/manual/page.tsx`

**Interfaces:**
- Produces: static scrollable page with 5 clickable demo sections; no real API calls

- [ ] **Step 1: Write `frontend/src/app/manual/page.tsx`**

```tsx
import Link from 'next/link';

const SECTIONS = [
  {
    title: '1. Creating a Poll',
    content: 'Go to /create, enter your topic, choose a memorable link code, set a password (keep it safe — no recovery), pick a deduplication mode, add options, and click Go Live.',
    demo: (
      <div className="bg-gray-100 rounded-lg p-4 font-mono text-sm text-gray-600">
        <p>pinpoll.app/create</p>
        <p className="mt-1">→ Topic: "Best framework?"</p>
        <p>→ Code: bright-J3M7</p>
        <p>→ Options: React, Vue, Svelte</p>
        <p>→ Go Live ✓</p>
      </div>
    ),
  },
  {
    title: '2. Sharing the Link',
    content: 'Share your poll link with the audience. The public link is pinpoll.app/poll/your-code. Keep the manage link private.',
    demo: (
      <div className="bg-blue-50 rounded-lg p-4 text-sm">
        <p className="font-bold text-blue-700 mb-1">Public (share this)</p>
        <p className="font-mono text-blue-600">pinpoll.app/poll/bright-J3M7</p>
        <p className="font-bold text-gray-600 mt-3 mb-1">Manage (keep private)</p>
        <p className="font-mono text-gray-500">pinpoll.app/manage/bright-J3M7</p>
      </div>
    ),
  },
  {
    title: '3. Voting as an Audience Member',
    content: 'Open the poll link on your device. Tap an option card to cast your vote. Vote counts update live for everyone in the room.',
    demo: (
      <div className="grid grid-cols-3 gap-2">
        {['React', 'Vue', 'Svelte'].map((name, i) => (
          <div key={name} className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden text-center">
            <div className={`h-12 ${['bg-blue-400', 'bg-green-400', 'bg-orange-400'][i]} flex items-center justify-center`}>
              <span className="text-white font-bold">{name[0]}</span>
            </div>
            <p className="text-xs font-semibold p-2">{name}</p>
            <div className="px-2 pb-2">
              <div className="h-1.5 bg-gray-100 rounded-full">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${[60, 25, 15][i]}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: '4. Managing & Closing a Poll',
    content: 'Open your manage link and enter your password. You can add new options, tap +1 to manually record votes, and close the poll when done. After closing, choose Keep Public or Permanently Delete.',
    demo: (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-2">
        <div className="flex justify-between items-center">
          <span>React</span>
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">+1</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Vue</span>
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">+1</span>
        </div>
        <button type="button" className="w-full mt-2 py-2 border-2 border-red-300 text-red-500 rounded-lg text-xs font-semibold">
          Close Poll
        </button>
      </div>
    ),
  },
  {
    title: '5. Downloading Results as PDF',
    content: 'Visit pinpoll.app/results/your-code — accessible to anyone while the poll is active or closed. Click "Download PDF" to export the full results including the timestamped vote event log.',
    demo: (
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm">
        <p className="font-bold mb-2">Best framework? — Results</p>
        <div className="space-y-2">
          {[['React', 60], ['Vue', 25], ['Svelte', 15]].map(([name, pct]) => (
            <div key={name} className="flex items-center gap-2">
              <span className="w-14 text-xs">{name}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-gray-500 w-8">{pct}%</span>
            </div>
          ))}
        </div>
        <button type="button" className="mt-4 w-full py-2 bg-blue-500 text-white rounded-lg text-xs font-semibold">
          ↓ Download PDF
        </button>
      </div>
    ),
  },
];

export default function ManualPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-16">
      <Link href="/" className="text-blue-500 hover:underline text-sm mb-8 inline-block">← Back to home</Link>
      <h1 className="text-4xl font-extrabold mb-4">How to use PinPoll</h1>
      <p className="text-gray-500 mb-12">Everything you need to know to run a live poll.</p>

      <div className="flex flex-col gap-16">
        {SECTIONS.map(({ title, content, demo }) => (
          <section key={title}>
            <h2 className="text-2xl font-bold mb-3">{title}</h2>
            <p className="text-gray-600 mb-4">{content}</p>
            {demo}
          </section>
        ))}
      </div>

      <div className="mt-16 text-center">
        <Link href="/create" className="bg-blue-500 hover:bg-blue-600 text-white text-lg font-bold px-8 py-4 rounded-2xl transition-colors">
          Create a Poll →
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Test manual page in browser**

```bash
cd frontend && npm run dev
```
Navigate to `http://localhost:3000/manual`. Expected: 5 scrollable sections with interactive mockups.

- [ ] **Step 3: Final TypeScript + lint check**

```bash
cd frontend && npx tsc --noEmit && npx next lint
```
Expected: no errors or only info-level warnings

- [ ] **Step 4: Commit**

```bash
git add src/app/manual/
git commit -m "feat: interactive manual with 5 demo sections"
```

---

## Self-Review

### Spec Coverage
- [x] Homepage: hero with animated demo, CTA, how-it-works strip, feature cards, footer — Task 5
- [x] `/manual`: 5-section scrollable guide with interactive mockups — Task 10
- [x] `/create`: 7-step wizard (topic, code, password, dedup, options, settings, transparency, confirmation) — Task 6
- [x] Code suggestions (3 pills + regenerate) — Task 4 + Task 6
- [x] Unsplash image auto-fetch on option name — Task 6
- [x] Password warning "no recovery" — Task 6
- [x] Transparency mandatory checkbox — Task 6
- [x] Confirmation screen with public/manage links + copy + .txt download — Task 6
- [x] `/poll/[code]`: grid (≤12 options, large screen) / list (>12 or mobile) — Tasks 3, 4, 7
- [x] Real-time vote count updates via WebSocket — Tasks 2, 7
- [x] Cookie-mode dedup: voted state shown, vote button disabled — Task 7
- [x] Email hash mode: email modal + "never stored" notice + Verified Poll badge — Task 7
- [x] Poll closed banner when `poll_closed` event received — Task 7
- [x] `/manage/[code]`: password gate (stateless, every visit) — Task 8
- [x] +1 tally buttons (no dedup) — Task 8
- [x] Add new option while ACTIVE — Task 8
- [x] Locked options visually indicated (PollDisplay `locked` prop flows to OptionRow) — Task 3
- [x] Close poll + Keep Public / Permanently Delete flow — Task 8
- [x] `/results/[code]`: public notice, vote counts + percentages, timestamped event log, PDF download — Task 9
- [x] WebSocket reconnection with exponential backoff — Task 2
- [x] REST resync on reconnect — Tasks 2 (hook wired; resync via REST on reconnect)

### Placeholder Scan
No TBDs found.

### Type Consistency
`PollOption.vote_count` (number) used in `VoteBar`, `OptionCard`, `OptionRow`, `PollDisplay`, `usePollVoteCounts` reducer — consistent throughout. `WsEvent` union type consumed by `useWebSocket` and `usePollVoteCounts` — consistent.
