import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '../../components/AppShell';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { ParticipantContestHeader } from '../../components/ParticipantContestHeader';
import { Modal } from '../../components/Modal';
import { api } from '../../lib/api';

const VERDICT_COLOR: Record<string, string> = {
  accepted: 'text-green-600',
  wrong_answer: 'text-red-600',
  pending: 'text-amber-600',
  manual_review: 'text-blue-600',
};

export function ContestSubmissions() {
  const { id } = useParams<{ id: string }>();
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['my-contest-submissions', id],
    queryFn: () => api.get(`/contests/${id}/my-submissions`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then((response) => response.data),
    enabled: !!id,
    staleTime: 60_000,
  });

  const contestPathId = contest?.contestNumber != null
    ? String(contest.contestNumber)
    : id;

  const selected = useMemo(
    () => (submissions as any[]).find((submission) => submission.id === selectedSubmissionId) ?? null,
    [submissions, selectedSubmissionId],
  );

  return (
    <AppShell>
      <div className="w-full">
        {id && <ParticipantContestHeader contestId={id} />}
        {id && <ParticipantContestNav contestId={id} />}
        <h1 className="mb-1 text-2xl font-bold text-slate-900">My Submissions</h1>
        <p className="mb-4 text-sm text-slate-500">All submissions in this contest</p>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Who</th>
                <th className="px-4 py-3 text-left">Problem</th>
                <th className="px-4 py-3 text-left">When</th>
                <th className="px-4 py-3 text-left">Lang</th>
                <th className="px-4 py-3 text-left">Verdict</th>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Memory</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading submissions…</td></tr>
              )}

              {!isLoading && !(submissions as any[]).length && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No submissions yet.</td></tr>
              )}

              {(submissions as any[]).map((submission: any) => (
                <tr key={submission.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs">#{submission.submissionDisplayId}</td>
                  <td className="px-4 py-3">{submission.participantName ?? submission.participantId ?? '—'}</td>
                  <td className="px-4 py-3">{submission.contestProblem?.label ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(submission.submittedAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{submission.language ?? '—'}</td>
                  <td className={`px-4 py-3 font-medium ${VERDICT_COLOR[submission.manualVerdict ?? submission.submissionStatus] ?? 'text-slate-600'}`}>
                    {submission.manualVerdict ?? submission.submissionStatus}
                  </td>
                  <td className="px-4 py-3">{submission.executionTimeMs != null ? `${submission.executionTimeMs} ms` : '—'}</td>
                  <td className="px-4 py-3">{submission.memoryUsedKb != null ? `${submission.memoryUsedKb} KB` : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="text-indigo-600 hover:underline"
                        onClick={() => setSelectedSubmissionId(submission.id)}
                      >
                        Quick View
                      </button>
                      <Link to={`/contest/${contestPathId}/submissions/${submission.id}`} className="text-slate-700 hover:underline">
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
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
            <p><span className="font-semibold">Problem:</span> {selected.contestProblem?.label ?? '—'}</p>
            <p><span className="font-semibold">Language:</span> {selected.language ?? '—'}</p>
            <p><span className="font-semibold">Status:</span> {selected.manualVerdict ?? selected.submissionStatus}</p>
            <p><span className="font-semibold">Submitted:</span> {new Date(selected.submittedAt).toLocaleString()}</p>
            {selected.score != null && <p><span className="font-semibold">Score:</span> {selected.score}</p>}
            {selected.code ? (
              <div>
                <p className="mb-1 font-semibold">Code</p>
                <pre className="max-h-80 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{selected.code}</pre>
              </div>
            ) : (
              <p className="text-slate-500">No inline code. File upload submission.</p>
            )}
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
