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
  const { options, pollClosed, connected, applyVoteChange } = usePollVoteCounts(initialData.options, code);
  const [votedOptionId, setVotedOptionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [emailPromptId, setEmailPromptId] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [submittingEmail, setSubmittingEmail] = useState(false);
  const [voting, setVoting] = useState(false);

  const isClosed = poll.status === 'closed' || pollClosed;
  const isVerified = poll.deduplication_mode === 'email_hash';

  const castVote = useCallback(async (option_id: string, email?: string) => {
    if (voting) return;
    if (option_id === votedOptionId) return;
    const prevVotedId = votedOptionId;
    setError('');
    setVoting(true);
    // Optimistic: immediately adjust counts so the voter sees instant feedback
    if (prevVotedId) applyVoteChange(prevVotedId, option_id);
    try {
      await api.castVote(code, { option_id, email });
      setVotedOptionId(option_id);
      setEmailPromptId(null);
    } catch (err: unknown) {
      // Revert optimistic change on failure
      if (prevVotedId) applyVoteChange(option_id, prevVotedId);
      const e = err as Error & { status?: number };
      setError(e.message ?? 'An error occurred. Please try again.');
    } finally {
      setVoting(false);
    }
  }, [code, voting, votedOptionId, applyVoteChange]);

  const handleVote = useCallback((option_id: string) => {
    // Allow changing vote to a different option
    if (option_id === votedOptionId) return;
    if (isVerified) {
      setEmailPromptId(option_id);
    } else {
      void castVote(option_id);
    }
  }, [isVerified, castVote, votedOptionId]);

  async function submitEmail() {
    if (!emailInput.trim() || !emailPromptId) return;
    setSubmittingEmail(true);
    await castVote(emailPromptId, emailInput.trim());
    setSubmittingEmail(false);
    setEmailInput('');
  }

  const votedOptionName = votedOptionId
    ? options.find((o) => o.id === votedOptionId)?.name
    : null;

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold flex-1">{poll.topic}</h1>
        {isVerified && (
          <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full border border-green-300">
            &#10003; Verified Poll
          </span>
        )}
        <span
          className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-yellow-400'}`}
          title={connected ? 'Live' : 'Reconnecting…'}
        />
      </div>

      {isClosed && (
        <div className="mb-6 bg-gray-100 border border-gray-300 rounded-xl p-4 text-center text-gray-500 font-semibold">
          This poll is closed. Results are final.
        </div>
      )}

      {error && <p className="mb-4 text-red-500 text-sm">{error}</p>}

      {votedOptionName && !error && (
        <p className="mb-4 text-green-600 text-sm font-medium">
          You voted for <strong>{votedOptionName}</strong>.{' '}
          {!isClosed && <span className="text-gray-400">Tap a different option to change your vote.</span>}
        </p>
      )}

      {/* Email modal for verified polls */}
      {emailPromptId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
            <h2 className="text-xl font-bold mb-2">{votedOptionId ? 'Change your vote' : 'Verified vote'}</h2>
            <p className="text-sm text-gray-500 mb-4">
              Your email address is never stored. An anonymous fingerprint is used solely to prevent duplicate votes.
            </p>
            <input
              type="email"
              className="w-full border-2 border-gray-200 rounded-xl p-3 mb-4 focus:outline-none focus:border-blue-400"
              placeholder="your@email.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitEmail(); } }}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEmailPromptId(null)}
                className="flex-1 py-3 bg-gray-100 rounded-xl font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitEmail()}
                disabled={!emailInput.trim() || submittingEmail}
                className="flex-1 py-3 bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl"
              >
                {submittingEmail ? 'Submitting…' : votedOptionId ? 'Change Vote' : 'Submit Vote'}
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
        voting={voting}
      />

      <p className="mt-8 text-xs text-gray-400 text-center">
        All responses and timestamps in this poll are publicly accessible and downloadable for research and educational purposes.
      </p>
    </main>
  );
}
