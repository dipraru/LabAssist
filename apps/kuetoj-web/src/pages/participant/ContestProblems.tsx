import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '../../components/AppShell';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { api } from '../../lib/api';
import { getContestPhase } from '../../components/ContestCountdownBar';

export function ContestProblems() {
  const { id } = useParams<{ id: string }>();

  const { data: contest, isLoading } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const problems: any[] = contest?.problems ?? contest?.contestProblems ?? [];
  const phase = contest?.startTime && contest?.endTime
    ? getContestPhase(contest.startTime, contest.endTime)
    : 'upcoming';

  return (
    <AppShell>
      <div className="max-w-5xl">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">{contest?.title ?? 'Contest'}</h1>
        <p className="mb-4 text-sm text-slate-500">Contest problems</p>
        {id && <ParticipantContestNav contestId={id} />}

        {isLoading && <p className="py-8 text-center text-slate-400">Loading problems…</p>}

        {!isLoading && phase === 'upcoming' && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            Problems are hidden until the contest starts.
          </div>
        )}

        {!isLoading && phase !== 'upcoming' && (
          <div className="space-y-2">
            {problems.map((cp: any) => (
              <Link
                key={cp.id}
                to={`/contest/${id}/problems/${cp.problem?.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">
                    {cp.label}
                  </span>
                  <p className="font-semibold text-slate-800">{cp.problem?.title}</p>
                </div>
                {contest?.type === 'score_based' && cp.score != null && (
                  <span className="text-sm text-slate-500">{cp.score} pts</span>
                )}
              </Link>
            ))}
            {!problems.length && <p className="py-8 text-center text-slate-400">No problems available.</p>}
          </div>
        )}
      </div>
    </AppShell>
  );
}
