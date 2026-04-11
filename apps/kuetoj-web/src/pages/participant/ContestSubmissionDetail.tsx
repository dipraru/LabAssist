import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '../../components/AppShell';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { ParticipantContestHeader } from '../../components/ParticipantContestHeader';
import { api } from '../../lib/api';

export function ContestSubmissionDetail() {
  const { id, submissionId } = useParams<{ id: string; submissionId: string }>();

  const { data: submission, isLoading } = useQuery({
    queryKey: ['my-contest-submission-detail', id, submissionId],
    queryFn: () => api.get(`/contests/${id}/my-submissions/${submissionId}`).then((r) => r.data),
    enabled: !!id && !!submissionId,
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

  return (
    <AppShell>
      <div className="w-full">
        {id && <ParticipantContestHeader contestId={id} />}
        <h1 className="mb-1 text-2xl font-bold text-slate-900">Submission Detail</h1>
        <p className="mb-4 text-sm text-slate-500">Full details for your submission</p>
        {id && <ParticipantContestNav contestId={id} />}

        <Link to={`/contest/${contestPathId}/submissions`} className="mb-4 inline-block text-sm text-indigo-600 hover:underline">
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
              {submission.executionTimeMs != null && <p><span className="font-semibold">Time:</span> {submission.executionTimeMs} ms</p>}
              {submission.memoryUsedKb != null && <p><span className="font-semibold">Memory:</span> {submission.memoryUsedKb} KB</p>}
              {submission.score != null && <p><span className="font-semibold">Score:</span> {submission.score}</p>}
              {submission.judgeServerName && <p><span className="font-semibold">Judge Server:</span> {submission.judgeServerName}</p>}
              {submission.fileName && <p><span className="font-semibold">Uploaded file:</span> {submission.fileName}</p>}
              {submission.judgeError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  <p className="font-semibold">Judge Queue Notice</p>
                  <p className="mt-1 whitespace-pre-wrap">{submission.judgeError}</p>
                </div>
              )}
              {submission.judgeMessage && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-700">Judge Message</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-600">{submission.judgeMessage}</p>
                </div>
              )}
              {submission.compileOutput && (
                <div>
                  <p className="mb-1 font-semibold">Compiler Output</p>
                  <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{submission.compileOutput}</pre>
                </div>
              )}
              {Array.isArray(submission.testcaseResults) && submission.testcaseResults.length > 0 && (
                <div>
                  <p className="mb-2 font-semibold">Executed Test Cases</p>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Case</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Verdict</th>
                          <th className="px-3 py-2">Time</th>
                          <th className="px-3 py-2">Memory</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submission.testcaseResults.map((testCase: any) => (
                          <tr key={`${testCase.index}-${testCase.isSample ? 'sample' : 'hidden'}`} className="border-t border-slate-100">
                            <td className="px-3 py-2">{testCase.index}</td>
                            <td className="px-3 py-2">{testCase.isSample ? 'Sample' : 'Hidden'}</td>
                            <td className="px-3 py-2">{testCase.verdict}</td>
                            <td className="px-3 py-2">{testCase.timeMs != null ? `${testCase.timeMs} ms` : '—'}</td>
                            <td className="px-3 py-2">{testCase.memoryKb != null ? `${testCase.memoryKb} KB` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

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
