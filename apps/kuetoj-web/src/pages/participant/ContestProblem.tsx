import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { CodePreview } from '../../components/CodePreview';
import { AnnouncementModal } from '../../components/AnnouncementModal';
import AceEditor from 'react-ace';
import toast from 'react-hot-toast';
import 'ace-builds/src-noconflict/mode-c_cpp';
import 'ace-builds/src-noconflict/mode-java';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/theme-github';
import { getSocket, joinContest, leaveContest } from '../../lib/socket';
import { getEffectiveVerdict, getVerdictBadgeClass } from '../../lib/verdict';
import { ArrowLeft, CheckCircle2, Code2, FileUp, ListChecks, Play, Send, TimerReset, XCircle } from 'lucide-react';

const LANG_MODES: Record<string, string> = {
  c: 'c_cpp',
  cpp: 'c_cpp',
  java: 'java',
  python: 'python',
  python3: 'python',
  javascript: 'javascript',
};

const LANGUAGES = ['c', 'cpp', 'java', 'python', 'python3', 'javascript'];

function sampleVerdictLabel(verdict?: string | null) {
  const normalized = String(verdict ?? '').trim().toLowerCase();
  if (!normalized) return 'Waiting';
  if (normalized === 'passed' || normalized === 'accepted') return 'Passed';
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sampleVerdictClass(verdict?: string | null) {
  const normalized = String(verdict ?? '').trim().toLowerCase();
  if (normalized === 'passed' || normalized === 'accepted') return 'bg-teal-50 text-teal-700 ring-teal-100';
  if (normalized === 'wrong_answer') return 'bg-rose-50 text-rose-700 ring-rose-100';
  if (normalized === 'time_limit_exceeded' || normalized === 'memory_limit_exceeded') return 'bg-amber-50 text-amber-700 ring-amber-100';
  if (normalized === 'runtime_error' || normalized === 'compilation_error') return 'bg-red-50 text-red-700 ring-red-100';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

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
  const { id, problemLabel, problemId } = useParams<{ id: string; problemLabel?: string; problemId?: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [language, setLanguage] = useState('cpp');
  const [code, setCode] = useState('');
  const [activeTab, setActiveTab] = useState<'statement' | 'submissions'>('statement');
  const [leftPanePercent, setLeftPanePercent] = useState(55);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [useFile, setUseFile] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sampleRunResult, setSampleRunResult] = useState<any | null>(null);

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
    setSampleRunResult(null);
  }, [code, file, language, useFile]);

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

  const routeProblemKey = problemLabel ?? problemId ?? '';
  const normalizedProblemLabel = decodeURIComponent(routeProblemKey).trim().toUpperCase();
  const cp = contestProblems.find((p: any, index: number) => {
    const label = (p?.label ? String(p.label).trim() : String.fromCharCode(65 + index)).toUpperCase();
    return label === normalizedProblemLabel;
  }) ?? contestProblems.find((p: any) => p.problem?.id === routeProblemKey || p.id === routeProblemKey);
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
      if (useFile && file) {
        payload.append('file', file);
      } else {
        payload.append('code', code);
      }
      return api.post(`/contests/${id}/submit`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (response) => {
      toast.success('Submitted successfully');
      setCode('');
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ['my-contest-submissions', id] });
      const submissionId = response.data?.id;
      if (submissionId && contestPathId) {
        navigate(`/contests/${contestPathId}/submissions/${submissionId}`);
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Submission failed');
    },
  });

  const runSamplesMutation = useMutation({
    mutationFn: () => {
      const payload = new FormData();
      payload.append('contestProblemId', cp.id);
      payload.append('language', language);
      if (useFile && file) {
        payload.append('file', file);
      } else {
        payload.append('code', code);
      }
      return api.post(`/contests/${id}/run-samples`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((response) => response.data);
    },
    onSuccess: (response) => {
      setSampleRunResult(response);
      toast.success(response?.verdict === 'passed' ? 'Samples passed' : sampleVerdictLabel(response?.verdict));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Sample run failed');
    },
  });

  if (!problem) return (
    <AppShell>
      <div className="oj-panel mx-auto max-w-2xl p-10 text-center text-sm font-semibold text-slate-400">Problem unavailable right now.</div>
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
      <AnnouncementModal />
      <div className="oj-page">
        <div className="mb-5 overflow-x-auto oj-scrollbar">
          <div className="flex min-w-full items-center justify-between gap-3 rounded-3xl border border-white/80 bg-white/80 p-2 shadow-lg shadow-slate-900/5 backdrop-blur">
            <div className="inline-flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('statement')}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold ${activeTab === 'statement' ? 'bg-teal-700 text-white shadow-lg shadow-teal-900/15' : 'text-slate-600 hover:bg-white hover:text-teal-700'}`}
            >
              <Code2 size={16} />
              Statement
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('submissions')}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold ${activeTab === 'submissions' ? 'bg-teal-700 text-white shadow-lg shadow-teal-900/15' : 'text-slate-600 hover:bg-white hover:text-teal-700'}`}
            >
              <ListChecks size={16} />
              My Submissions
            </button>
            <Link
              to={`/contests/${contestPathId}/problems`}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold text-slate-600 hover:bg-white hover:text-teal-700"
            >
              <ArrowLeft size={16} />
              Dashboard
            </Link>
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-xs font-extrabold text-white">
              <TimerReset size={15} />
              {contestTimeLabel(contest?.startTime, contest?.endTime)}
            </div>
          </div>
        </div>

        {activeTab === 'statement' && (
          <div className="flex h-[calc(100vh-190px)] min-h-[620px] overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/86 shadow-2xl shadow-slate-900/10 backdrop-blur">
            <section className="h-full overflow-auto oj-scrollbar" style={{ width: `${leftPanePercent}%` }}>
              <div className="p-6">
                <div className="mb-4 flex items-start gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-lg font-extrabold text-white shadow-lg shadow-slate-900/15">
                    {currentProblemLabel}
                  </span>
                  <div>
                    <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">{problem.title}</h1>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      Time: {problem.timeLimitMs}ms · Memory: {problem.memoryLimitKb}KB
                      {contest?.type === 'score_based' && cp.score != null && ` · ${cp.score} points`}
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm leading-7 text-slate-700">
                  <pre className="whitespace-pre-wrap font-sans">{problem.statement}</pre>
                </div>

                {problem.inputDescription && (
                  <div className="mt-5">
                    <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Input</h3>
                    <pre className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 font-sans">{problem.inputDescription}</pre>
                  </div>
                )}

                {problem.outputDescription && (
                  <div className="mt-5">
                    <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">Output</h3>
                    <pre className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 font-sans">{problem.outputDescription}</pre>
                  </div>
                )}

                {problem.sampleTestCases?.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-700">Sample Test Cases</h3>
                    <div className="space-y-3">
                      {problem.sampleTestCases.map((tc: any, i: number) => (
                        <div key={i} className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Sample #{i + 1}</p>
                          <div>
                            <div className="mb-1 flex items-center justify-between">
                              <p className="text-xs font-bold text-slate-500">Input {i + 1}</p>
                              <button
                                type="button"
                                onClick={() => void copyBlock(tc.input, `Sample ${i + 1} input`, `sample-${i}-input`)}
                                className="cursor-pointer rounded-full px-2 py-1 text-xs font-extrabold text-teal-700 transition-colors hover:bg-teal-50"
                              >
                                {copiedKey === `sample-${i}-input` ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                            <pre className="overflow-auto rounded-2xl bg-slate-950 p-4 font-mono text-sm text-slate-50 whitespace-pre-wrap">{tc.input}</pre>
                          </div>
                          <div>
                            <div className="mb-1 flex items-center justify-between">
                              <p className="text-xs font-bold text-slate-500">Output {i + 1}</p>
                              <button
                                type="button"
                                onClick={() => void copyBlock(tc.output, `Sample ${i + 1} output`, `sample-${i}-output`)}
                                className="cursor-pointer rounded-full px-2 py-1 text-xs font-extrabold text-teal-700 transition-colors hover:bg-teal-50"
                              >
                                {copiedKey === `sample-${i}-output` ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                            <pre className="overflow-auto rounded-2xl bg-slate-50 p-4 font-mono text-sm text-slate-800 whitespace-pre-wrap">{tc.output}</pre>
                          </div>
                          {(tc.note || tc.explanation) && (
                            <div>
                              <p className="mb-1 text-xs font-bold text-slate-500">Note</p>
                              <pre className="whitespace-pre-wrap rounded-2xl bg-teal-50 p-4 text-sm text-slate-700 font-sans">{tc.note ?? tc.explanation}</pre>
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
              className="h-full w-2 cursor-col-resize bg-slate-100 hover:bg-teal-100"
              onMouseDown={handleDividerMouseDown}
            />

            <section className="flex h-full flex-1 flex-col border-l border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-slate-700">Submission Workspace</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Write inline code or upload a source file.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                    className="oj-select w-auto min-w-28 py-2 text-xs"
                  >
                    {LANGUAGES.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setUseFile(false)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-extrabold ${!useFile ? 'bg-teal-700 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
                  >
                    <Code2 size={14} />
                    Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseFile(true)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-extrabold ${useFile ? 'bg-teal-700 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
                  >
                    <FileUp size={14} />
                    Upload
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-inner">
                {!useFile ? (
                  <AceEditor
                    mode={LANG_MODES[language] ?? 'c_cpp'}
                    theme="github"
                    value={code}
                    onChange={setCode}
                    name="integrated-problem-editor"
                    width="100%"
                    height="100%"
                    fontSize={14}
                    setOptions={{ useWorker: false, showPrintMargin: false, wrap: true }}
                  />
                ) : (
                  <label className={`flex h-full cursor-pointer flex-col items-center justify-center gap-4 p-8 text-center transition-colors ${file ? 'bg-teal-50' : 'bg-white hover:bg-slate-50'}`}>
                    <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-white shadow-xl shadow-slate-900/15">
                      <FileUp size={28} />
                    </span>
                    <span>
                      <span className="block text-lg font-extrabold text-slate-950">{file ? file.name : 'Upload source file'}</span>
                      <span className="mt-1 block text-sm font-semibold text-slate-500">Supported source files can be judged.</span>
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(event) => {
                        const selectedFile = event.target.files?.[0] ?? null;
                        setFile(selectedFile);
                      }}
                    />
                  </label>
                )}
              </div>

              {sampleRunResult && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {String(sampleRunResult.verdict).toLowerCase() === 'passed' ? (
                        <CheckCircle2 size={17} className="text-teal-600" />
                      ) : (
                        <XCircle size={17} className="text-rose-600" />
                      )}
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 ${sampleVerdictClass(sampleRunResult.verdict)}`}>
                        {sampleVerdictLabel(sampleRunResult.verdict)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-500">
                      {sampleRunResult.executionTimeMs != null ? `${sampleRunResult.executionTimeMs} ms` : '—'}
                      {' · '}
                      {sampleRunResult.memoryUsedKb != null ? `${sampleRunResult.memoryUsedKb} KB` : '—'}
                    </p>
                  </div>
                  {!!sampleRunResult.testcaseResults?.length && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {sampleRunResult.testcaseResults.map((testCase: any) => (
                        <div key={testCase.index} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold">
                          <span className="text-slate-600">Sample #{testCase.index}</span>
                          <span className={`rounded-full px-2 py-0.5 ring-1 ${sampleVerdictClass(testCase.verdict)}`}>
                            {sampleVerdictLabel(testCase.verdict)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {sampleRunResult.compileOutput && (
                    <pre className="mt-3 max-h-28 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-50 whitespace-pre-wrap">{sampleRunResult.compileOutput}</pre>
                  )}
                  {sampleRunResult.judgeMessage && (
                    <p className="mt-2 text-xs font-semibold text-slate-500">{sampleRunResult.judgeMessage}</p>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  className="oj-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={runSamplesMutation.isPending || (!useFile && !code.trim()) || (useFile && !file)}
                  onClick={() => runSamplesMutation.mutate()}
                >
                  <Play size={16} />
                  {runSamplesMutation.isPending ? 'Running...' : 'Run on Samples'}
                </button>
                <button
                    type="button"
                    className="oj-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={submitMutation.isPending || (!useFile && !code.trim()) || (useFile && !file)}
                    onClick={() => submitMutation.mutate()}
                  >
                    <Send size={16} />
                    {submitMutation.isPending ? 'Submitting...' : `Submit ${currentProblemLabel}`}
                  </button>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'submissions' && (
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
                <CodePreview
                  code={selectedSubmission.code}
                  language={selectedSubmission.language}
                  height="50vh"
                  name={`contest-problem-submission-${selectedSubmission.id}`}
                />
              </div>
            ) : (
              <p className="text-slate-500">No inline code. File upload submission.</p>
            )}
            <div>
              <Link
                to={`/contests/${contestPathId}/submissions/${selectedSubmission.id}`}
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
