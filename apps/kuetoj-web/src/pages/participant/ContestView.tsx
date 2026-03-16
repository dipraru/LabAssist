import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { AnnouncementModal } from '../../components/AnnouncementModal';
import { ContestCountdownBar, getContestPhase } from '../../components/ContestCountdownBar';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';

export function ContestView() {
  const { id } = useParams<{ id: string }>();

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then(r => r.data),
  });

  const phase = contest?.startTime && contest?.endTime
    ? getContestPhase(contest.startTime, contest.endTime)
    : 'upcoming';

  return (
    <AppShell>
      <AnnouncementModal />
      <div className="max-w-5xl">
        {contest ? (
          <>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
              <h1 className="text-3xl font-bold text-slate-900 mb-1">{contest.title}</h1>
              <p className="text-slate-500 text-sm mb-4">{contest.type === 'icpc' ? 'ICPC Style' : 'Score Based'}</p>
              {contest.startTime && contest.endTime && (
                <div className="max-w-3xl">
                  <ContestCountdownBar startTime={contest.startTime} endTime={contest.endTime} />
                  <p className="text-xs mt-2 font-medium text-slate-600">Status: {phase}</p>
                  {contest.isStandingFrozen && (
                    <span className="mt-2 inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">❄ Standings Frozen</span>
                  )}
                </div>
              )}
            </div>

            {id && <ParticipantContestNav contestId={id} />}

            <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
              {phase === 'upcoming' && (
                <p>Problems are hidden before contest start. You can view announcements and clarifications in the meantime.</p>
              )}
              {phase === 'running' && (
                <p>Contest is live. Use the tabs to open problems, submit solutions, and track standings.</p>
              )}
              {phase === 'old' && (
                <p>Contest has ended. You can still view your submissions, standings, and clarifications.</p>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-slate-400">Loading contest…</div>
        )}
      </div>
    </AppShell>
  );
}
