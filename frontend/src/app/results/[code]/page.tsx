import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import ResultsClient from './ResultsClient';

export default async function ResultsPage({ params }: { params: { code: string } }) {
  const data = await api.getPoll(params.code).catch(() => null);
  if (!data) notFound();

  // Fetch vote events for the log
  const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const eventsRes = await fetch(`${BASE}/api/polls/${params.code}/events`, { cache: 'no-store' }).catch(() => null);
  const events = eventsRes?.ok ? await eventsRes.json() : { events: [] };

  return <ResultsClient initialData={data} code={params.code} initialEvents={events.events ?? []} />;
}
