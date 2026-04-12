import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import AceEditor from 'react-ace';
import toast from 'react-hot-toast';
import 'ace-builds/src-noconflict/mode-c_cpp';
import 'ace-builds/src-noconflict/mode-java';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/theme-textmate';
import { getSocket, joinContest, leaveContest } from '../../lib/socket';
import { getEffectiveVerdict, getVerdictBadgeClass } from '../../lib/verdict';

const LANG_MODES: Record<string, string> = {
  c: 'c_cpp',
  cpp: 'c_cpp',
  java: 'java',
  python: 'python',
  python3: 'python',
  javascript: 'javascript',
};

const LANGUAGES = ['c', 'cpp', 'java', 'python', 'python3', 'javascript'];

function formatRemainingTime(endTime?: string) {
  if (!endTime) return '00:00:00';
  const remainingSeconds = Math.max(0, Math.floor((new Date(endTime).getTime() - Date.now()) / 1000));
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function contestTimeLabel(startTime?: string, endTime?: string) {
  if (!startTime || !endTime) return 'Ended';
  const now = Date.now();
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  if (now > endMs) return 'Ended';
  if (now < startMs) return `Starts In: ${formatRemainingTime(startTime)}`;
  return `Remaining: ${formatRemainingTime(endTime)}`;
}

export function ContestProblem() {
  const { id, problemLabel } = useParams<{ id: string; problemLabel: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [language, setLanguage] = useState('cpp');
  const [code, setCode] = useState('');
  const [activeTab, setActiveTab] = useState<'statement' | 'submissions'>('statement');
  const [leftPanePercent, setLeftPanePercent] = useState(55);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyBlock = async (text: string, label: string, key: string) => {
    if (!text) {
      toast.error(`No ${label} to copy`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1200);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const { data: submissions = [] } = useQuery({
    queryKey: ['my-contest-submissions', id],
    queryFn: () => api.get(`/contests/${id}/my-submissions`).then((response) => response.data),
    enabled: !!id,
    refetchInterval: 3000,
  });

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then(r => r.data),
    enabled: !!id,
  });

  useEffect(() => {
    if (!contest?.id || !id) return;

    joinContest(contest.id);
    const socket = getSocket();
    const refreshSubmissions = () => {
      queryClient.invalidateQueries({ queryKey: ['my-contest-submissions', id] });
    };

    socket.on('verdict', refreshSubmissions);

    return () => {
      socket.off('verdict', refreshSubmissions);
      leaveContest(contest.id);
    };
  }, [contest?.id, id, queryClient]);

  const contestProblems: any[] = [...(contest?.problems ?? contest?.contestProblems ?? [])]
    .sort((a, b) => (a?.orderIndex ?? 0) - (b?.orderIndex ?? 0));

  const normalizedProblemLabel = decodeURIComponent(problemLabel ?? '').trim().toUpperCase();
  const cp = contestProblems.find((p: any, index: number) => {
    const label = (p?.label ? String(p.label).trim() : String.fromCharCode(65 + index)).toUpperCase();
    return label === normalizedProblemLabel;
  }) ?? contestProblems.find((p: any) => p.problem?.id === problemLabel || p.id === problemLabel);
  const problem = cp?.problem;
  const currentProblemLabel = cp?.label
    ? String(cp.label).trim()
    : normalizedProblemLabel || '—';
  const contestPathId = contest?.contestNumber != null
    ? String(contest.contestNumber)
    : id;

  const submitMutation = useMutation({
    mutationFn: () => {
      const payload = new FormData();
      payload.append('contestProblemId', cp.id);
      payload.append('language', language);
      payload.append('code', code);
      return api.post(`/contests/${id}/submit`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (response) => {
      toast.success('Submitted successfully');
      setCode('');
      queryClient.invalidateQueries({ queryKey: ['my-contest-submissions', id] });
      const submissionId = response.data?.id;
      if (submissionId && contestPathId) {
        navigate(`/contest/${contestPathId}/submissions/${submissionId}`);
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Submission failed');
    },
  });

  if (!problem) return (
    <AppShell>
      <div className="text-center py-12 text-slate-400">Problem unavailable right now.</div>
    </AppShell>
  );

  const problemSubmissions = (submissions as any[])
    .filter((submission) => submission.contestProblemId === cp.id);

  const selectedSubmission = useMemo(
    () => problemSubmissions.find((submission) => submission.id === selectedSubmissionId) ?? null,
    [problemSubmissions, selectedSubmissionId],
  );

  const handleDividerMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();

    const onMouseMove = (moveEvent: MouseEvent) => {
      const viewportWidth = window.innerWidth;
      const nextPercent = (moveEvent.clientX / viewportWidth) * 100;
      const clamped = Math.max(30, Math.min(70, nextPercent));
      setLeftPanePercent(clamped);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <AppShell>
      <div className="w-full">
        <div className="mb-6 overflow-x-auto">
          <div className="flex min-w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2">
            <div className="inline-flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('statement')}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${activeTab === 'statement' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              Statement
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('submissions')}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${activeTab === 'submissions' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              My Submissions
            </button>
            <Link
              to={`/contest/${contestPathId}/problems`}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Back to Dashboard
            </Link>
            </div>
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
              {contestTimeLabel(contest?.startTime, contest?.endTime)}
            </div>
          </div>
        </div>

        {activeTab === 'statement' && (
          <div className="flex h-[calc(100vh-280px)] min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <section className="h-full overflow-auto" style={{ width: `${leftPanePercent}%` }}>
              <div className="p-6">
                <div className="mb-4 flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 font-bold text-indigo-700">
                    {currentProblemLabel}
                  </span>
                  <div>
                    <h1 className="text-xl font-bold text-slate-900">{problem.title}</h1>
                    <p className="text-sm text-slate-500">
                      Time: {problem.timeLimitMs}ms · Memory: {problem.memoryLimitKb}KB
                      {contest?.type === 'score_based' && cp.score != null && ` · ${cp.score} points`}
                    </p>
                  </div>
                </div>

                <div className="prose prose-sm max-w-none text-slate-700">
                  <pre className="whitespace-pre-wrap font-sans">{problem.statement}</pre>
                </div>

                {problem.inputDescription && (
                  <div className="mt-5">
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">Input</h3>
                    <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800 font-sans">{problem.inputDescription}</pre>
                  </div>
                )}

                {problem.outputDescription && (
                  <div className="mt-5">
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">Output</h3>
                    <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800 font-sans">{problem.outputDescription}</pre>
                  </div>
                )}

                {problem.sampleTestCases?.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">Sample Test Cases</h3>
                    <div className="space-y-3">
                      {problem.sampleTestCases.map((tc: any, i: number) => (
                        <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-3">
                          <p className="text-xs font-semibold text-slate-600">Sample #{i + 1}</p>
                          <div>
                            <div className="mb-1 flex items-center justify-between">
                              <p className="text-xs font-medium text-slate-500">Input {i + 1}</p>
                              <button
                                type="button"
                                onClick={() => void copyBlock(tc.input, `Sample ${i + 1} input`, `sample-${i}-input`)}
                                className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                              >
                                {copiedKey === `sample-${i}-input` ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                            <pre className="overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-sm text-slate-800 whitespace-pre-wrap">{tc.input}</pre>
                          </div>
                          <div>
                            <div className="mb-1 flex items-center justify-between">
                              <p className="text-xs font-medium text-slate-500">Output {i + 1}</p>
                              <button
                                type="button"
                                onClick={() => void copyBlock(tc.output, `Sample ${i + 1} output`, `sample-${i}-output`)}
                                className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                              >
                                {copiedKey === `sample-${i}-output` ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                            <pre className="overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-sm text-slate-800 whitespace-pre-wrap">{tc.output}</pre>
                          </div>
                          {(tc.note || tc.explanation) && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-slate-500">Note</p>
                              <pre className="whitespace-pre-wrap rounded-lg bg-indigo-50 p-3 text-sm text-slate-700 font-sans">{tc.note ?? tc.explanation}</pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <div
              role="separator"
              className="h-full w-2 cursor-col-resize bg-slate-100 hover:bg-indigo-100"
              onMouseDown={handleDividerMouseDown}
            />

            <section className="h-full flex-1 border-l border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-700">Code Editor</h2>
                <div className="flex items-center gap-2">
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
                  >
                    {LANGUAGES.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    disabled={submitMutation.isPending || !code.trim()}
                    onClick={() => submitMutation.mutate()}
                  >
                    {submitMutation.isPending ? 'Submitting…' : `Submit ${currentProblemLabel}`}
                  </button>
                </div>
              </div>

              <AceEditor
                mode={LANG_MODES[language] ?? 'c_cpp'}
                theme="textmate"
                value={code}
                onChange={setCode}
                name="integrated-problem-editor"
                width="100%"
                height="calc(100% - 46px)"
                fontSize={14}
                setOptions={{ useWorker: false, showPrintMargin: false }}
              />
            </section>
          </div>
        )}

        {activeTab === 'submissions' && (
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
                </tr>
              </thead>
              <tbody>
                {problemSubmissions.map((submission: any) => {
                  const verdict = getEffectiveVerdict(submission);
                  return (
                  <tr key={submission.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedSubmissionId(submission.id)}
                        className="text-indigo-600 hover:underline"
                      >
                        #{submission.submissionDisplayId}
                      </button>
                    </td>
                    <td className="px-4 py-3">{submission.participantName ?? submission.participantId ?? '—'}</td>
                    <td className="px-4 py-3">{currentProblemLabel}. {problem.title}</td>
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
                {!problemSubmissions.length && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400">No submissions for this problem yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!selectedSubmission}
        title={selectedSubmission ? `Submission #${selectedSubmission.submissionDisplayId}` : 'Submission'}
        onClose={() => setSelectedSubmissionId(null)}
      >
        {selectedSubmission && (
          <div className="space-y-3 text-sm">
            <p><span className="font-semibold">Problem:</span> {currentProblemLabel}. {problem.title}</p>
            <p><span className="font-semibold">Language:</span> {selectedSubmission.language ?? '—'}</p>
            <p>
              <span className="font-semibold">Status:</span>{' '}
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold align-middle ${getVerdictBadgeClass(getEffectiveVerdict(selectedSubmission))}`}>
                {getEffectiveVerdict(selectedSubmission)}
              </span>
            </p>
            <p><span className="font-semibold">Submitted:</span> {new Date(selectedSubmission.submittedAt).toLocaleString()}</p>
            {selectedSubmission.code ? (
              <div>
                <p className="mb-1 font-semibold">Code</p>
                <pre className="max-h-[50vh] overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{selectedSubmission.code}</pre>
              </div>
            ) : (
              <p className="text-slate-500">No inline code. File upload submission.</p>
            )}
            <div>
              <Link
                to={`/contest/${contestPathId}/submissions/${selectedSubmission.id}`}
                className="text-indigo-600 hover:underline"
              >
                Open in separate page
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
