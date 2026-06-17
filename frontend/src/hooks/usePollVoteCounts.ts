'use client';
import { useReducer, useCallback } from 'react';
import type { PollOption, WsEvent } from '@/lib/types';
import { useWebSocket } from './useWebSocket';

type State = { options: PollOption[]; pollClosed: boolean };
type Action =
  | { type: 'vote'; option_id: string }
  | { type: 'vote_change'; old_option_id: string; new_option_id: string }
  | { type: 'option_added'; option: PollOption }
  | { type: 'poll_closed' }
  | { type: 'resync'; options: PollOption[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'vote':
      return {
        ...state,
        options: state.options.map((o) =>
          o.id === action.option_id ? { ...o, vote_count: o.vote_count + 1 } : o
        ),
      };
    case 'vote_change':
      return {
        ...state,
        options: state.options.map((o) => {
          if (o.id === action.old_option_id) return { ...o, vote_count: Math.max(0, o.vote_count - 1) };
          if (o.id === action.new_option_id) return { ...o, vote_count: o.vote_count + 1 };
          return o;
        }),
      };
    case 'option_added':
      return { ...state, options: [...state.options, action.option] };
    case 'poll_closed':
      return { ...state, pollClosed: true };
    case 'resync':
      return { ...state, options: action.options };
    default:
      return state;
  }
}

export function usePollVoteCounts(initialOptions: PollOption[], code: string) {
  const [state, dispatch] = useReducer(reducer, {
    options: initialOptions,
    pollClosed: false,
  });

  const applyVoteChange = useCallback((old_option_id: string, new_option_id: string) => {
    dispatch({ type: 'vote_change', old_option_id, new_option_id });
  }, []);

  const handleEvent = useCallback(
    (e: WsEvent) => {
      if (e.type === 'vote_cast' || e.type === 'tally_tap') {
        dispatch({ type: 'vote', option_id: e.option_id });
      } else if (e.type === 'vote_changed') {
        dispatch({ type: 'vote_change', old_option_id: e.old_option_id, new_option_id: e.new_option_id });
      } else if (e.type === 'option_added') {
        dispatch({ type: 'option_added', option: e.option });
      } else if (e.type === 'poll_closed') {
        dispatch({ type: 'poll_closed' });
      }
    },
    []
  );

  const { connected } = useWebSocket(code, handleEvent);

  return { options: state.options, pollClosed: state.pollClosed, connected, applyVoteChange };
}
