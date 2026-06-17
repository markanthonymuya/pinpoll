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

export function OptionCard({ option, total, onVote, voted, disabled, showTally, onTally }: Props) {
  const isVoted = voted;
  const canVote = !disabled && !isVoted && !!onVote;

  return (
    <div className={`flex flex-col rounded-xl overflow-hidden border-2 text-left w-full bg-white transition-colors ${isVoted ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
      <button
        type="button"
        onClick={() => canVote && onVote!(option.id)}
        disabled={!canVote}
        aria-label={`Vote for ${option.name}`}
        className={`flex flex-col text-left w-full transition-transform duration-150 ${canVote ? 'cursor-pointer hover:opacity-90 active:scale-[0.98]' : 'cursor-default'}`}
      >
        <OptionImage name={option.name} image_url={option.image_url} icon_key={option.icon_key} size="large" />
        <div className="p-3 flex flex-col gap-2">
          <span className="font-semibold text-sm text-gray-800 truncate">{option.name}</span>
          <VoteBar count={option.vote_count} total={total} />
        </div>
      </button>
      {showTally && onTally && (
        <button
          type="button"
          onClick={() => onTally(option.id)}
          aria-label={`Add tally vote for ${option.name}`}
          className="w-full py-2 bg-green-100 hover:bg-green-200 text-green-800 font-bold text-sm transition-colors"
        >
          +1
        </button>
      )}
    </div>
  );
}
