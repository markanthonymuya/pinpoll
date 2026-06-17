'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  suggestions: string[];
  selected: string;
  onSelect: (code: string) => void;
  topic?: string;
}

export function CodeSuggestions({ suggestions: initial, selected, onSelect, topic }: Props) {
  const [suggestions, setSuggestions] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function regenerate() {
    setLoading(true);
    try {
      const res = await api.getCodeSuggestions(topic);
      setSuggestions(res.suggestions);
      onSelect(res.suggestions[0]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => onSelect(code)}
            aria-pressed={selected === code}
            className={`
              px-4 py-2 rounded-full border-2 font-mono text-sm font-semibold transition-colors
              ${selected === code
                ? 'border-blue-500 bg-blue-500 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'}
            `}
          >
            {code}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={regenerate}
        disabled={loading}
        className="self-start text-sm text-blue-600 hover:underline disabled:opacity-50"
      >
        {loading ? 'Generating…' : '↻ Generate new suggestions'}
      </button>
    </div>
  );
}
