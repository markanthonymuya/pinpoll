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
