'use client';
import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { usePollVoteCounts } from '@/hooks/usePollVoteCounts';
import type { PollWithOptions } from '@/lib/types';

/* ── Static demo (fallback when no homepage poll is configured) ────────── */
const DEMO_OPTIONS = [
  { id: '1', name: 'Python',     vote_count: 42, display_order: 1, locked: false },
  { id: '2', name: 'JavaScript', vote_count: 31, display_order: 2, locked: false },
  { id: '3', name: 'Rust',       vote_count: 15, display_order: 3, locked: false },
  { id: '4', name: 'Go',         vote_count: 12, display_order: 4, locked: false },
];

function StaticDemo() {
  const total = DEMO_OPTIONS.reduce((s, o) => s + o.vote_count, 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-bold text-gray-800">What is your favorite programming language?</p>
        <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">demo</span>
      </div>
      <div className="flex flex-col gap-2">
        {DEMO_OPTIONS.map((o, i) => {
          const pct = Math.round((o.vote_count / total) * 100);
          return (
            <div key={o.id} className={`rounded-xl p-3 border-2 ${i === 0 ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
              <div className="flex justify-between items-center mb-1.5">
                <span className={`text-sm font-semibold ${i === 0 ? 'text-blue-700' : 'text-gray-700'}`}>{o.name}</span>
                <span className="text-sm text-gray-500">{pct}% · {o.vote_count}</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${i === 0 ? 'bg-blue-400' : 'bg-gray-300'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-gray-400 text-center">Create a poll above to get your own live link.</p>
    </div>
  );
}

/* ── Live poll widget ───────────────────────────────────────────────────── */
function LivePoll({ initialData }: { initialData: PollWithOptions }) {
  const { poll } = initialData;
  const { options, pollClosed, connected, applyVoteChange } = usePollVoteCounts(initialData.options, poll.code);
  const [votedOptionId, setVotedOptionId] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState('');

  const isClosed = poll.status === 'closed' || pollClosed;
  const total = options.reduce((s, o) => s + o.vote_count, 0);

  const castVote = useCallback(async (option_id: string) => {
    if (voting || isClosed || option_id === votedOptionId) return;
    const prevVotedId = votedOptionId;
    setError('');
    setVoting(true);
    if (prevVotedId) applyVoteChange(prevVotedId, option_id);
    try {
      await api.castVote(poll.code, { option_id });
      setVotedOptionId(option_id);
    } catch (err: unknown) {
      if (prevVotedId) applyVoteChange(option_id, prevVotedId);
      setError((err as Error).message ?? 'Could not cast vote');
    } finally {
      setVoting(false);
    }
  }, [poll.code, voting, isClosed, votedOptionId, applyVoteChange]);

  const sorted = [...options].sort((a, b) => b.vote_count - a.vote_count);
  const maxVotes = sorted[0]?.vote_count ?? 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="font-bold text-gray-800 leading-snug">{poll.topic}</p>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${connected && !isClosed ? 'bg-green-400 animate-pulse' : 'bg-gray-300'}`} />
          <span className="text-xs text-gray-400">
            {isClosed ? 'closed' : `${total} vote${total !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Options */}
      <div className="flex flex-col gap-2">
        {sorted.map((option) => {
          const pct = total > 0 ? Math.round((option.vote_count / total) * 100) : 0;
          const isVoted = votedOptionId === option.id;
          const isLeading = option.vote_count > 0 && option.vote_count === maxVotes;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => void castVote(option.id)}
              disabled={isClosed || voting}
              className={`text-left w-full rounded-xl p-3 border-2 transition-all duration-200 ${
                isVoted
                  ? 'border-blue-400 bg-blue-50'
                  : isClosed
                  ? 'border-gray-100 bg-gray-50 cursor-default'
                  : 'border-gray-100 bg-gray-50 hover:border-blue-200 hover:bg-blue-50 cursor-pointer'
              }`}
            >
              <div className="flex justify-between items-center mb-1.5">
                <span className={`text-sm font-semibold ${isVoted ? 'text-blue-700' : 'text-gray-700'}`}>
                  {isVoted && <span className="mr-1">✓</span>}{option.name}
                </span>
                <span className="text-sm text-gray-500">{pct}% · {option.vote_count}</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isVoted ? 'bg-blue-500' : isLeading ? 'bg-gray-400' : 'bg-gray-300'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <p className="mt-3 text-xs text-gray-400 text-center">
        {isClosed
          ? 'This poll is closed. Results are final.'
          : votedOptionId
          ? 'Tap a different option to change your vote.'
          : 'Tap an option to cast your vote — one per person.'}
      </p>
    </div>
  );
}

/* ── Public export ─────────────────────────────────────────────────────── */
export default function HomePollWidget({ initialData }: { initialData: PollWithOptions | null }) {
  if (!initialData) return <StaticDemo />;
  return <LivePoll initialData={initialData} />;
}
