import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../../components/AppShell';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { ParticipantContestHeader } from '../../components/ParticipantContestHeader';
import { Modal } from '../../components/Modal';
import { CodePreview } from '../../components/CodePreview';
import { api } from '../../lib/api';
import { getSocket, joinContest, leaveContest } from '../../lib/socket';
import { getEffectiveVerdict, getVerdictBadgeClass } from '../../lib/verdict';
import { ListChecks } from 'lucide-react';

export function ContestSubmissions() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['my-contest-submissions', id],
    queryFn: () => api.get(`/contests/${id}/my-submissions`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: 3000,
  });

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then((response) => response.data),
    enabled: !!id,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!contest?.id || !id) return;

    joinContest(contest.id);
    const socket = getSocket();
    const refreshSubmissions = () => {
      qc.invalidateQueries({ queryKey: ['my-contest-submissions', id] });
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

  const selected = useMemo(
    () => (submissions as any[]).find((submission) => submission.id === selectedSubmissionId) ?? null,
    [submissions, selectedSubmissionId],
  );

  return (
    <AppShell>
      <div className="oj-page">
        {id && <ParticipantContestHeader contestId={id} />}
        {id && <ParticipantContestNav contestId={id} />}

        <section className="oj-panel mb-5 flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="oj-kicker"><ListChecks size={14} /> Submission Ledger</p>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">My Submissions</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">All submissions in this contest, newest first.</p>
          </div>
          <div className="rounded-2xl bg-slate-950 px-4 py-3 text-center text-white">
            <p className="text-2xl font-extrabold">{(submissions as any[]).length}</p>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-300">Total</p>
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
              {isLoading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading submissions...</td></tr>
              )}

              {!isLoading && !(submissions as any[]).length && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No submissions yet.</td></tr>
              )}

              {(submissions as any[]).map((submission: any) => {
                const verdict = getEffectiveVerdict(submission);
                return (
                <tr key={submission.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs">
                    <button
                      type="button"
                      className="font-bold text-teal-700 hover:underline"
                      onClick={() => setSelectedSubmissionId(submission.id)}
                    >
                      {submission.submissionDisplayId}
                    </button>
                  </td>
                  <td className="px-4 py-3">{submission.participantName ?? submission.participantId ?? '—'}</td>
                  <td className="px-4 py-3">{submission.contestProblem?.label ?? '—'}. {submission.contestProblem?.problem?.title ?? 'Untitled Problem'}</td>
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
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!selected}
        title={selected ? `Submission #${selected.submissionDisplayId}` : 'Submission'}
        onClose={() => setSelectedSubmissionId(null)}
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <p><span className="font-semibold">Problem:</span> {selected.contestProblem?.label ?? '—'}. {selected.contestProblem?.problem?.title ?? 'Untitled Problem'}</p>
            <p><span className="font-semibold">Language:</span> {selected.language ?? '—'}</p>
            <p>
              <span className="font-semibold">Status:</span>{' '}
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold align-middle ${getVerdictBadgeClass(getEffectiveVerdict(selected))}`}>
                {getEffectiveVerdict(selected)}
              </span>
            </p>
            <p><span className="font-semibold">Submitted:</span> {new Date(selected.submittedAt).toLocaleString()}</p>
            {selected.score != null && <p><span className="font-semibold">Score:</span> {selected.score}</p>}
            {selected.code ? (
              <div>
                <p className="mb-1 font-semibold">Code</p>
                <CodePreview
                  code={selected.code}
                  language={selected.language}
                  height="360px"
                  name={`participant-submission-${selected.id}`}
                />
              </div>
            ) : (
              <p className="text-slate-500">No inline code. File upload submission.</p>
            )}
            <div>
              <Link to={`/contests/${contestPathId}/submissions/${selected.id}`} className="text-indigo-600 hover:underline">
                Open in separate page
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
