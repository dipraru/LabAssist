import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ContestCountdownBar, getContestPhase } from './ContestCountdownBar';

type ParticipantContestHeaderProps = {
  contestId: string;
  hideFrozenBadge?: boolean;
};

export function ParticipantContestHeader({ contestId, hideFrozenBadge = false }: ParticipantContestHeaderProps) {
  const { data: contest, isLoading } = useQuery({
    queryKey: ['contest', contestId],
    queryFn: () => api.get(`/contests/${contestId}`).then((response) => response.data),
    enabled: !!contestId,
  });

  const { data: standings } = useQuery({
    queryKey: ['contest-standings', contestId],
    queryFn: () => api.get(`/contests/${contestId}/standings`).then((response) => response.data),
    enabled: !!contestId,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-400">Loading contest…</p>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">Contest unavailable.</p>
      </div>
    );
  }

  const phase = contest.startTime && contest.endTime
    ? getContestPhase(contest.startTime, contest.endTime)
    : 'upcoming';

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">{contest.title}</h1>
      <p className="mt-1 text-sm text-slate-500">{contest.type === 'icpc' ? 'ICPC Style' : 'Score Based'} · Status: {phase}</p>
      {contest.startTime && contest.endTime && (
        <div className="mt-3">
          <ContestCountdownBar startTime={contest.startTime} endTime={contest.endTime} />
        </div>
      )}
      {!hideFrozenBadge && standings?.isFrozen && (
        <span className="mt-3 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">❄ Standings Frozen</span>
      )}
    </div>
  );
}
