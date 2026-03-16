import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '../../components/AppShell';
import { api } from '../../lib/api';
import { ContestCountdownBar, getContestPhase } from '../../components/ContestCountdownBar';

type AssignedContest = {
  participantId: string;
  accessFrom: string;
  accessUntil: string;
  contest: {
    id: string;
    title: string;
    type: string;
    startTime: string;
    endTime: string;
  };
};

const PHASE_BADGE: Record<string, string> = {
  running: 'bg-emerald-100 text-emerald-700',
  upcoming: 'bg-blue-100 text-blue-700',
  old: 'bg-slate-100 text-slate-600',
};

export function ParticipantHome() {
  const { data: assigned = [], isLoading } = useQuery({
    queryKey: ['participant-assigned-contests'],
    queryFn: () => api.get('/contests/assigned/mine').then((r) => r.data),
  });

  return (
    <AppShell>
      {!isLoading && (assigned as AssignedContest[]).length > 0 && (
        <Navigate to={`/contest/${(assigned as AssignedContest[])[0].contest.id}`} replace />
      )}
      <div className="space-y-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Contest Access</h1>
          <p className="text-sm text-slate-500 mt-1">
            You are redirected directly to your assigned contest when available.
          </p>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          {isLoading && <p className="text-sm text-slate-500">Loading your assigned contest…</p>}

          {!isLoading && !(assigned as AssignedContest[]).length && (
            <p className="text-sm text-slate-500">No contest is assigned to this participant account yet.</p>
          )}

          <div className="space-y-4">
            {(assigned as AssignedContest[]).map((entry) => {
              const phase = getContestPhase(entry.contest.startTime, entry.contest.endTime);
              return (
                <article key={entry.contest.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{entry.contest.title}</h2>
                      <p className="text-xs text-slate-500 mt-1">
                        {entry.contest.type} · Participant ID: {entry.participantId}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${PHASE_BADGE[phase]}`}>
                      {phase}
                    </span>
                  </div>

                  <div className="mt-3">
                    <ContestCountdownBar startTime={entry.contest.startTime} endTime={entry.contest.endTime} compact />
                  </div>

                  <p className="text-xs text-slate-500 mt-3">
                    Account access: {new Date(entry.accessFrom).toLocaleString()} → {new Date(entry.accessUntil).toLocaleString()}
                  </p>

                  <div className="mt-3 flex gap-2">
                    <Link to={`/contest/${entry.contest.id}`} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">
                      Open Contest
                    </Link>
                    <Link to={`/contest/${entry.contest.id}/standings`} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">
                      Standings
                    </Link>
                    <Link to={`/contest/${entry.contest.id}/clarifications`} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50">
                      Clarifications
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
