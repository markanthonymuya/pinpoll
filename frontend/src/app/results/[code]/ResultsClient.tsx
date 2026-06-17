'use client';
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
          &#8595; Download PDF
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
              <span>{evt.source === 'self_vote' ? '\u{1F464}' : '\u{1F3A4}'} {evt.option_name}</span>
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
