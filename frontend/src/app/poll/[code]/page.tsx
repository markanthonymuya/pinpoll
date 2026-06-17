import { redirect } from 'next/navigation';

export default function PollRedirect({ params }: { params: { code: string } }) {
  redirect(`/${params.code}`);
}
