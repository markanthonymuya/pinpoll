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
