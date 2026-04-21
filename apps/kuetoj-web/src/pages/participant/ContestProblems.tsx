import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../../components/AppShell';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { ParticipantContestHeader } from '../../components/ParticipantContestHeader';
import { api } from '../../lib/api';
import { getContestPhase } from '../../components/ContestCountdownBar';
import { getSocket, joinContest, leaveContest } from '../../lib/socket';
import { isAcceptedVerdict } from '../../lib/verdict';
import { ArrowRight, Bell, CheckCircle2, Clock3, XCircle } from 'lucide-react';

function contestProblemLabel(cp: any, index: number): string {
  const raw = typeof cp?.label === 'string' ? cp.label.trim().toUpperCase() : '';
  if (raw.length === 1 && /^[A-Z]$/.test(raw)) return raw;
  return String.fromCharCode(65 + index);
}

export function ContestProblems() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: contest, isLoading } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: mySubmissions = [] } = useQuery({
    queryKey: ['my-contest-submissions', id],
    queryFn: () => api.get(`/contests/${id}/my-submissions`).then((response) => response.data),
    enabled: !!id,
    refetchInterval: 3000,
  });

  const { data: standings } = useQuery({
    queryKey: ['contest-standings', id],
    queryFn: () => api.get(`/contests/${id}/standings`).then((response) => response.data),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['contest-announcements', id],
    queryFn: () => api.get(`/contests/${id}/announcements`).then((response) => response.data),
    enabled: !!id,
  });

  useEffect(() => {
    if (!contest?.id || !id) return;

    joinContest(contest.id);
    const socket = getSocket();
    const refreshSubmissions = () => {
      qc.invalidateQueries({ queryKey: ['my-contest-submissions', id] });
    };
    const refreshStandings = () => {
      qc.invalidateQueries({ queryKey: ['contest-standings', id] });
    };
    const refreshAnnouncements = () => {
      qc.invalidateQueries({ queryKey: ['contest-announcements', id] });
    };

    const verdictHandler = () => {
      refreshSubmissions();
      refreshStandings();
    };
    socket.on('verdict', verdictHandler);
    socket.on('announcement', refreshAnnouncements);

    return () => {
      socket.off('verdict', verdictHandler);
      socket.off('announcement', refreshAnnouncements);
      leaveContest(contest.id);
    };
  }, [contest?.id, id, qc]);

  const contestPathId = contest?.contestNumber != null
    ? String(contest.contestNumber)
    : id;

  const problems: any[] = [...(contest?.problems ?? contest?.contestProblems ?? [])]
    .sort((a, b) => (a?.orderIndex ?? 0) - (b?.orderIndex ?? 0));
  const phase = contest?.startTime && contest?.endTime
    ? getContestPhase(contest.startTime, contest.endTime)
    : 'upcoming';
  return (
    <AppShell>
      <div className="oj-page">
        {id && <ParticipantContestHeader contestId={id} />}
        {id && <ParticipantContestNav contestId={id} />}

        {isLoading && (
          <div className="oj-panel p-8 text-center text-sm font-semibold text-slate-400">
            Loading problems...
          </div>
        )}

        {!isLoading && phase === 'upcoming' && (
          <div className="oj-panel border-sky-200 bg-sky-50/90 p-6 text-sm font-semibold text-sky-800">
            Problems are hidden until the contest starts.
          </div>
        )}

        {!isLoading && phase !== 'upcoming' && (
          <div className="space-y-4">
            <div className="space-y-3">
                {problems.map((cp: any, index: number) => {
                  const label = contestProblemLabel(cp, index);
                  const myProblemSubs = (mySubmissions as any[]).filter((submission) => submission.contestProblemId === cp.id);
                  const accepted = myProblemSubs.some((submission) => isAcceptedVerdict(submission));
                  const hasSubmission = myProblemSubs.length > 0;
                  const rows: any[] = standings?.rows ?? [];
                  let solvedCount = 0;
                  let attemptCount = 0;
                  rows.forEach((row: any) => {
                    const problemStatus = row.problemStatus?.[label];
                    if (!problemStatus) return;
                    if (problemStatus.accepted) solvedCount += 1;
                    attemptCount += (problemStatus.tries ?? 0) + (problemStatus.accepted ? 1 : 0);
                  });
                  const statusNode = accepted ? (
                    <span className="oj-chip bg-teal-50 text-teal-700"><CheckCircle2 size={13} /> Solved</span>
                  ) : hasSubmission ? (
                    <span className="oj-chip bg-rose-50 text-rose-700"><XCircle size={13} /> Tried</span>
                  ) : (
                    <span className="oj-chip bg-slate-100 text-slate-500"><Clock3 size={13} /> Open</span>
                  );

                  return (
                    <Link
                      key={cp.id}
                      to={`/contests/${contestPathId}/problems/${encodeURIComponent(label)}`}
                      className="group block overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-300"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-4">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-base font-extrabold text-white">
                            {label}
                          </span>
                          <div className="min-w-0">
                            <h2 className="truncate text-base font-extrabold text-slate-950 group-hover:text-teal-700">{cp.problem?.title ?? 'Untitled Problem'}</h2>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {cp.problem?.timeLimitMs ?? '—'} ms · {cp.problem?.memoryLimitKb ?? '—'} KB
                              {contest?.type === 'score_based' && cp.score != null ? ` · ${cp.score} pts` : ''}
                            </p>
                          </div>
                        </div>
                        {statusNode}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-500">
                        <span>Solved/Attempts: {solvedCount}/{attemptCount}</span>
                        <span>My submissions: {myProblemSubs.length}</span>
                        <span className="inline-flex items-center gap-1 text-teal-700">
                          Open <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                        </span>
                      </div>
                    </Link>
                  );
                })}

                {!problems.length && (
                  <div className="oj-panel col-span-full p-10 text-center text-sm font-semibold text-slate-400">
                    No problems available.
                  </div>
                )}
              </div>

            {(announcements as any[]).length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-amber-800">
                  <Bell size={15} />
                  Announcements
                </h3>
                <div className="space-y-2">
                  {(announcements as any[]).slice(0, 5).map((announcement: any) => (
                    <div key={announcement.id} className="rounded-lg bg-white/60 px-3 py-2 text-sm text-amber-900">
                      <span className="font-bold">{announcement.title}</span>
                      {announcement.body ? <span className="text-amber-800">: {announcement.body}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
