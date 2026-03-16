import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { AnnouncementModal } from '../../components/AnnouncementModal';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { ParticipantContestHeader } from '../../components/ParticipantContestHeader';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { getContestPhase } from '../../components/ContestCountdownBar';

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
      <div className="w-full">
        {contest ? (
          <>
            {id && <ParticipantContestHeader contestId={id} />}

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
