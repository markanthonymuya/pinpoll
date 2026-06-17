'use client';
import { useState, useCallback } from 'react';

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/* ── Types ─────────────────────────────────────────────────────────────── */
interface Stats {
  active_count: number;
  today_votes: number;
  total_votes: number;
  top_poll: { code: string; topic: string; vote_count: number } | null;
}
interface PollRow {
  id: string; code: string; topic: string; status: string;
  deduplication_mode: string; created_at: string; closed_at: string | null;
  vote_count: number; online_votes: number; tally_votes: number;
}
interface PollOption {
  id: string; name: string; vote_count: number;
}
interface VoteEvent {
  id: string; source: string; option_name: string; timestamp: string;
}
interface PollDetail {
  poll: PollRow; options: PollOption[]; events: VoteEvent[];
}

/* ── Fetch helper ───────────────────────────────────────────────────────── */
async function adminFetch<T>(path: string, secret: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    ...opts,
    headers: { 'x-admin-secret': secret, 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${res.status}`); }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/* ── Insight generator ─────────────────────────────────────────────────── */
function generateInsights(poll: PollRow, options: PollOption[], events: VoteEvent[]): string[] {
  const total = poll.vote_count;
  if (total === 0) return ['No votes have been cast yet.'];
  const insights: string[] = [];

  const sorted = [...options].sort((a, b) => b.vote_count - a.vote_count);
  const winner = sorted[0];
  const winnerPct = Math.round((winner.vote_count / total) * 100);
  insights.push(`"${winner.name}" is leading with ${winnerPct}% of votes (${winner.vote_count} out of ${total}).`);

  if (sorted.length >= 2 && sorted[1].vote_count > 0) {
    const margin = winner.vote_count - sorted[1].vote_count;
    const secondPct = Math.round((sorted[1].vote_count / total) * 100);
    if (margin === 0) insights.push(`Tied with "${sorted[1].name}" — exact draw.`);
    else if (margin <= 2) insights.push(`Very close race — "${sorted[1].name}" is only ${margin} vote(s) behind.`);
    else if (winnerPct >= 70) insights.push(`Strong consensus: the leading option has a ${winnerPct - secondPct}pt gap over the runner-up.`);
    else insights.push(`Runner-up: "${sorted[1].name}" at ${secondPct}%.`);
  }

  if (poll.online_votes > 0 && poll.tally_votes > 0) {
    const onlinePct = Math.round((poll.online_votes / total) * 100);
    insights.push(`Mixed mode: ${onlinePct}% voted online (${poll.online_votes}), ${100 - onlinePct}% tallied manually (${poll.tally_votes}).`);
  } else if (poll.online_votes > 0) {
    insights.push('All votes were cast online via the public link.');
  } else if (poll.tally_votes > 0) {
    insights.push('All votes were entered manually via raise-hands tally.');
  }

  if (poll.closed_at) {
    const ms = new Date(poll.closed_at).getTime() - new Date(poll.created_at).getTime();
    const mins = Math.round(ms / 60000);
    insights.push(`Poll ran for ${mins < 60 ? `${mins} minute(s)` : `${Math.round(mins / 60)} hour(s)`}.`);
  }

  if (events.length >= 3) {
    const hours = events.map(e => new Date(e.timestamp).getHours());
    const freq: Record<number, number> = {};
    hours.forEach(h => { freq[h] = (freq[h] || 0) + 1; });
    const peakHour = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    const h = parseInt(peakHour[0]);
    const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
    insights.push(`Most votes arrived around ${label}.`);
  }

  const spread = options.filter(o => o.vote_count > 0).length;
  if (spread === 1) insights.push('Only one option received any votes.');
  else if (spread === options.length && options.length > 2) insights.push('Every option received at least one vote.');

  return insights;
}

/* ── Mini bar chart for vote timeline (hourly buckets) ─────────────────── */
function VoteTimeline({ events }: { events: VoteEvent[] }) {
  if (events.length < 2) return null;
  const buckets: Record<string, number> = {};
  events.forEach(e => {
    const d = new Date(e.timestamp);
    const key = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
    buckets[key] = (buckets[key] || 0) + 1;
  });
  const entries = Object.entries(buckets).slice(-16);
  const max = Math.max(...entries.map(([, v]) => v));
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-2">Vote activity</p>
      <div className="flex items-end gap-1 h-16">
        {entries.map(([label, count]) => (
          <div key={label} className="flex-1 flex flex-col items-center gap-0.5" title={`${label}: ${count} vote(s)`}>
            <div
              className="w-full bg-blue-400 rounded-t"
              style={{ height: `${Math.round((count / max) * 52)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{entries[0]?.[0]}</span>
        <span>{entries[entries.length - 1]?.[0]}</span>
      </div>
    </div>
  );
}

/* ── Vote bar ───────────────────────────────────────────────────────────── */
function OptionBar({ option, total, isWinner }: { option: PollOption; total: number; isWinner: boolean }) {
  const pct = total > 0 ? Math.round((option.vote_count / total) * 100) : 0;
  return (
    <div className={`p-3 rounded-xl border-2 ${isWinner ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm font-semibold text-gray-800 truncate flex-1 mr-2">{option.name}</span>
        <span className="text-sm font-bold text-gray-700 shrink-0">{pct}% · {option.vote_count}</span>
        {isWinner && <span className="ml-2 text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full shrink-0">Winner</span>}
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${isWinner ? 'bg-blue-500' : 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ── Poll detail panel ─────────────────────────────────────────────────── */
function PollDetailPanel({
  poll, detail, loading, onClose, onDelete, onPdf, secret, adminPath,
}: {
  poll: PollRow; detail: PollDetail | null; loading: boolean; onClose: () => void;
  onDelete: (code: string) => void; onPdf: (code: string) => void;
  secret: string; adminPath: string;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  const total = detail?.poll.vote_count ?? poll.vote_count;
  const sortedOptions = detail ? [...detail.options].sort((a, b) => b.vote_count - a.vote_count) : [];
  const insights = detail ? generateInsights(detail.poll, detail.options, detail.events) : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-5 border-b border-gray-100">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs text-blue-500 mb-1">{poll.code}</p>
          <h2 className="font-bold text-lg leading-tight text-gray-900">{poll.topic}</h2>
        </div>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">✕</button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
      ) : detail ? (
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
          {/* Meta row */}
          <div className="flex flex-wrap gap-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${poll.status === 'active' ? 'bg-green-100 text-green-700' : poll.status === 'closed' ? 'bg-gray-200 text-gray-600' : 'bg-yellow-100 text-yellow-700'}`}>
              {poll.status.toUpperCase()}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
              {total} vote{total !== 1 ? 's' : ''}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
              {poll.deduplication_mode === 'email_hash' ? 'Verified' : 'Cookie dedup'}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
              Created {new Date(poll.created_at).toLocaleDateString()}
            </span>
          </div>

          {/* Vote source breakdown */}
          {total > 0 && (poll.online_votes > 0 || poll.tally_votes > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{poll.online_votes}</p>
                <p className="text-xs text-blue-500 mt-0.5">Online votes</p>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{poll.tally_votes}</p>
                <p className="text-xs text-green-500 mt-0.5">Manual tally</p>
              </div>
            </div>
          )}

          {/* Options */}
          {sortedOptions.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-gray-500">Results</p>
              {sortedOptions.map((opt, i) => (
                <OptionBar key={opt.id} option={opt} total={total} isWinner={i === 0 && opt.vote_count > 0} />
              ))}
            </div>
          )}

          {/* Insights */}
          {insights.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-700 mb-2">Insights</p>
              <ul className="flex flex-col gap-1.5">
                {insights.map((ins, i) => (
                  <li key={i} className="text-sm text-amber-900 flex gap-2">
                    <span className="text-amber-400 shrink-0">›</span>
                    <span>{ins}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Vote timeline */}
          {detail.events.length >= 2 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <VoteTimeline events={detail.events} />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <a href={`/${poll.code}`} target="_blank" rel="noreferrer"
              className="flex-1 py-2 text-sm text-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors">
              View poll ↗
            </a>
            <button type="button" onClick={() => onPdf(poll.code)}
              className="flex-1 py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-xl transition-colors">
              Download PDF
            </button>
            <button type="button" onClick={() => setShowDelete(true)}
              className="py-2 px-4 text-sm bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl transition-colors">
              Delete
            </button>
          </div>

          {showDelete && (
            <div className="border-2 border-red-200 rounded-xl p-4 bg-red-50">
              <p className="text-sm font-semibold text-red-700 mb-2">Type <span className="font-mono bg-white px-1 rounded">{poll.code}</span> to confirm permanent deletion:</p>
              <input
                type="text"
                className="w-full border border-red-200 rounded-lg p-2 font-mono text-sm mb-3 focus:outline-none focus:border-red-400 bg-white"
                placeholder={poll.code}
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowDelete(false); setDeleteConfirm(''); }} className="flex-1 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold">Cancel</button>
                <button type="button"
                  disabled={deleteConfirm !== poll.code}
                  onClick={() => { onDelete(poll.code); setShowDelete(false); setDeleteConfirm(''); }}
                  className="flex-1 py-2 bg-red-500 disabled:opacity-40 text-white rounded-lg text-sm font-bold">
                  Delete Forever
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ── Main admin page ───────────────────────────────────────────────────── */
export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [adminPath, setAdminPath] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [polls, setPolls] = useState<PollRow[]>([]);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<PollDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');

  const login = useCallback(async () => {
    if (!secret.trim() || !adminPath.trim()) return;
    setAuthError(''); setLoadingLogin(true);
    try {
      const [statsData, pollsData] = await Promise.all([
        adminFetch<Stats>(`/${adminPath}/dashboard`, secret),
        adminFetch<{ polls: PollRow[] }>(`/${adminPath}/polls`, secret),
      ]);
      setStats(statsData);
      setPolls(pollsData.polls);
      setAuthed(true);
    } catch (err: unknown) {
      setAuthError((err as Error).message === 'HTTP 401' ? 'Invalid credentials.' : (err as Error).message);
    } finally { setLoadingLogin(false); }
  }, [secret, adminPath]);

  const selectPoll = useCallback(async (code: string) => {
    setSelectedCode(code); setDetail(null); setLoadingDetail(true);
    try {
      const data = await adminFetch<PollDetail>(`/${adminPath}/polls/${code}`, secret);
      setDetail(data);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally { setLoadingDetail(false); }
  }, [adminPath, secret]);

  const handleDelete = useCallback(async (code: string) => {
    setError('');
    try {
      await adminFetch(`/${adminPath}/polls/${code}`, secret, {
        method: 'DELETE', body: JSON.stringify({ confirm_code: code, pdf_downloaded: false }),
      });
      setPolls(prev => prev.filter(p => p.code !== code));
      if (selectedCode === code) { setSelectedCode(null); setDetail(null); }
    } catch (err: unknown) { setError((err as Error).message); }
  }, [adminPath, secret, selectedCode]);

  const handlePdf = useCallback(async (code: string) => {
    try {
      const res = await fetch(`${BACKEND}/${adminPath}/polls/${code}/pdf`, { headers: { 'x-admin-secret': secret } });
      if (!res.ok) { setError('PDF download failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `pinpoll-${code}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { setError('PDF download failed'); }
  }, [adminPath, secret]);

  const filtered = polls.filter(p =>
    (statusFilter === 'all' || p.status === statusFilter) &&
    (p.code.includes(search) || p.topic.toLowerCase().includes(search.toLowerCase()))
  );

  /* ── Login screen ─────────────────────────────────────────────────────── */
  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="bg-white rounded-2xl shadow border border-gray-200 p-8 w-full max-w-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Admin</h1>
            <p className="text-sm text-gray-400 mt-1">PinPoll superadmin dashboard</p>
          </div>
          {authError && <p className="text-red-500 text-sm mb-3">{authError}</p>}
          <div className="flex flex-col gap-3">
            <input type="text" placeholder="Admin path"
              className="w-full border-2 border-gray-200 rounded-xl p-3 font-mono focus:outline-none focus:border-blue-400"
              value={adminPath} onChange={(e) => setAdminPath(e.target.value)} />
            <input type="password" placeholder="Admin secret"
              className="w-full border-2 border-gray-200 rounded-xl p-3 focus:outline-none focus:border-blue-400"
              value={secret} onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void login(); }} />
            <button type="button" onClick={() => void login()}
              disabled={!secret.trim() || !adminPath.trim() || loadingLogin}
              className="w-full py-3 bg-gray-900 disabled:opacity-50 text-white font-bold rounded-xl">
              {loadingLogin ? 'Signing in…' : 'Sign in →'}
            </button>
          </div>
        </div>
      </main>
    );
  }

  /* ── Dashboard ────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <h1 className="font-bold text-lg">PinPoll Admin</h1>
        <span className="flex-1" />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="button" onClick={() => { setAuthed(false); setPolls([]); setStats(null); setSelectedCode(null); }}
          className="text-sm text-gray-400 hover:text-red-500 transition-colors">Sign out</button>
      </header>

      {/* Stats bar */}
      {stats && (
        <div className="px-6 pt-5 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total polls', value: polls.length, color: 'text-gray-900' },
            { label: 'Active now', value: stats.active_count, color: 'text-green-600' },
            { label: 'Votes today', value: stats.today_votes, color: 'text-blue-600' },
            { label: 'All-time votes', value: stats.total_votes, color: 'text-purple-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {stats?.top_poll && (
        <div className="px-6 pb-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm">
            <span className="text-amber-600 font-semibold">Top poll:</span>{' '}
            <span className="text-gray-800">{stats.top_poll.topic}</span>{' '}
            <span className="font-mono text-amber-700">({stats.top_poll.code})</span>{' '}
            <span className="text-gray-500">— {stats.top_poll.vote_count} votes</span>
          </div>
        </div>
      )}

      {/* Two-panel body */}
      <div className="flex flex-1 min-h-0 px-6 pb-6 gap-4">
        {/* Poll list */}
        <div className={`flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden transition-all ${selectedCode ? 'hidden sm:flex sm:w-2/5' : 'w-full'}`}>
          {/* Search / filter */}
          <div className="p-4 border-b border-gray-100 flex gap-2">
            <input type="text" placeholder="Search polls…"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:border-blue-400">
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {filtered.length === 0 && (
              <p className="text-center text-gray-400 py-12 text-sm">No polls found.</p>
            )}
            {filtered.map(poll => (
              <button key={poll.code} type="button" onClick={() => void selectPoll(poll.code)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedCode === poll.code ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-blue-500">{poll.code}</p>
                    <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">{poll.topic}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {poll.vote_count} vote{poll.vote_count !== 1 ? 's' : ''} · {new Date(poll.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`mt-0.5 px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${poll.status === 'active' ? 'bg-green-100 text-green-700' : poll.status === 'closed' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>
                    {poll.status}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {filtered.length} of {polls.length} polls
          </div>
        </div>

        {/* Detail panel */}
        {selectedCode && (
          <div className="flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {polls.find(p => p.code === selectedCode) && (
              <PollDetailPanel
                poll={polls.find(p => p.code === selectedCode)!}
                detail={detail}
                loading={loadingDetail}
                onClose={() => { setSelectedCode(null); setDetail(null); }}
                onDelete={handleDelete}
                onPdf={handlePdf}
                secret={secret}
                adminPath={adminPath}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
