import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AceEditor from 'react-ace';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  HardDrive,
  ListChecks,
  Maximize2,
  Minimize2,
  Play,
  Send,
  TimerReset,
  XCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { CodePreview } from '../../components/CodePreview';
import { AnnouncementModal } from '../../components/AnnouncementModal';
import { getSocket, joinContest, leaveContest } from '../../lib/socket';
import { getEffectiveVerdict, getVerdictBadgeClass } from '../../lib/verdict';
import 'ace-builds/src-noconflict/mode-c_cpp';
import 'ace-builds/src-noconflict/mode-java';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/mode-typescript';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-monokai';
import 'ace-builds/src-noconflict/theme-dracula';
import 'ace-builds/src-noconflict/theme-cobalt';
import 'ace-builds/src-noconflict/theme-one_dark';
import 'ace-builds/src-noconflict/theme-textmate';
import 'ace-builds/src-noconflict/theme-xcode';
import 'ace-builds/src-noconflict/theme-eclipse';
import 'ace-builds/src-noconflict/theme-solarized_dark';
import 'ace-builds/src-noconflict/theme-solarized_light';
import 'ace-builds/src-noconflict/theme-tomorrow_night';

type ContestProblemPane = 'statement' | 'editor';

const LANG_MODES: Record<string, string> = {
  c: 'c_cpp',
  cpp: 'c_cpp',
  java: 'java',
  python3: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
};

