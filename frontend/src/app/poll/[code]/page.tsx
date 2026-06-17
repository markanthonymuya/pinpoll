import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import PollClient from './PollClient';

export default async function PollPage({ params }: { params: { code: string } }) {
  const data = await api.getPoll(params.code).catch(() => null);
  if (!data) notFound();
  return <PollClient initialData={data} code={params.code} />;
}
