import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

type AssignedContest = {
  contestId?: string;
  contest: {
    id: string;
    phase?: 'upcoming' | 'running' | 'old';
    startTime?: string;
  };
};

export function ParticipantContestEntry() {
  const { data: assigned = [], isLoading } = useQuery({
    queryKey: ['participant-assigned-contests'],
    queryFn: () => api.get('/contests/assigned/mine').then((response) => response.data),
  });

  const phasePriority: Record<'running' | 'upcoming' | 'old', number> = {
    running: 0,
    upcoming: 1,
    old: 2,
  };

  const sortedAssignments = [...(assigned as AssignedContest[])].sort((a, b) => {
    const aPhase = a.contest?.phase ?? 'old';
    const bPhase = b.contest?.phase ?? 'old';
    const aPriority = phasePriority[aPhase];
    const bPriority = phasePriority[bPhase];
    if (aPriority !== bPriority) return aPriority - bPriority;

    const aStart = a.contest?.startTime ? new Date(a.contest.startTime).getTime() : Number.POSITIVE_INFINITY;
    const bStart = b.contest?.startTime ? new Date(b.contest.startTime).getTime() : Number.POSITIVE_INFINITY;
    return aStart - bStart;
  });

  const targetContestId = sortedAssignments.find((item) => item.contest?.id)?.contest.id
    ?? sortedAssignments.find((item) => item.contestId)?.contestId
    ?? null;

  if (!isLoading && targetContestId) {
    return <Navigate to={`/contest/${targetContestId}/problems`} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm">
        {isLoading ? (
          <p className="text-sm text-slate-500">Opening your contest…</p>
        ) : (
          <p className="text-sm text-slate-500">No assigned contest found for this participant account.</p>
        )}
      </div>
    </div>
  );
}