const LANGUAGE_OPTIONS = [
  { label: 'C', value: 'c' },
  { label: 'C++', value: 'cpp' },
  { label: 'Java', value: 'java' },
  { label: 'Python 3', value: 'python3' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
];

const THEME_OPTIONS = [
  { label: 'Monokai', value: 'monokai' },
  { label: 'Dracula', value: 'dracula' },
  { label: 'Cobalt', value: 'cobalt' },
  { label: 'One Dark', value: 'one_dark' },
  { label: 'Textmate', value: 'textmate' },
  { label: 'Xcode', value: 'xcode' },
  { label: 'Eclipse', value: 'eclipse' },
  { label: 'Solarized Dark', value: 'solarized_dark' },
  { label: 'Solarized Light', value: 'solarized_light' },
  { label: 'Tomorrow Night', value: 'tomorrow_night' },
];

const DEFAULT_SNIPPETS: Record<string, string> = {
  c: '#include <stdio.h>\n\nint main(void) {\n    return 0;\n}\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n    }\n}\n',
  python3: '',
  javascript: '',
  typescript: '',
};

function formatRemainingTime(endTime?: string, nowMs = Date.now()) {
  if (!endTime) return '00:00:00';
  const remainingSeconds = Math.max(0, Math.floor((new Date(endTime).getTime() - nowMs) / 1000));
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function contestTimeLabel(startTime?: string, endTime?: string, nowMs = Date.now()) {
  if (!startTime || !endTime) return 'Ended';
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  if (nowMs > endMs) return 'Ended';
  if (nowMs < startMs) return `Starts in ${formatRemainingTime(startTime, nowMs)}`;
  return `Remaining ${formatRemainingTime(endTime, nowMs)}`;
}

function contestCompactTime(startTime?: string, endTime?: string, nowMs = Date.now()) {
  if (!startTime || !endTime) return '00:00:00';
  const startMs = new Date(startTime).getTime();
  return formatRemainingTime(nowMs < startMs ? startTime : endTime, nowMs);
}

function contestProblemLabel(cp: any, index: number): string {
  const raw = typeof cp?.label === 'string' ? cp.label.trim().toUpperCase() : '';
  if (raw.length === 1 && /^[A-Z]$/.test(raw)) return raw;
  return String.fromCharCode(65 + index);
}

function formatTimeLimit(timeLimitMs?: number | null) {
  if (timeLimitMs == null) return '-';
  if (timeLimitMs >= 1000) {
    const seconds = timeLimitMs / 1000;
    return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(2)} sec`;
  }
  return `${timeLimitMs} ms`;
}

function formatMemoryLimit(memoryLimitKb?: number | null) {
  if (memoryLimitKb == null) return '-';
  if (memoryLimitKb >= 1024 * 1024) {
    const gb = memoryLimitKb / 1024 / 1024;
    return `${Number.isInteger(gb) ? gb.toFixed(0) : gb.toFixed(2)} GB`;
  }
  if (memoryLimitKb >= 1024) {
    const mb = memoryLimitKb / 1024;
    return `${Number.isInteger(mb) ? mb.toFixed(0) : mb.toFixed(1)} MB`;
  }
  return `${memoryLimitKb} KB`;
}

function runVerdictLabel(verdict?: string | null) {
  const normalized = String(verdict ?? '').trim().toLowerCase();
  if (!normalized) return 'Waiting';
  if (normalized === 'successfully_executed' || normalized === 'accepted') return 'Successfully executed';
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function runVerdictClass(verdict?: string | null) {
  const normalized = String(verdict ?? '').trim().toLowerCase();
  if (normalized === 'successfully_executed' || normalized === 'accepted') return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  if (normalized === 'wrong_answer') return 'bg-rose-50 text-rose-700 ring-rose-100';
  if (normalized === 'time_limit_exceeded' || normalized === 'memory_limit_exceeded') return 'bg-amber-50 text-amber-700 ring-amber-100';
  if (normalized === 'runtime_error' || normalized === 'compilation_error') return 'bg-red-50 text-red-700 ring-red-100';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

function isRunSuccess(verdict?: string | null) {
  const normalized = String(verdict ?? '').trim().toLowerCase();
  return normalized === 'successfully_executed' || normalized === 'accepted';
}

function formatMetric(value?: number | null, suffix = '') {
  if (value == null) return '-';
  return `${value}${suffix}`;
}

function textOrDash(value?: string | null) {
  return value && value.length ? value : '-';
}

export function ContestProblem() {
  const { id, problemId } = useParams<{ id: string; problemId?: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [language, setLanguage] = useState('cpp');
  const [theme, setTheme] = useState('monokai');
  const [code, setCode] = useState(DEFAULT_SNIPPETS.cpp);
  const [customInput, setCustomInput] = useState('');
  const [seededCustomInputKey, setSeededCustomInputKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'statement' | 'submissions'>('statement');
  const [maximizedPane, setMaximizedPane] = useState<ContestProblemPane | null>(null);
  const [leftPanePercent, setLeftPanePercent] = useState(50);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<any | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const editorRef = useRef<any>(null);

  const { data: submissions = [] } = useQuery({
    queryKey: ['my-contest-submissions', id],
    queryFn: () => api.get(`/contests/${id}/my-submissions`).then((response) => response.data),
    enabled: !!id,
    refetchInterval: 3000,
  });

  const { data: contest } = useQuery({
    queryKey: ['contest', id],
    queryFn: () => api.get(`/contests/${id}`).then((response) => response.data),
    enabled: !!id,
  });

  useEffect(() => {
    setRunResult(null);
  }, [code, customInput, language]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

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

  const contestProblems: any[] = useMemo(
    () => [...(contest?.problems ?? contest?.contestProblems ?? [])].sort((a, b) => (a?.orderIndex ?? 0) - (b?.orderIndex ?? 0)),
    [contest],
  );

  const routeProblemKey = decodeURIComponent(problemId ?? '').trim();
  const normalizedProblemLabel = routeProblemKey.toUpperCase();

  const cp = useMemo(
    () => contestProblems.find((item, index) => contestProblemLabel(item, index) === normalizedProblemLabel)
      ?? contestProblems.find((item) => item?.problem?.id === routeProblemKey || item?.id === routeProblemKey),
    [contestProblems, normalizedProblemLabel, routeProblemKey],
  );

  const problem = cp?.problem;
  const currentProblemIndex = useMemo(
    () => contestProblems.findIndex((item) => item?.id === cp?.id),
    [contestProblems, cp?.id],
  );
  const currentProblemLabel = useMemo(() => {
    return cp ? contestProblemLabel(cp, Math.max(0, currentProblemIndex)) : normalizedProblemLabel || '-';
  }, [cp, currentProblemIndex, normalizedProblemLabel]);
  const previousContestProblem = currentProblemIndex > 0
    ? contestProblems[currentProblemIndex - 1]
    : null;
  const nextContestProblem = currentProblemIndex >= 0 && currentProblemIndex < contestProblems.length - 1
    ? contestProblems[currentProblemIndex + 1]
    : null;
  const previousProblemLabel = previousContestProblem
    ? contestProblemLabel(previousContestProblem, currentProblemIndex - 1)
    : '';
  const nextProblemLabel = nextContestProblem
    ? contestProblemLabel(nextContestProblem, currentProblemIndex + 1)
    : '';

  const contestPathId = contest?.contestNumber != null
    ? String(contest.contestNumber)
    : id;
  const problemHref = (label: string) => `/contests/${contestPathId}/problems/${encodeURIComponent(label)}`;
  const firstSampleInput = problem?.sampleTestCases?.[0]?.input ?? '';

  useEffect(() => {
    const seedKey = cp?.id ?? null;
    if (!seedKey || seededCustomInputKey === seedKey) return;
    setCustomInput(firstSampleInput);
    setSeededCustomInputKey(seedKey);
  }, [cp?.id, firstSampleInput, seededCustomInputKey]);

  const problemSubmissions = useMemo(
    () => (submissions as any[]).filter((submission) => String(submission.contestProblemId) === String(cp?.id ?? '')),
    [cp?.id, submissions],
  );

  const selectedSubmission = useMemo(
    () => problemSubmissions.find((submission) => submission.id === selectedSubmissionId) ?? null,
    [problemSubmissions, selectedSubmissionId],
  );

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

  const handleLanguageChange = (nextLanguage: string) => {
    setCode((previousCode) => {
      const currentDefault = DEFAULT_SNIPPETS[language]?.trim();
      if (!previousCode.trim() || previousCode.trim() === currentDefault) {
        return DEFAULT_SNIPPETS[nextLanguage] ?? '';
      }
      return previousCode;
    });
    setLanguage(nextLanguage);
  };

  const togglePane = (pane: ContestProblemPane) => {
    setMaximizedPane((current) => (current === pane ? null : pane));
  };

  const handleDividerMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (maximizedPane) return;
    event.preventDefault();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextPercent = (moveEvent.clientX / window.innerWidth) * 100;
      setLeftPanePercent(Math.max(30, Math.min(70, nextPercent)));
    };

    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!cp?.id) throw new Error('Problem unavailable');
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
      queryClient.invalidateQueries({ queryKey: ['my-contest-submissions', id] });
      const submissionId = response.data?.id;
      if (submissionId && contestPathId) {
        navigate(`/contests/${contestPathId}/submissions/${submissionId}`);
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? error.message ?? 'Submission failed');
    },
  });

  const runInputMutation = useMutation({
    mutationFn: () => {
      if (!cp?.id) throw new Error('Problem unavailable');
      const payload = new FormData();
      payload.append('contestProblemId', cp.id);
      payload.append('language', language);
      payload.append('code', code);
      payload.append('input', customInput);
      return api.post(`/contests/${id}/run-input`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((response) => response.data);
    },
    onSuccess: (response) => {
      setRunResult(response);
      toast.success(runVerdictLabel(response?.verdict));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? error.message ?? 'Run failed');
    },
  });

  const canRunOrSubmit = Boolean(cp?.id && code.trim());
  const showStatementPane = activeTab === 'statement' && maximizedPane !== 'editor';
  const showEditorPane = activeTab === 'statement' && maximizedPane !== 'statement';
  const paneSizeStyle: CSSProperties & Record<'--statement-pane-width', string> = {
    '--statement-pane-width': `${leftPanePercent}%`,
  };

  useEffect(() => {
    if (!showEditorPane) return undefined;

    const resizeEditor = () => {
      editorRef.current?.resize?.();
    };

    const timeoutId = window.setTimeout(resizeEditor, 0);
    window.addEventListener('resize', resizeEditor);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('resize', resizeEditor);
    };
  }, [showEditorPane, maximizedPane, leftPanePercent, language, theme]);

  if (!problem) {
    return (
      <AppShell fullWidth mainClassName="px-0 py-0 sm:px-0">
        <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-slate-50 px-4">
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400 shadow-sm">
            Problem unavailable right now.
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell fullWidth mainClassName="px-0 py-0 sm:px-0">
      <AnnouncementModal />
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-slate-50 lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
          <button
            type="button"
            onClick={() => navigate(`/contests/${contestPathId}/problems`)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
          >
            <ArrowLeft size={17} />
            Back
          </button>

          <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 px-4 md:flex">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-sm font-extrabold text-white">
              {currentProblemLabel}
            </span>
            <span className="truncate text-sm font-extrabold text-slate-900">{problem.title}</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {previousContestProblem ? (
              <Link
                to={problemHref(previousProblemLabel)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-extrabold text-slate-700 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
              >
                <ChevronLeft size={15} />
                <span className="hidden sm:inline">Prev Problem</span>
              </Link>
            ) : (
              <span className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-extrabold text-slate-300">
                <ChevronLeft size={15} />
                <span className="hidden sm:inline">Prev Problem</span>
              </span>
            )}

            {nextContestProblem ? (
              <Link
                to={problemHref(nextProblemLabel)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-extrabold text-slate-700 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
              >
                <span className="hidden sm:inline">Next Problem</span>
                <ChevronRight size={15} />
              </Link>
            ) : (
              <span className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-extrabold text-slate-300">
                <span className="hidden sm:inline">Next Problem</span>
                <ChevronRight size={15} />
              </span>
            )}

            <div className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-extrabold text-white">
              <TimerReset size={15} />
              <span className="hidden sm:inline">{contestTimeLabel(contest?.startTime, contest?.endTime, clockNow)}</span>
              <span className="sm:hidden">{contestCompactTime(contest?.startTime, contest?.endTime, clockNow)}</span>
            </div>
          </div>
        </div>

        <div className="flex h-12 shrink-0 items-center border-b border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setActiveTab('statement')}
            className={`h-full border-b-2 px-5 text-sm font-extrabold transition-colors ${activeTab === 'statement' ? 'border-teal-700 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
          >
            Statement
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('submissions')}
            className={`h-full border-b-2 px-5 text-sm font-extrabold transition-colors ${activeTab === 'submissions' ? 'border-teal-700 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
          >
            My Submissions
          </button>
        </div>

        {activeTab === 'statement' && (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row" style={paneSizeStyle}>
            {showStatementPane && (
              <section className={`min-h-[520px] overflow-hidden border-r border-slate-200 bg-white lg:min-h-0 lg:min-w-[320px] ${maximizedPane ? 'lg:flex-1' : 'lg:flex-none lg:basis-[var(--statement-pane-width)]'}`}>
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
                    <div className="min-w-0">
                      <h1 className="truncate text-base font-extrabold text-slate-950">
                        {currentProblemLabel}. {problem.title}
                      </h1>
                    </div>
                    <button
                      type="button"
                      onClick={() => togglePane('statement')}
                      className="rounded-lg p-2 text-teal-700 hover:bg-teal-50"
                      aria-label={maximizedPane === 'statement' ? 'Restore statement pane' : 'Maximize statement pane'}
                      title={maximizedPane === 'statement' ? 'Restore' : 'Maximize'}
                    >
                      {maximizedPane === 'statement' ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto px-5 py-6 oj-scrollbar">
                    <article
                      className="max-w-4xl select-none space-y-7 text-[15px] leading-7 text-slate-700"
                      onCopy={(event) => event.preventDefault()}
                      onCut={(event) => event.preventDefault()}
                    >
                      <section>
                        <pre className="whitespace-pre-wrap font-sans">{textOrDash(problem.statement)}</pre>
                      </section>

                      {problem.inputDescription && (
                        <section>
                          <h2 className="mb-2 text-xl font-extrabold text-slate-900">Input Format</h2>
                          <pre className="whitespace-pre-wrap font-sans">{problem.inputDescription}</pre>
                        </section>
                      )}

                      {problem.outputDescription && (
                        <section>
                          <h2 className="mb-2 text-xl font-extrabold text-slate-900">Output Format</h2>
                          <pre className="whitespace-pre-wrap font-sans">{problem.outputDescription}</pre>
                        </section>
                      )}

                      {problem.sampleTestCases?.length > 0 && (
                        <section>
                          <h2 className="mb-3 text-xl font-extrabold text-slate-900">Sample {problem.sampleTestCases.length > 1 ? 'Cases' : 'Case'}</h2>
                          <div className="space-y-5">
                            {problem.sampleTestCases.map((testCase: any, index: number) => (
                              <div key={`sample-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                <div className="grid border-b border-slate-200 bg-slate-50 text-sm font-bold text-slate-600 sm:grid-cols-2">
                                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:border-b-0 sm:border-r">
                                    <span>Input</span>
                                    <button
                                      type="button"
                                      onClick={() => void copyBlock(testCase.input, `Sample ${index + 1} input`, `sample-${index}-input`)}
                                      className="rounded-md p-1.5 text-teal-700 hover:bg-teal-50"
                                      aria-label={`Copy sample ${index + 1} input`}
                                      title="Copy input"
                                    >
                                      {copiedKey === `sample-${index}-input` ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                                    </button>
                                  </div>
                                  <div className="flex items-center justify-between px-4 py-3">
                                    <span>Output</span>
                                    <button
                                      type="button"
                                      onClick={() => void copyBlock(testCase.output, `Sample ${index + 1} output`, `sample-${index}-output`)}
                                      className="rounded-md p-1.5 text-teal-700 hover:bg-teal-50"
                                      aria-label={`Copy sample ${index + 1} output`}
                                      title="Copy output"
                                    >
                                      {copiedKey === `sample-${index}-output` ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                                    </button>
                                  </div>
                                </div>
                                <div className="grid sm:grid-cols-2">
                                  <pre className="min-h-28 overflow-auto border-b border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-800 sm:border-b-0 sm:border-r whitespace-pre-wrap">{testCase.input}</pre>
                                  <pre className="min-h-28 overflow-auto bg-slate-50 p-4 font-mono text-sm text-slate-800 whitespace-pre-wrap">{testCase.output}</pre>
                                </div>
                                {(testCase.note || testCase.explanation) && (
                                  <div className="border-t border-slate-200 px-4 py-3">
                                    <p className="mb-1 text-sm font-extrabold text-slate-900">Explanation</p>
                                    <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{testCase.note ?? testCase.explanation}</pre>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                      <section className="border-t border-slate-200 pt-6">
                        <h2 className="mb-4 text-xl font-extrabold text-slate-900">More Info</h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <div className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-500">
                              <Clock3 size={15} />
                              Time limit
                            </div>
                            <p className="text-base font-extrabold text-slate-900">{formatTimeLimit(problem.timeLimitMs)}</p>
                          </div>
                          <div>
                            <div className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-500">
                              <HardDrive size={15} />
                              Memory limit
                            </div>
                            <p className="text-base font-extrabold text-slate-900">{formatMemoryLimit(problem.memoryLimitKb)}</p>
                          </div>
                        </div>
                      </section>
                    </article>
                  </div>
                </div>
              </section>
            )}

            {showStatementPane && showEditorPane && (
              <div
                role="separator"
                aria-label="Resize statement and editor panes"
                aria-orientation="vertical"
                tabIndex={0}
                onMouseDown={handleDividerMouseDown}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  setLeftPanePercent((current) => {
                    const next = current + (event.key === 'ArrowLeft' ? -4 : 4);
                    return Math.max(30, Math.min(70, next));
                  });
                }}
                className="hidden w-2 shrink-0 cursor-col-resize items-center justify-center bg-slate-100 outline-none transition-colors hover:bg-teal-100 focus:bg-teal-100 lg:flex"
              >
                <span className="h-16 w-0.5 rounded-full bg-slate-300" />
              </div>
            )}

            {showEditorPane && (
              <section className="min-w-0 overflow-hidden bg-slate-100 lg:min-h-0 lg:flex-1">
                <div className="flex min-h-0 flex-col lg:h-full">
                  <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
                    <select
                      value={language}
                      onChange={(event) => handleLanguageChange(event.target.value)}
                      className="h-8 min-w-36 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-teal-500"
                      aria-label="Language"
                    >
                      {LANGUAGE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>

                    <div className="flex min-w-0 items-center gap-2">
                      <select
                        value={theme}
                        onChange={(event) => setTheme(event.target.value)}
                        className="h-8 w-40 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-teal-500"
                        aria-label="Editor theme"
                      >
                        {THEME_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => togglePane('editor')}
                        className="rounded-lg p-2 text-teal-700 hover:bg-teal-50"
                        aria-label={maximizedPane === 'editor' ? 'Restore editor pane' : 'Maximize editor pane'}
                        title={maximizedPane === 'editor' ? 'Restore' : 'Maximize'}
                      >
                        {maximizedPane === 'editor' ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                      </button>
                    </div>
                  </div>

                  <div className="h-[420px] shrink-0 overflow-hidden bg-[#1f231f] sm:h-[460px] lg:h-auto lg:min-h-0 lg:flex-1">
                    <AceEditor
                      mode={LANG_MODES[language] ?? 'c_cpp'}
                      theme={theme}
                      value={code}
                      onChange={setCode}
                      onLoad={(editor) => {
                        editorRef.current = editor;
                        window.setTimeout(() => editor.resize(), 0);
                      }}
                      onFocus={() => editorRef.current?.resize?.()}
                      name="contest-problem-codechef-editor"
                      width="100%"
                      height="100%"
                      fontSize={14}
                      setOptions={{
                        useWorker: false,
                        showPrintMargin: false,
                        wrap: true,
                        tabSize: 2,
                      }}
                      editorProps={{ $blockScrolling: true }}
                    />
                  </div>

                  <div className="shrink-0 border-t border-slate-200 bg-white">
                    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <label className="mb-2 block text-sm font-extrabold text-slate-800" htmlFor="custom-input">
                        Test against Custom Input
                      </label>
                      <textarea
                        id="custom-input"
                        value={customInput}
                        onChange={(event) => setCustomInput(event.target.value)}
                        className="h-24 w-full resize-none rounded-md border border-slate-300 bg-white p-3 font-mono text-sm text-slate-800 outline-none focus:border-teal-500"
                        spellCheck={false}
                      />
                    </div>

                    {runResult && (
                      <div className="max-h-72 overflow-auto border-b border-slate-200 bg-white p-4 oj-scrollbar">
                        <div className="border-l-4 border-slate-300 bg-slate-50 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-extrabold text-slate-900">Status :</span>
                            {isRunSuccess(runResult.verdict) ? (
                              <CheckCircle2 size={16} className="text-emerald-600" />
                            ) : (
                              <XCircle size={16} className="text-rose-600" />
                            )}
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 ${runVerdictClass(runResult.verdict)}`}>
                              {runVerdictLabel(runResult.verdict)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 grid max-w-md grid-cols-2 divide-x divide-slate-200 text-sm">
                          <div>
                            <p className="font-extrabold text-slate-700">Time:</p>
                            <p className="mt-1 text-slate-500">{formatMetric(runResult.executionTimeMs, ' ms')}</p>
                          </div>
                          <div className="pl-8">
                            <p className="font-extrabold text-slate-700">Memory:</p>
                            <p className="mt-1 text-slate-500">{formatMetric(runResult.memoryUsedKb, ' KB')}</p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-3">
                          <div>
                            <p className="mb-1 text-sm font-extrabold text-slate-700">Custom Input</p>
                            <pre className="max-h-36 overflow-auto bg-slate-100 p-4 font-mono text-sm text-slate-700 whitespace-pre-wrap">{textOrDash(runResult.input)}</pre>
                          </div>
                          <div>
                            <p className="mb-1 text-sm font-extrabold text-slate-700">Your Output</p>
                            <pre className="max-h-36 overflow-auto bg-slate-100 p-4 font-mono text-sm text-slate-700 whitespace-pre-wrap">{textOrDash(runResult.output)}</pre>
                          </div>
                          {(runResult.compileOutput || runResult.judgeMessage) && (
                            <div>
                              <p className="mb-1 text-sm font-extrabold text-slate-700">Details</p>
                              <pre className="max-h-32 overflow-auto bg-slate-950 p-4 font-mono text-xs text-slate-50 whitespace-pre-wrap">
                                {textOrDash(runResult.compileOutput || runResult.judgeMessage)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-3">
                      <button
                        type="button"
                        className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl border border-teal-700 bg-white px-5 py-2.5 text-sm font-extrabold text-teal-700 shadow-sm transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={runInputMutation.isPending || !canRunOrSubmit}
                        onClick={() => runInputMutation.mutate()}
                      >
                        <Play size={15} />
                        {runInputMutation.isPending ? 'Running...' : 'Run'}
                      </button>
                      <button
                        type="button"
                        className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl border border-teal-700 bg-teal-700 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={submitMutation.isPending || !canRunOrSubmit}
                        onClick={() => submitMutation.mutate()}
                      >
                        <Send size={15} />
                        {submitMutation.isPending ? 'Submitting...' : 'Submit'}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'submissions' && (
          <div className="min-h-0 flex-1 overflow-auto bg-white p-4 oj-scrollbar">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                <ListChecks size={17} className="text-slate-500" />
                <h2 className="text-sm font-extrabold text-slate-900">My Submissions for {currentProblemLabel}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="oj-table min-w-[840px]">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Who</th>
                      <th>Problem</th>
                      <th>When</th>
                      <th>Lang</th>
                      <th>Verdict</th>
                      <th>Time</th>
                      <th>Memory</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problemSubmissions.map((submission: any) => {
                      const verdict = getEffectiveVerdict(submission);
                      return (
                        <tr key={submission.id}>
                          <td className="font-mono text-xs">
                            <button
                              type="button"
                              onClick={() => setSelectedSubmissionId(submission.id)}
                              className="font-bold text-teal-700 hover:underline"
                            >
                              #{submission.submissionDisplayId}
                            </button>
                          </td>
                          <td>{submission.participantName ?? submission.participantId ?? '-'}</td>
                          <td>{currentProblemLabel}. {problem.title}</td>
                          <td className="text-slate-500">{new Date(submission.submittedAt).toLocaleString()}</td>
                          <td>{submission.language ?? '-'}</td>
                          <td>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getVerdictBadgeClass(verdict)}`}>
                              {verdict}
                            </span>
                          </td>
                          <td>{submission.executionTimeMs != null ? `${submission.executionTimeMs} ms` : '-'}</td>
                          <td>{submission.memoryUsedKb != null ? `${submission.memoryUsedKb} KB` : '-'}</td>
                        </tr>
                      );
                    })}
                    {!problemSubmissions.length && (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-slate-400">No submissions for this problem yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!selectedSubmission}
        title={selectedSubmission ? `Submission #${selectedSubmission.submissionDisplayId}` : 'Submission'}
        onClose={() => setSelectedSubmissionId(null)}
        maxWidthClass="max-w-4xl"
      >
        {selectedSubmission && (
          <div className="space-y-3 text-sm">
            <p><span className="font-semibold">Problem:</span> {currentProblemLabel}. {problem.title}</p>
            <p><span className="font-semibold">Language:</span> {selectedSubmission.language ?? '-'}</p>
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
                className="font-semibold text-teal-700 hover:underline"
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
