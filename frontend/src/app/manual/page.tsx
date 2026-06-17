import Link from 'next/link';

const NAV = [
  { href: '#creating', label: '1. Creating a Poll' },
  { href: '#sharing', label: '2. Sharing the Link' },
  { href: '#voting', label: '3. Voting' },
  { href: '#managing', label: '4. Managing & Closing' },
  { href: '#results', label: '5. Results & PDF' },
  { href: '#privacy', label: '6. Privacy & Transparency' },
];

export default function ManualPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-16 lg:flex lg:gap-12">
      {/* Sidebar nav */}
      <aside className="hidden lg:block w-52 shrink-0">
        <div className="sticky top-8">
          <Link href="/" className="text-blue-500 hover:underline text-sm mb-6 inline-block">← Home</Link>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contents</p>
          <nav className="flex flex-col gap-1">
            {NAV.map(({ href, label }) => (
              <a key={href} href={href} className="text-sm text-gray-600 hover:text-blue-600 hover:underline py-1 transition-colors">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="lg:hidden mb-8">
        <Link href="/" className="text-blue-500 hover:underline text-sm mb-4 inline-block">← Home</Link>
        <div className="flex flex-wrap gap-2">
          {NAV.map(({ href, label }) => (
            <a key={href} href={href} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full text-gray-700 transition-colors">
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 min-w-0">
        <h1 className="text-4xl font-extrabold mb-3">How to use PinPoll</h1>
        <p className="text-gray-500 mb-14">Everything you need to know to run a live poll. No account required.</p>

        <div className="flex flex-col gap-16">

          <section id="creating">
            <h2 className="text-2xl font-bold mb-3">1. Creating a Poll</h2>
            <p className="text-gray-600 mb-4">
              Go to <Link href="/create" className="text-blue-500 hover:underline">/create</Link>. Enter your topic, pick a memorable link code, set a password (keep it safe — there is no recovery mechanism), choose a deduplication mode, add your options, and click <strong>Go Live</strong>.
            </p>
            <div className="bg-gray-100 rounded-xl p-5 font-mono text-sm text-gray-600 space-y-1">
              <p className="font-bold text-gray-800">pinpoll.app/create</p>
              <p>→ Topic: &quot;Best framework?&quot;</p>
              <p>→ Code: bright-J3M7</p>
              <p>→ Password: (keep this secret)</p>
              <p>→ Options: React, Vue, Svelte</p>
              <p>→ Go Live ✓</p>
            </div>
          </section>

          <section id="sharing">
            <h2 className="text-2xl font-bold mb-3">2. Sharing the Link</h2>
            <p className="text-gray-600 mb-4">
              Share your <strong>public poll link</strong> with the audience — they can vote from any device with a browser, no app or account needed. Keep the <strong>manage link</strong> private; it is the only way to control your poll.
            </p>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-sm space-y-3">
              <div>
                <p className="font-bold text-blue-700 mb-1">Public link — share this freely</p>
                <p className="font-mono text-blue-600">pinpoll.app/poll/bright-J3M7</p>
              </div>
              <div>
                <p className="font-bold text-gray-600 mb-1">Manage link — keep private</p>
                <p className="font-mono text-gray-500">pinpoll.app/manage/bright-J3M7</p>
              </div>
            </div>
          </section>

          <section id="voting">
            <h2 className="text-2xl font-bold mb-3">3. Voting as an Audience Member</h2>
            <p className="text-gray-600 mb-4">
              Open the poll link on any device. Tap an option card to cast your vote. Vote counts update live for everyone watching — no refresh needed. If the poll uses <em>Verified</em> mode, you will be asked for your email address (it is never stored — only an anonymous fingerprint is kept).
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(['React', 'Vue', 'Svelte'] as const).map((name, i) => (
                <div key={name} className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden text-center shadow-sm">
                  <div className={`h-12 flex items-center justify-center ${['bg-blue-400', 'bg-green-400', 'bg-orange-400'][i]}`}>
                    <span className="text-white font-bold text-lg">{name[0]}</span>
                  </div>
                  <p className="text-xs font-semibold px-2 py-1.5">{name}</p>
                  <div className="px-2 pb-2">
                    <div className="h-1.5 bg-gray-100 rounded-full">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${[60, 25, 15][i]}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{[60, 25, 15][i]}%</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="managing">
            <h2 className="text-2xl font-bold mb-3">4. Managing &amp; Closing a Poll</h2>
            <p className="text-gray-600 mb-4">
              Open your manage link and enter your password. From the manage panel you can add new options, tap <strong>+1</strong> to manually tally a show-of-hands vote, and close the poll when you are done. After closing, choose <strong>Keep Public</strong> (results remain accessible) or <strong>Permanently Delete</strong> (all data wiped — you must type the poll code to confirm).
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm space-y-3">
              {['React', 'Vue', 'Svelte'].map((name) => (
                <div key={name} className="flex justify-between items-center">
                  <span className="font-medium">{name}</span>
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">+1</span>
                </div>
              ))}
              <button type="button" className="w-full mt-1 py-2 border-2 border-red-300 text-red-500 rounded-lg text-xs font-semibold pointer-events-none">
                Close Poll
              </button>
            </div>
          </section>

          <section id="results">
            <h2 className="text-2xl font-bold mb-3">5. Results &amp; PDF Export</h2>
            <p className="text-gray-600 mb-4">
              The results page at <code className="bg-gray-100 px-1 rounded text-sm">pinpoll.app/results/your-code</code> is publicly accessible to anyone. It shows live vote counts with percentages and a timestamped event log of every vote. Click <strong>Download PDF</strong> to export the full dataset for research or record-keeping.
            </p>
            <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm shadow-sm">
              <p className="font-bold mb-3 text-gray-800">Best framework? — Results</p>
              {[['React', 60], ['Vue', 25], ['Svelte', 15]].map(([name, pct]) => (
                <div key={name} className="flex items-center gap-3 mb-2">
                  <span className="w-14 text-xs text-gray-700">{name}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                </div>
              ))}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <span className="inline-block px-4 py-2 bg-blue-500 text-white text-xs font-semibold rounded-lg pointer-events-none">↓ Download PDF</span>
              </div>
            </div>
          </section>

          <section id="privacy">
            <h2 className="text-2xl font-bold mb-3">6. Privacy &amp; Data Transparency</h2>
            <p className="text-gray-600 mb-4">
              PinPoll is designed for open, transparent polling. By creating a poll you agree that:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
              <li><strong>All votes are publicly accessible</strong> — anyone with the results link can see every vote, including the timestamp and which option was chosen.</li>
              <li><strong>Vote data is downloadable</strong> — the full timestamped event log is available as a PDF to anyone. This is intentional: PinPoll is built for research and educational use.</li>
              <li><strong>Deduplication fingerprints are one-way</strong> — in cookie mode a browser fingerprint is stored; in email_hash mode a SHA-256 hash of the email is stored. Neither can be reversed to identify individuals, and raw email addresses are never stored.</li>
              <li><strong>No account data is collected</strong> — PinPoll does not require registration. The only persistent identity is the deduplication fingerprint described above.</li>
            </ul>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <strong>Research use notice:</strong> Data exported from PinPoll is intended for research and educational purposes. Do not use PinPoll to collect sensitive personal information.
            </div>
          </section>

        </div>

        <div className="mt-16 text-center">
          <Link href="/create" className="bg-blue-500 hover:bg-blue-600 text-white text-lg font-bold px-8 py-4 rounded-2xl transition-colors inline-block">
            Create a Poll →
          </Link>
        </div>
      </main>
    </div>
  );
}
