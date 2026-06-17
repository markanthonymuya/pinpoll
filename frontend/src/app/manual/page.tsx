import Link from 'next/link';

const SECTIONS = [
  {
    title: '1. Creating a Poll',
    content: 'Go to /create, enter your topic, choose a memorable link code, set a password (keep it safe — no recovery), pick a deduplication mode, add options, and click Go Live.',
    demo: (
      <div className="bg-gray-100 rounded-lg p-4 font-mono text-sm text-gray-600">
        <p>pinpoll.app/create</p>
        <p className="mt-1">→ Topic: "Best framework?"</p>
        <p>→ Code: bright-J3M7</p>
        <p>→ Options: React, Vue, Svelte</p>
        <p>→ Go Live ✓</p>
      </div>
    ),
  },
  {
    title: '2. Sharing the Link',
    content: 'Share your poll link with the audience. The public link is pinpoll.app/poll/your-code. Keep the manage link private.',
    demo: (
      <div className="bg-blue-50 rounded-lg p-4 text-sm">
        <p className="font-bold text-blue-700 mb-1">Public (share this)</p>
        <p className="font-mono text-blue-600">pinpoll.app/poll/bright-J3M7</p>
        <p className="font-bold text-gray-600 mt-3 mb-1">Manage (keep private)</p>
        <p className="font-mono text-gray-500">pinpoll.app/manage/bright-J3M7</p>
      </div>
    ),
  },
  {
    title: '3. Voting as an Audience Member',
    content: 'Open the poll link on your device. Tap an option card to cast your vote. Vote counts update live for everyone in the room.',
    demo: (
      <div className="grid grid-cols-3 gap-2">
        {['React', 'Vue', 'Svelte'].map((name, i) => (
          <div key={name} className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden text-center">
            <div className={`h-12 ${['bg-blue-400', 'bg-green-400', 'bg-orange-400'][i]} flex items-center justify-center`}>
              <span className="text-white font-bold">{name[0]}</span>
            </div>
            <p className="text-xs font-semibold p-2">{name}</p>
            <div className="px-2 pb-2">
              <div className="h-1.5 bg-gray-100 rounded-full">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${[60, 25, 15][i]}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: '4. Managing & Closing a Poll',
    content: 'Open your manage link and enter your password. You can add new options, tap +1 to manually record votes, and close the poll when done. After closing, choose Keep Public or Permanently Delete.',
    demo: (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-2">
        <div className="flex justify-between items-center">
          <span>React</span>
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">+1</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Vue</span>
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">+1</span>
        </div>
        <button type="button" className="w-full mt-2 py-2 border-2 border-red-300 text-red-500 rounded-lg text-xs font-semibold">
          Close Poll
        </button>
      </div>
    ),
  },
  {
    title: '5. Downloading Results as PDF',
    content: 'Visit pinpoll.app/results/your-code — accessible to anyone while the poll is active or closed. Click "Download PDF" to export the full results including the timestamped vote event log.',
    demo: (
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm">
        <p className="font-bold mb-2">Best framework? — Results</p>
        <div className="space-y-2">
          {[['React', 60], ['Vue', 25], ['Svelte', 15]].map(([name, pct]) => (
            <div key={name} className="flex items-center gap-2">
              <span className="w-14 text-xs">{name}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-gray-500 w-8">{pct}%</span>
            </div>
          ))}
        </div>
        <button type="button" className="mt-4 w-full py-2 bg-blue-500 text-white rounded-lg text-xs font-semibold">
          ↓ Download PDF
        </button>
      </div>
    ),
  },
];

export default function ManualPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-16">
      <Link href="/" className="text-blue-500 hover:underline text-sm mb-8 inline-block">← Back to home</Link>
      <h1 className="text-4xl font-extrabold mb-4">How to use PinPoll</h1>
      <p className="text-gray-500 mb-12">Everything you need to know to run a live poll.</p>

      <div className="flex flex-col gap-16">
        {SECTIONS.map(({ title, content, demo }) => (
          <section key={title}>
            <h2 className="text-2xl font-bold mb-3">{title}</h2>
            <p className="text-gray-600 mb-4">{content}</p>
            {demo}
          </section>
        ))}
      </div>

      <div className="mt-16 text-center">
        <Link href="/create" className="bg-blue-500 hover:bg-blue-600 text-white text-lg font-bold px-8 py-4 rounded-2xl transition-colors">
          Create a Poll →
        </Link>
      </div>
    </main>
  );
}
