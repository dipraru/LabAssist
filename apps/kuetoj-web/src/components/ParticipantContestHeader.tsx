import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock3, Snowflake } from 'lucide-react';
import { api } from '../lib/api';
import { ContestCountdownBar, getContestPhase } from './ContestCountdownBar';
import { AnnouncementModal } from './AnnouncementModal';
import { joinContest, leaveContest } from '../lib/socket';

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

  useEffect(() => {
    if (!contest?.id) return;
    joinContest(contest.id);
    return () => leaveContest(contest.id);
  }, [contest?.id]);

  if (isLoading) {
    return <div className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">Loading contest...</div>;
  }

  if (!contest) {
    return <div className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">Contest unavailable.</div>;
  }

  const phase = contest.startTime && contest.endTime
    ? getContestPhase(contest.startTime, contest.endTime)
    : 'upcoming';

  return (
    <>
      <AnnouncementModal />
      <div className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold text-slate-950">{contest.title}</h1>
            <p className="text-xs font-semibold text-slate-500">
              {contest.type === 'icpc' ? 'ICPC' : 'Score Based'} · {phase}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!hideFrozenBadge && standings?.isFrozen && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">
                <Snowflake size={12} />
                Frozen
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
              <Clock3 size={12} />
              Live clock
            </span>
          </div>
        </div>
        {contest.startTime && contest.endTime && (
          <div className="mt-2">
            <ContestCountdownBar startTime={contest.startTime} endTime={contest.endTime} compact />
          </div>
        )}
      </div>
    </>
  );
}
