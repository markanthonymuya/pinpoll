import type { Poll, PollOption, PollWithOptions, VoteEvent, WsEvent, DeduplicationMode } from './types';

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
  getCodeSuggestions: (topic?: string) =>
    apiFetch<{ suggestions: string[] }>(`/api/polls/any-code/code-suggestions${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`),

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
