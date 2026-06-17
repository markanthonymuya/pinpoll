'use client';
import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { PollDisplay } from '@/components/PollDisplay';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { Poll, PollOption, WsEvent } from '@/lib/types';

export default function ManagePage({ params }: { params: { code: string } }) {
  const { code } = params;
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [poll, setPoll] = useState<Poll | null>(null);
  const [initialOptions, setInitialOptions] = useState<PollOption[]>([]); // kept to seed options on auth
  const [addName, setAddName] = useState('');
  const [addingOption, setAddingOption] = useState(false);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteCodeEntry, setDeleteCodeEntry] = useState('');
  const [error, setError] = useState('');
  const [postCloseAction, setPostCloseAction] = useState<'keep' | 'delete' | null>(null);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [wsClosed, setWsClosed] = useState(false);
  const [mode, setMode] = useState<'tally' | 'online' | null>(null);

  const isClosed = poll?.status === 'closed' || wsClosed;

  const handleWsEvent = useCallback((e: WsEvent) => {
    if (e.type === 'vote_cast') {
      setOptions(prev => prev.map(o => o.id === e.option_id ? { ...o, vote_count: o.vote_count + 1 } : o));
    } else if (e.type === 'option_added') {
      setOptions(prev => [...prev, e.option]);
    } else if (e.type === 'poll_closed') {
      setWsClosed(true);
    }
    // tally_tap intentionally omitted — handled optimistically in handleTally
  }, []);

  useWebSocket(code, handleWsEvent);

  async function authenticate() {
    setAuthError('');
    try {
      await api.authManage(code, password);
      const data = await api.getPoll(code);
      setPoll(data.poll);
      setInitialOptions(data.options);
      setOptions(data.options);
      setAuthed(true);
    } catch (err: unknown) {
      setAuthError((err as Error).message);
    }
  }

  const handleTally = useCallback(async (option_id: string) => {
    // Optimistic: show +1 immediately without waiting for WS round-trip
    setOptions(prev => prev.map(o => o.id === option_id ? { ...o, vote_count: o.vote_count + 1 } : o));
    setError('');
    try {
      await api.tallyTap(code, { option_id, password });
    } catch (err: unknown) {
      // Revert optimistic increment on failure
      setOptions(prev => prev.map(o => o.id === option_id ? { ...o, vote_count: o.vote_count - 1 } : o));
      setError((err as Error).message);
    }
  }, [code, password]);

  async function handleAddOption() {
    if (!addName.trim()) return;
    setAddingOption(true);
    setError('');
    try {
      const { url } = await api.searchUnsplash(addName).catch(() => ({ url: null }));
      const { option } = await api.addOption(code, { name: addName.trim(), password, image_url: url ?? undefined });
      setOptions(prev => [...prev, option]);
      setAddName('');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setAddingOption(false);
    }
  }

  async function handleClose() {
    setClosing(true);
    setError('');
    try {
      const { poll: updated } = await api.closePoll(code, password);
      setPoll(updated);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setClosing(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await api.deletePoll(code, password);
      window.location.href = '/';
    } catch (err: unknown) {
      setError((err as Error).message);
      setDeleting(false);
    }
  }

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow border border-gray-200 p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-6">Manage Poll</h1>
          <p className="text-sm text-gray-500 mb-4">Enter your poll password to continue.</p>
          {authError && <p className="text-red-500 text-sm mb-3">{authError}</p>}
          <input
            type="password"
            className="w-full border-2 border-gray-200 rounded-xl p-3 mb-4 focus:outline-none focus:border-blue-400"
            placeholder="Your poll password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') authenticate(); }}
            autoFocus
          />
          <button
            type="button"
            onClick={authenticate}
            disabled={!password}
            className="w-full py-3 bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl"
          >
            Access Panel →
          </button>
        </div>
      </main>
    );
  }

  if (!mode) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow border border-gray-200 p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-2">{poll?.topic}</h1>
          <p className="text-gray-500 text-sm mb-6">How will votes be collected for this poll?</p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setMode('tally')}
              className="text-left p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 transition-colors"
            >
              <p className="font-bold">Raise hands / Discussion</p>
              <p className="text-sm text-gray-500 mt-1">You tap +1 on each option as the audience raises hands or speaks.</p>
            </button>
            <button
              type="button"
              onClick={() => setMode('online')}
              className="text-left p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 transition-colors"
            >
              <p className="font-bold">Online voting</p>
              <p className="text-sm text-gray-500 mt-1">Audience votes via the public link on their own devices. You monitor results here.</p>
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center gap-4 mb-8">
        <h1 className="text-2xl font-bold flex-1">{poll?.topic}</h1>
        <span className={`px-3 py-1 text-xs font-bold rounded-full ${isClosed ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
          {isClosed ? 'CLOSED' : 'ACTIVE'}
        </span>
        <button type="button" onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-blue-500 underline">
          {mode === 'tally' ? 'Raise hands mode' : 'Online mode'} · switch
        </button>
      </div>

      {error && <p className="mb-4 text-red-500 text-sm">{error}</p>}

      {/* After close: kept confirmation */}
      {isClosed && postCloseAction === 'keep' && (
        <div className="mb-8 bg-green-50 border border-green-200 rounded-2xl p-6">
          <p className="font-semibold text-green-800">Poll kept public. Results remain accessible at the public URL.</p>
        </div>
      )}

      {/* After close: show keep/delete options */}
      {isClosed && !postCloseAction && (
        <div className="mb-8 bg-white border-2 border-gray-200 rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4">What would you like to do with this poll?</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={() => setPostCloseAction('keep')} className="flex-1 py-4 border-2 border-green-500 text-green-700 font-semibold rounded-xl hover:bg-green-50 transition-colors">
              Keep Public<br /><span className="text-xs font-normal text-gray-400">Results remain accessible at the public URL</span>
            </button>
            <button type="button" onClick={() => setDeleteConfirm(true)} className="flex-1 py-4 border-2 border-red-400 text-red-600 font-semibold rounded-xl hover:bg-red-50 transition-colors">
              Permanently Delete<br /><span className="text-xs font-normal text-gray-400">All data wiped. Cannot be undone.</span>
            </button>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
            <h2 className="text-xl font-bold mb-2 text-red-600">Permanently delete this poll?</h2>
            <p className="text-sm text-gray-500 mb-4">All votes and data will be wiped. This cannot be undone.</p>
            <p className="text-sm font-medium mb-2">Type <span className="font-mono bg-gray-100 px-1 rounded">{code}</span> to confirm:</p>
            <input
              type="text"
              className="w-full border-2 border-gray-200 rounded-xl p-3 mb-4 focus:outline-none focus:border-red-400 font-mono"
              placeholder={code}
              value={deleteCodeEntry}
              onChange={(e) => setDeleteCodeEntry(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => { setDeleteConfirm(false); setDeleteCodeEntry(''); }} className="flex-1 py-3 bg-gray-100 rounded-xl font-semibold">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleting || deleteCodeEntry !== code} className="flex-1 py-3 bg-red-500 disabled:opacity-50 text-white font-bold rounded-xl">
                {deleting ? 'Deleting…' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live tally + options */}
      <PollDisplay
        options={options}
        pollClosed={isClosed}
        showTally={mode === 'tally' && !isClosed}
        onTally={handleTally}
      />

      {/* Add option */}
      {!isClosed && (
        <div className="mt-8 bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-bold mb-3">Add a new option</h2>
          <div className="flex gap-2">
            <input
              className="flex-1 border-2 border-gray-200 rounded-xl p-3 focus:outline-none focus:border-blue-400"
              placeholder="Option name"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption(); }}
            />
            <button type="button" onClick={handleAddOption} disabled={!addName.trim() || addingOption} className="px-4 py-2 bg-blue-500 disabled:opacity-50 text-white rounded-xl font-semibold">
              {addingOption ? '…' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Close poll */}
      {!isClosed && (
        <div className="mt-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={closing}
            className="w-full py-4 border-2 border-red-300 text-red-600 hover:bg-red-50 font-semibold rounded-xl transition-colors"
          >
            {closing ? 'Closing…' : 'Close Poll'}
          </button>
        </div>
      )}
    </main>
  );
}
