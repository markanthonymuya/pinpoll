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
            showTally={showTally}
            onTally={onTally}
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
