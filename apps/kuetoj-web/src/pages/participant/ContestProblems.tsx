import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '../../components/AppShell';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { ParticipantContestHeader } from '../../components/ParticipantContestHeader';
import { api } from '../../lib/api';
import { getContestPhase } from '../../components/ContestCountdownBar';

function contestProblemLabel(cp: any, index: number): string {
  const raw = typeof cp?.label === 'string' ? cp.label.trim().toUpperCase() : '';
  if (raw.length === 1 && /^[A-Z]$/.test(raw)) return raw;
  return String.fromCharCode(65 + index);
}

export function ContestProblems() {
  const { id } = useParams<{ id: string }>();

  const { data: contest, isLoading } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: mySubmissions = [] } = useQuery({
    queryKey: ['my-contest-submissions', id],
    queryFn: () => api.get(`/contests/${id}/my-submissions`).then((response) => response.data),
    enabled: !!id,
  });

  const { data: standings } = useQuery({
    queryKey: ['contest-standings', id],
    queryFn: () => api.get(`/contests/${id}/standings`).then((response) => response.data),
    enabled: !!id,
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['contest-announcements', id],
    queryFn: () => api.get(`/contests/${id}/announcements`).then((response) => response.data),
    enabled: !!id,
  });

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
      <div className="w-full">
        {id && <ParticipantContestHeader contestId={id} />}
        {id && <ParticipantContestNav contestId={id} />}

        {isLoading && <p className="py-8 text-center text-slate-400">Loading problems…</p>}

        {!isLoading && phase === 'upcoming' && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            Problems are hidden until the contest starts.
          </div>
        )}

        {!isLoading && phase !== 'upcoming' && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-9">
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">Problem</th>
                      <th className="px-4 py-3 text-left">Done</th>
                      <th className="px-4 py-3 text-left">Solved/Attempt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problems.map((cp: any, index: number) => {
                      const label = contestProblemLabel(cp, index);
                      const myProblemSubs = (mySubmissions as any[]).filter((submission) => submission.contestProblemId === cp.id);
                      const accepted = myProblemSubs.some((submission) => {
                        const verdict = `${submission.manualVerdict ?? submission.submissionStatus ?? ''}`.toLowerCase();
                        return verdict === 'accepted';
                      });
                      const hasSubmission = myProblemSubs.length > 0;
                      const doneClass = accepted
                        ? 'bg-green-100 text-green-700'
                        : hasSubmission
                          ? 'bg-red-100 text-red-700'
                          : 'bg-transparent text-slate-500';

                      const rows: any[] = standings?.rows ?? [];
                      let solvedCount = 0;
                      let attemptCount = 0;
                      rows.forEach((row: any) => {
                        const problemStatus = row.problemStatus?.[label];
                        if (!problemStatus) return;
                        if (problemStatus.accepted) solvedCount += 1;
                        attemptCount += (problemStatus.tries ?? 0) + (problemStatus.accepted ? 1 : 0);
                      });

                      return (
                        <tr key={cp.id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-700">{label}</td>
                          <td className="px-4 py-3">
                            <Link to={`/contest/${contestPathId}/problems/${encodeURIComponent(label)}`} className="font-semibold text-indigo-700 hover:underline">
                              {cp.problem?.title}
                            </Link>
                            <div className="text-xs text-slate-500">
                              {cp.problem?.timeLimitMs ?? '—'} ms · {cp.problem?.memoryLimitKb ?? '—'} KB
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${doneClass}`}>
                              {accepted ? 'Solved' : hasSubmission ? 'Tried' : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{solvedCount}/{attemptCount}</td>
                        </tr>
                      );
                    })}
                    {!problems.length && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-400">No problems available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Announcements</h3>
                <div className="space-y-3">
                  {(announcements as any[]).map((announcement: any) => (
                    <div key={announcement.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-800">{announcement.title}</p>
                      <p className="mt-1 text-xs text-slate-600">{announcement.body}</p>
                      <p className="mt-2 text-[11px] text-slate-400">{new Date(announcement.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                  {!(announcements as any[]).length && (
                    <p className="text-xs text-slate-400">No announcements yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
