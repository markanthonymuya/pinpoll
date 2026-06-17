import Link from 'next/link';
import HomePollWidget from './HomePollWidget';
import type { PollWithOptions } from '@/lib/types';

async function getHomePoll(): Promise<PollWithOptions | null> {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const res = await fetch(`${base}/api/homepage-poll`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<PollWithOptions>;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const homePoll = await getHomePoll();

  return (
    <main>
      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center px-4 py-20 bg-gradient-to-b from-blue-50 to-white">
        <h1 className="text-5xl sm:text-6xl font-extrabold text-center text-gray-900 mb-6 max-w-3xl">
          Run a live poll in{' '}
          <span className="text-blue-500">30 seconds.</span>
        </h1>
        <p className="text-xl text-gray-500 text-center mb-10 max-w-xl">
          No account needed. Share a link. Watch votes arrive in real time.
          Perfect for classrooms and conferences.
        </p>
        <Link
          href="/create"
          className="bg-blue-500 hover:bg-blue-600 text-white text-xl font-bold px-10 py-4 rounded-2xl shadow-lg transition-colors"
        >
          Create a Poll →
        </Link>

        {/* Live poll widget (or static demo fallback) */}
        <div className="mt-16 w-full max-w-lg">
          {homePoll && (
            <p className="text-xs text-center text-gray-400 mb-2 uppercase tracking-wide font-semibold">
              Live poll — vote below
            </p>
          )}
          <HomePollWidget initialData={homePoll} />
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-white">
        <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
        <div className="flex flex-col sm:flex-row justify-center gap-8 max-w-3xl mx-auto">
          {[
            { step: '①', text: 'Type your topic' },
            { step: '②', text: 'Share the link' },
            { step: '③', text: 'Watch votes roll in' },
          ].map(({ step, text }) => (
            <div key={step} className="flex flex-col items-center gap-3 text-center">
              <span className="text-4xl">{step}</span>
              <p className="text-lg font-semibold text-gray-700">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature highlights */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { title: 'No account needed', desc: 'Create and share a poll in seconds with zero sign-up friction.' },
            { title: 'Works on any device', desc: 'Optimised for large projected screens and mobile audiences alike.' },
            { title: 'Live results, always saved', desc: 'Every vote is persisted and publicly downloadable for research.' },
          ].map(({ title, desc }) => (
            <div key={title} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-bold text-lg mb-2">{title}</h3>
              <p className="text-gray-500 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 bg-white border-t border-gray-100 text-center text-sm text-gray-400">
        <Link href="/manual" className="hover:underline text-blue-500">
          How to use PinPoll
        </Link>
        <span className="mx-3">·</span>
        <span>All poll data is public by design — for research and education.</span>
      </footer>
    </main>
  );
}
