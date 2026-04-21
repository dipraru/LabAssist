import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../../components/AppShell';
import { ParticipantContestNav } from '../../components/ParticipantContestNav';
import { ParticipantContestHeader } from '../../components/ParticipantContestHeader';
import { CodePreview } from '../../components/CodePreview';
import { api } from '../../lib/api';
import { getSocket, joinContest, leaveContest } from '../../lib/socket';
import { getEffectiveVerdict, getVerdictBadgeClass } from '../../lib/verdict';
import { ArrowLeft, FileCode2 } from 'lucide-react';

export function ContestSubmissionDetail() {
  const { id, submissionId } = useParams<{ id: string; submissionId: string }>();
  const qc = useQueryClient();

  const { data: submission, isLoading } = useQuery({
    queryKey: ['my-contest-submission-detail', id, submissionId],
    queryFn: () => api.get(`/contests/${id}/my-submissions/${submissionId}`).then((r) => r.data),
    enabled: !!id && !!submissionId,
    refetchInterval: 3000,
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

  useEffect(() => {
    if (!contest?.id || !id || !submissionId) return;

    joinContest(contest.id);
    const socket = getSocket();
    const refreshSubmission = () => {
      qc.invalidateQueries({ queryKey: ['my-contest-submission-detail', id, submissionId] });
      qc.invalidateQueries({ queryKey: ['my-contest-submissions', id] });
    };

    socket.on('verdict', refreshSubmission);

    return () => {
      socket.off('verdict', refreshSubmission);
      leaveContest(contest.id);
    };
  }, [contest?.id, id, submissionId, qc]);

  return (
    <AppShell>
      <div className="oj-page">
        {id && <ParticipantContestHeader contestId={id} />}
        {id && <ParticipantContestNav contestId={id} />}

        <section className="oj-panel mb-5 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="oj-kicker"><FileCode2 size={14} /> Submission Detail</p>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">
              {submission?.submissionDisplayId ? `#${submission.submissionDisplayId}` : 'Submission'}
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Full verdict, runtime, judge output, and source preview.</p>
          </div>
          <Link to={`/contests/${contestPathId}/submissions`} className="oj-btn-secondary">
            <ArrowLeft size={16} />
            Back to submissions
          </Link>
        </section>

        <div className="oj-panel p-5">
          {isLoading && <p className="text-slate-400">Loading submission...</p>}

          {!isLoading && !submission && <p className="text-slate-400">Submission not found.</p>}

          {submission && (
            <div className="space-y-3 text-sm">
              {(() => {
                const verdict = getEffectiveVerdict(submission);
                return (
                  <>
              <p><span className="font-semibold">Submission ID:</span> #{submission.submissionDisplayId}</p>
              <p><span className="font-semibold">Problem:</span> {submission.contestProblem?.label ?? '—'}</p>
              <p><span className="font-semibold">Language:</span> {submission.language ?? '—'}</p>
              <p>
                <span className="font-semibold">Verdict:</span>{' '}
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold align-middle ${getVerdictBadgeClass(verdict)}`}>
                  {verdict}
                </span>
              </p>
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
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
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
                            <td className="px-3 py-2">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getVerdictBadgeClass(testCase.verdict)}`}>
                                {testCase.verdict}
                              </span>
                            </td>
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
                  <CodePreview
                    code={submission.code}
                    language={submission.language}
                    height="60vh"
                    name={`submission-detail-${submission.id}`}
                  />
                </div>
              ) : (
                <p className="text-slate-500">No inline code attached.</p>
              )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
