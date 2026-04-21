import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { ParticipantContestHeader } from '../../components/ParticipantContestHeader';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { getSocket, joinContest, leaveContest } from '../../lib/socket';
import { getEffectiveVerdict, getVerdictBadgeClass } from '../../lib/verdict';
import { Activity } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';

export function ContestView() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then(r => r.data),
    enabled: !!id,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['contest-visible-submissions', id],
    queryFn: () => api.get(`/contests/${id}/submissions`).then((response) => response.data),
    enabled: !!id,
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (!contest?.id || !id) return;

    joinContest(contest.id);
    const socket = getSocket();
    const refreshSubmissions = () => {
      qc.invalidateQueries({ queryKey: ['contest-visible-submissions', id] });
    };

    socket.on('verdict', refreshSubmissions);

    return () => {
      socket.off('verdict', refreshSubmissions);
      leaveContest(contest.id);
    };
  }, [contest?.id, id, qc]);

  const contestPathId = contest?.contestNumber != null
    ? String(contest.contestNumber)
    : id;

  return (
    <AppShell>
      <div className="oj-page">
        {contest ? (
          <>
            {id && <ParticipantContestHeader contestId={id} />}

            {id && <ParticipantContestNav contestId={id} />}

            <section className="oj-panel mb-5 flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="oj-kicker"><Activity size={14} /> Live Status</p>
                <h1 className="mt-3 text-xl font-extrabold tracking-tight text-slate-950">All Submissions</h1>
                <p className="mt-1 text-sm font-semibold text-slate-500">Everyone can see verdicts. Only your own submission IDs are clickable.</p>
              </div>
            </section>

            <div className="oj-panel overflow-x-auto">
              <table className="oj-table">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left">ID</th>
                    <th className="px-4 py-3 text-left">Who</th>
                    <th className="px-4 py-3 text-left">Problem</th>
                    <th className="px-4 py-3 text-left">When</th>
                    <th className="px-4 py-3 text-left">Lang</th>
                    <th className="px-4 py-3 text-left">Verdict</th>
                    <th className="px-4 py-3 text-left">Time</th>
                    <th className="px-4 py-3 text-left">Memory</th>
                  </tr>
                </thead>
                <tbody>
                  {(submissions as any[]).map((submission: any) => {
                    const verdict = getEffectiveVerdict(submission);
                    const isOwnSubmission = submission.isOwnSubmission || submission.participantId === user?.id;
                    return (
                    <tr key={submission.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono text-xs">
                        {isOwnSubmission ? (
                          <Link
                            to={`/contests/${contestPathId}/submissions/${submission.id}`}
                            className="font-bold text-teal-700 hover:underline"
                          >
                            #{submission.submissionDisplayId}
                          </Link>
                        ) : (
                          <span className="font-semibold text-slate-500">#{submission.submissionDisplayId}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{submission.participantName ?? submission.participantId ?? '—'}</td>
                      <td className="px-4 py-3">{submission.contestProblem?.label ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(submission.submittedAt).toLocaleString()}</td>
                      <td className="px-4 py-3">{submission.language ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getVerdictBadgeClass(verdict)}`}>
                          {verdict}
                        </span>
                      </td>
                      <td className="px-4 py-3">{submission.executionTimeMs != null ? `${submission.executionTimeMs} ms` : '—'}</td>
                      <td className="px-4 py-3">{submission.memoryUsedKb != null ? `${submission.memoryUsedKb} KB` : '—'}</td>
                    </tr>
                  )})}
                  {!(submissions as any[]).length && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-400">No status rows yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="oj-panel p-10 text-center text-sm font-semibold text-slate-400">Loading contest...</div>
        )}
      </div>
    </AppShell>
  );
}
