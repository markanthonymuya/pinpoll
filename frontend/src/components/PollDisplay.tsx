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
  voting?: boolean;
}

export function PollDisplay({ options, onVote, votedOptionId, pollClosed, showTally, onTally, voting }: Props) {
  const [isLargeScreen, setIsLargeScreen] = useState(true);
  const [viewOverride, setViewOverride] = useState<'grid' | 'list' | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsLargeScreen(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const autoGrid = isLargeScreen && options.length <= 12;
  const useGrid = viewOverride === 'grid' ? true : viewOverride === 'list' ? false : autoGrid;
  const total = options.reduce((s, o) => s + o.vote_count, 0);
  const disabled = !!pollClosed || !!voting;

  return (
    <div>
      {/* View toggle */}
      <div className="flex justify-end mb-3 gap-1">
        <button
          type="button"
          onClick={() => setViewOverride('grid')}
          title="Card view"
          className={`p-2 rounded-lg transition-colors ${useGrid ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
        >
          {/* Grid icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="3" width="8" height="8" rx="1.5"/>
            <rect x="13" y="3" width="8" height="8" rx="1.5"/>
            <rect x="3" y="13" width="8" height="8" rx="1.5"/>
            <rect x="13" y="13" width="8" height="8" rx="1.5"/>
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setViewOverride('list')}
          title="List view"
          className={`p-2 rounded-lg transition-colors ${!useGrid ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
        >
          {/* List icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="5" width="18" height="3" rx="1.5"/>
            <rect x="3" y="10.5" width="18" height="3" rx="1.5"/>
            <rect x="3" y="16" width="18" height="3" rx="1.5"/>
          </svg>
        </button>
      </div>

      {useGrid ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {options.map((opt) => (
            <OptionCard
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
      ) : (
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
      )}
    </div>
  );
}
