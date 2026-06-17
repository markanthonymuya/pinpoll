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
  | { type: 'vote_changed'; old_option_id: string; new_option_id: string }
  | { type: 'tally_tap'; option_id: string }
  | { type: 'option_added'; option: PollOption }
  | { type: 'poll_closed' };
