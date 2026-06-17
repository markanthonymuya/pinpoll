'use client';
import { useState } from 'react';

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface DashboardStats {
  active_count: number;
  today_votes: number;
  total_votes: number;
  top_poll: { code: string; topic: string; vote_count: number } | null;
}

interface AdminPoll {
  id: string;
  code: string;
  topic: string;
  status: string;
  deduplication_mode: string;
  created_at: string;
  closed_at: string | null;
  vote_count: number;
}

async function adminFetch<T>(path: string, secret: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    ...options,
    headers: { 'x-admin-secret': secret, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [adminPath, setAdminPath] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [polls, setPolls] = useState<AdminPoll[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function login() {
    if (!secret.trim() || !adminPath.trim()) return;
    setAuthError('');
    setLoading(true);
    try {
      const data = await adminFetch<DashboardStats>(`/${adminPath}/dashboard`, secret);
      setStats(data);
      // Fetch all polls via search
      await loadPolls(secret, adminPath);
      setAuthed(true);
    } catch (err: unknown) {
      setAuthError((err as Error).message === 'HTTP 401' ? 'Invalid credentials.' : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadPolls(s = secret, ap = adminPath) {
    try {
      const data = await adminFetch<{ polls: AdminPoll[] }>(`/${ap}/polls`, s);
      setPolls(data.polls);
    } catch (_) {}
  }

  async function lookupPoll(code: string) {
    if (!code.trim()) return;
    setError('');
    try {
      const data = await adminFetch<{ poll: AdminPoll & { vote_count?: number }; options: { vote_count: number }[] }>(`/${adminPath}/polls/${code.trim()}`, secret);
      const total = data.options.reduce((s, o) => s + o.vote_count, 0);
      const existing = polls.find(p => p.code === data.poll.code);
      if (!existing) {
        setPolls(prev => [{ ...data.poll, vote_count: total }, ...prev]);
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }

  async function handleDelete(code: string) {
    if (deleteConfirm !== code) return;
    setDeleting(true);
    setError('');
    try {
      await adminFetch(`/${adminPath}/polls/${code}`, secret, {
        method: 'DELETE',
        body: JSON.stringify({ confirm_code: code, pdf_downloaded: false }),
      });
      setPolls(prev => prev.filter(p => p.code !== code));
      setDeletingCode(null);
      setDeleteConfirm('');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  async function downloadPdf(code: string) {
    const res = await fetch(`${BACKEND}/${adminPath}/polls/${code}/pdf`, {
      headers: { 'x-admin-secret': secret },
    });
    if (!res.ok) { setError('PDF download failed'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pinpoll-${code}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = polls.filter(p => {
    const matchesSearch = p.code.includes(search) || p.topic.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="bg-white rounded-2xl shadow border border-gray-200 p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-1">Admin</h1>
          <p className="text-sm text-gray-500 mb-6">PinPoll superadmin dashboard</p>
          {authError && <p className="text-red-500 text-sm mb-3">{authError}</p>}
          <div className="flex flex-col gap-3">
            <input
              type="text"
              className="w-full border-2 border-gray-200 rounded-xl p-3 focus:outline-none focus:border-blue-400 font-mono"
              placeholder="Admin path (from Railway env)"
              value={adminPath}
              onChange={(e) => setAdminPath(e.target.value)}
            />
            <input
              type="password"
              className="w-full border-2 border-gray-200 rounded-xl p-3 focus:outline-none focus:border-blue-400"
              placeholder="Admin secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void login(); }}
            />
            <button
              type="button"
              onClick={() => void login()}
              disabled={!secret.trim() || !adminPath.trim() || loading}
              className="w-full py-3 bg-gray-900 disabled:opacity-50 text-white font-bold rounded-xl"
            >
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <button type="button" onClick={() => { setAuthed(false); setPolls([]); setStats(null); }} className="text-sm text-gray-400 hover:text-red-500">
            Sign out
          </button>
        </div>

        {error && <p className="mb-4 text-red-500 text-sm">{error}</p>}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Active polls', value: stats.active_count },
              { label: 'Votes today', value: stats.today_votes },
              { label: 'Total votes', value: stats.total_votes },
              { label: 'Top poll votes', value: stats.top_poll?.vote_count ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-200 p-5">
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        {stats?.top_poll && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 text-sm">
            Top poll: <strong>{stats.top_poll.topic}</strong> — <span className="font-mono">{stats.top_poll.code}</span> ({stats.top_poll.vote_count} votes)
          </div>
        )}

        {/* Poll lookup */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 className="font-bold mb-3">Look up a poll</h2>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 border-2 border-gray-200 rounded-xl p-3 font-mono focus:outline-none focus:border-blue-400"
              placeholder="Poll code e.g. calm-K4T2"
              onKeyDown={(e) => { if (e.key === 'Enter') void lookupPoll((e.target as HTMLInputElement).value); }}
            />
            <button
              type="button"
              onClick={(e) => void lookupPoll(((e.currentTarget.previousElementSibling) as HTMLInputElement).value)}
              className="px-4 py-2 bg-gray-900 text-white rounded-xl font-semibold"
            >
              Fetch
            </button>
          </div>
        </div>

        {/* Polls table */}
        {polls.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex flex-wrap gap-3 p-4 border-b border-gray-100">
              <input
                type="text"
                className="flex-1 min-w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                placeholder="Search by code or topic…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Code</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Topic</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Votes</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Created</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((poll) => (
                    <tr key={poll.code} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-blue-600">
                        <a href={`/${poll.code}`} target="_blank" rel="noreferrer" className="hover:underline">{poll.code}</a>
                      </td>
                      <td className="px-4 py-3 text-gray-800 max-w-xs truncate">{poll.topic}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          poll.status === 'active' ? 'bg-green-100 text-green-700' :
                          poll.status === 'closed' ? 'bg-gray-200 text-gray-600' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{poll.status}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{poll.vote_count}</td>
                      <td className="px-4 py-3 text-gray-400">{new Date(poll.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => downloadPdf(poll.code)}
                            className="px-3 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-semibold"
                          >
                            PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => { setDeletingCode(poll.code); setDeleteConfirm(''); }}
                            className="px-3 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-semibold"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="text-center text-gray-400 py-8 text-sm">No polls match your filter.</p>
              )}
            </div>
          </div>
        )}

        {/* Delete modal */}
        {deletingCode && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
              <h2 className="text-xl font-bold mb-2 text-red-600">Hard delete poll?</h2>
              <p className="text-sm text-gray-500 mb-4">This permanently removes all votes and data from the database. Cannot be undone.</p>
              <p className="text-sm font-medium mb-2">Type <span className="font-mono bg-gray-100 px-1 rounded">{deletingCode}</span> to confirm:</p>
              <input
                type="text"
                className="w-full border-2 border-gray-200 rounded-xl p-3 mb-4 font-mono focus:outline-none focus:border-red-400"
                placeholder={deletingCode}
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                autoFocus
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setDeletingCode(null)} className="flex-1 py-3 bg-gray-100 rounded-xl font-semibold">Cancel</button>
                <button
                  type="button"
                  onClick={() => void handleDelete(deletingCode)}
                  disabled={deleteConfirm !== deletingCode || deleting}
                  className="flex-1 py-3 bg-red-500 disabled:opacity-50 text-white font-bold rounded-xl"
                >
                  {deleting ? 'Deleting…' : 'Delete Forever'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
