import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '../../components/AppShell';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { api } from '../../lib/api';

export function ContestSubmissionDetail() {
  const { id, submissionId } = useParams<{ id: string; submissionId: string }>();

  const { data: submission, isLoading } = useQuery({
    queryKey: ['my-contest-submission-detail', id, submissionId],
    queryFn: () => api.get(`/contests/${id}/my-submissions/${submissionId}`).then((r) => r.data),
    enabled: !!id && !!submissionId,
  });

  return (
    <AppShell>
      <div className="max-w-5xl">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">Submission Detail</h1>
        <p className="mb-4 text-sm text-slate-500">Full details for your submission</p>
        {id && <ParticipantContestNav contestId={id} />}

        <Link to={`/contest/${id}/submissions`} className="mb-4 inline-block text-sm text-indigo-600 hover:underline">
          ← Back to submissions
        </Link>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          {isLoading && <p className="text-slate-400">Loading submission…</p>}

          {!isLoading && !submission && <p className="text-slate-400">Submission not found.</p>}

          {submission && (
            <div className="space-y-3 text-sm">
              <p><span className="font-semibold">Submission ID:</span> #{submission.submissionDisplayId}</p>
              <p><span className="font-semibold">Problem:</span> {submission.contestProblem?.label ?? '—'}</p>
              <p><span className="font-semibold">Language:</span> {submission.language ?? '—'}</p>
              <p><span className="font-semibold">Verdict:</span> {submission.manualVerdict ?? submission.submissionStatus}</p>
              <p><span className="font-semibold">Submitted:</span> {new Date(submission.submittedAt).toLocaleString()}</p>
              {submission.score != null && <p><span className="font-semibold">Score:</span> {submission.score}</p>}
              {submission.fileName && <p><span className="font-semibold">Uploaded file:</span> {submission.fileName}</p>}

              {submission.code ? (
                <div>
                  <p className="mb-1 font-semibold">Code</p>
                  <pre className="max-h-[60vh] overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{submission.code}</pre>
                </div>
              ) : (
                <p className="text-slate-500">No inline code attached.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
