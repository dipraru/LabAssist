import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import AceEditor from 'react-ace';
import toast from 'react-hot-toast';
import { Clock3, Play, Send, Upload } from 'lucide-react';
import 'ace-builds/src-noconflict/mode-c_cpp';
import 'ace-builds/src-noconflict/mode-java';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-typescript';
import 'ace-builds/src-noconflict/theme-monokai';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { courseCode, courseTitle } from '../../lib/display';

const LANG_MODES: Record<string, string> = {
  c: 'c_cpp',
  cpp: 'c_cpp',
  java: 'java',
  python: 'python',
  python3: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
};

const LANGUAGES = ['c', 'cpp', 'java', 'python3', 'javascript', 'typescript'];

function humanize(value: string | null | undefined) {
  return `${value ?? ''}`
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function verdictBadge(verdict: string | null | undefined) {
  switch (verdict) {
    case 'accepted':
      return 'bg-emerald-100 text-emerald-700';
    case 'wrong_answer':
      return 'bg-rose-100 text-rose-700';
    case 'time_limit_exceeded':
    case 'memory_limit_exceeded':
    case 'runtime_error':
    case 'compilation_error':
      return 'bg-amber-100 text-amber-700';
    case 'manual_review':
      return 'bg-violet-100 text-violet-700';
    case 'pending':
    case 'judging':
      return 'bg-sky-100 text-sky-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function statusBadge(status: string) {
  if (status === 'running') return 'bg-emerald-100 text-emerald-700';
  if (status === 'ended') return 'bg-slate-100 text-slate-600';
  return 'bg-amber-100 text-amber-700';
}

function Countdown({
  endTime,
  onEnded,
}: {
  endTime: string;
  onEnded?: () => void;
}) {
  const [remaining, setRemaining] = useState('');
  const endedRef = useRef(false);

  useEffect(() => {
    endedRef.current = false;
    const tick = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining('Ended');
        if (!endedRef.current) {
          endedRef.current = true;
          onEnded?.();
        }
        return;
      }

      const hours = Math.floor(diff / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1000);
      setRemaining(`${hours}h ${minutes}m ${seconds}s`);
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [endTime, onEnded]);

  return <span className="font-mono text-sm font-semibold text-indigo-700">{remaining}</span>;
}

export function StudentLabTests() {
  const queryClient = useQueryClient();
  const { labTestId } = useParams<{ labTestId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [language, setLanguage] = useState('cpp');
  const [code, setCode] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [useFile, setUseFile] = useState(false);
  const [runResult, setRunResult] = useState<any | null>(null);
  const [leftPaneTab, setLeftPaneTab] = useState<'statement' | 'submissions'>(
    'statement',
  );
  const autoSubmittedRef = useRef(false);

  const filterCourse = searchParams.get('courseId') ?? '';
  const filterKind =
    searchParams.get('kind') === 'lab_task' ? 'lab_task' : 'lab_test';

  const { data: courses = [] } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/my').then((response) => response.data),
  });

  useEffect(() => {
    if (!filterCourse && (courses as any[]).length > 0) {
      const next = new URLSearchParams(searchParams);
      next.set('courseId', (courses as any[])[0].id);
      next.set('kind', filterKind);
      setSearchParams(next, { replace: true });
    }
  }, [courses, filterCourse, filterKind, searchParams, setSearchParams]);

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ['student-lab-tests', filterCourse, filterKind],
    queryFn: () =>
      api
        .get(`/lab-tests/course/${filterCourse}`, {
          params: { kind: filterKind },
        })
        .then((response) => response.data),
    enabled: Boolean(filterCourse),
  });

  const { data: selectedActivity, isLoading: selectedActivityLoading } = useQuery({
    queryKey: ['student-lab-test-detail', labTestId],
    queryFn: () => api.get(`/lab-tests/${labTestId}`).then((response) => response.data),
    enabled: Boolean(labTestId),
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 5000 : false,
  });

  useEffect(() => {
    if (!labTestId || !selectedActivity?.courseId) return;
    if (selectedActivity.courseId === filterCourse && selectedActivity.activityKind === filterKind) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.set('courseId', selectedActivity.courseId);
    next.set('kind', selectedActivity.activityKind ?? 'lab_test');
    setSearchParams(next, { replace: true });
  }, [filterCourse, filterKind, labTestId, searchParams, selectedActivity, setSearchParams]);

  const { data: problems = [] } = useQuery({
    queryKey: ['student-lab-problems', labTestId],
    queryFn: () => api.get(`/lab-tests/${labTestId}/problems`).then((response) => response.data),
    enabled: Boolean(labTestId),
  });

  const selectedProblem = useMemo(
    () => (problems as any[]).find((problem: any) => problem.id === selectedProblemId) ?? null,
    [problems, selectedProblemId],
  );

  useEffect(() => {
    if (!(problems as any[]).length) {
      setSelectedProblemId(null);
      return;
    }

    if (
      selectedProblemId &&
      (problems as any[]).some((problem: any) => problem.id === selectedProblemId)
    ) {
      return;
    }

    setSelectedProblemId((problems as any[])[0].id);
  }, [problems, selectedProblemId]);

  const { data: mySubmissions = [] } = useQuery({
    queryKey: ['student-lab-submissions', labTestId],
    queryFn: () => api.get(`/lab-tests/${labTestId}/my-submissions`).then((response) => response.data),
    enabled: Boolean(labTestId),
    refetchInterval: selectedActivity?.status === 'running' ? 3000 : false,
  });

  const latestSubmissionForProblem = useMemo(() => {
    const map = new Map<string, any>();
    (mySubmissions as any[]).forEach((submission: any) => {
      if (!map.has(submission.problemId)) {
        map.set(submission.problemId, submission);
      }
    });
    return map;
  }, [mySubmissions]);

  const currentProblemSubmissions = useMemo(
    () =>
      (mySubmissions as any[]).filter((submission: any) =>
        selectedProblemId ? submission.problemId === selectedProblemId : false,
      ),
    [mySubmissions, selectedProblemId],
  );

  const runMutation = useMutation({
    mutationFn: () =>
      api.post(`/lab-tests/problems/${selectedProblemId}/run`, {
        code,
        language,
      }),
    onSuccess: (response) => {
      setRunResult(response.data);
      toast.success('Run completed');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Run failed');
    },
  });

  const submitMutation = useMutation({
    mutationFn: async ({
      silent = false,
      auto = false,
    }: {
      silent?: boolean;
      auto?: boolean;
    } = {}) => {
      const formData = new FormData();
      formData.append('language', language);
      if (useFile && file) {
        formData.append('file', file);
      } else {
        formData.append('code', code);
      }

      const response = await api.post(
        `/lab-tests/${labTestId}/problems/${selectedProblemId}/submit`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      );

      return { response: response.data, silent, auto };
    },
    onSuccess: ({ response, silent, auto }) => {
      queryClient.invalidateQueries({ queryKey: ['student-lab-submissions', labTestId] });
      queryClient.invalidateQueries({ queryKey: ['student-lab-test-detail', labTestId] });
      if (!silent) {
        toast.success('Solution submitted');
      } else if (auto) {
        toast.success('Time ended, current work was submitted automatically');
      }
      setRunResult(null);
      if (response?.problemId) {
        setSelectedProblemId(response.problemId);
      }
    },
    onError: (error: any, variables) => {
      if (!variables?.silent) {
        toast.error(error.response?.data?.message ?? 'Submission failed');
      }
    },
  });

  useEffect(() => {
    autoSubmittedRef.current = false;
  }, [labTestId, selectedProblemId]);

  useEffect(() => {
    setLeftPaneTab('statement');
  }, [selectedProblemId, labTestId]);

  const tryAutoSubmit = () => {
    if (autoSubmittedRef.current) return;
    if (!selectedActivity || selectedActivity.status !== 'running') return;
    if (!selectedProblemId) return;
    if ((!useFile && !code.trim()) || (useFile && !file)) return;
    autoSubmittedRef.current = true;
    submitMutation.mutate({ silent: true, auto: true });
  };

  return (
    <AppShell>
      <div
        className={
          labTestId
            ? 'space-y-4'
            : 'mx-auto max-w-[1560px] space-y-6'
        }
      >
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Student Workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">
                {filterKind === 'lab_task' ? 'Lab Tasks' : 'Lab Tests'}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Solve judge-style course activities, run against visible samples, and keep your
                final submission history in one place.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <select
                value={filterCourse}
                onChange={(event) => {
                  const next = new URLSearchParams(searchParams);
                  next.set('courseId', event.target.value);
                  next.set('kind', filterKind);
                  setSearchParams(next, { replace: true });
                }}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select course</option>
                {(courses as any[]).map((course: any) => (
                  <option key={course.id} value={course.id}>
                    {courseCode(course)} - {courseTitle(course)}
                  </option>
                ))}
              </select>

              <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1">
                {[
                  { value: 'lab_test', label: 'Lab Tests' },
                  { value: 'lab_task', label: 'Lab Tasks' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.set('kind', item.value);
                      if (filterCourse) next.set('courseId', filterCourse);
                      setSearchParams(next, { replace: true });
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      filterKind === item.value
                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {!labTestId ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activitiesLoading
              ? [1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-40 animate-pulse rounded-[24px] border border-slate-200 bg-white"
                  />
                ))
              : null}

            {!activitiesLoading &&
              (activities as any[]).map((activity: any) => (
                <a
                  key={activity.id}
                  href={`/student/lab-tests/${activity.id}?courseId=${activity.courseId}&kind=${activity.activityKind}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">{activity.title}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {activity.activityKind === 'lab_task' ? 'Lab Task' : 'Lab Test'} ·{' '}
                        {humanize(activity.type)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(
                        activity.status,
                      )}`}
                    >
                      {humanize(activity.status)}
                    </span>
                  </div>

                  <div className="mt-5 space-y-2 text-sm text-slate-500">
                    <p>{new Date(activity.startTime).toLocaleString()}</p>
                    <p>{new Date(activity.endTime).toLocaleString()}</p>
                  </div>
                </a>
              ))}

            {!activitiesLoading && !(activities as any[]).length ? (
              <div className="col-span-full rounded-[24px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
                {filterCourse
                  ? `No ${filterKind === 'lab_task' ? 'lab tasks' : 'lab tests'} found for this course.`
                  : 'Select a course to see activities.'}
              </div>
            ) : null}
          </section>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Link
                to={`/student/lab-tests?courseId=${filterCourse}&kind=${filterKind}`}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Back to all {filterKind === 'lab_task' ? 'lab tasks' : 'lab tests'}
              </Link>
            </div>

            {selectedActivityLoading || !selectedActivity ? (
              <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
                Loading activity...
              </div>
            ) : (
              <>
                <section className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(
                            selectedActivity.status,
                          )}`}
                        >
                          {humanize(selectedActivity.status)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {selectedActivity.activityKind === 'lab_task'
                            ? 'Lab Task'
                            : 'Lab Test'}
                        </span>
                      </div>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                        {selectedActivity.title}
                      </h2>
                      {selectedActivity.description ? (
                        <p className="mt-1.5 text-sm text-slate-600">
                          {selectedActivity.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Clock3 size={16} />
                        {selectedActivity.status === 'running' ? (
                          <Countdown endTime={selectedActivity.endTime} onEnded={tryAutoSubmit} />
                        ) : (
                          <span className="text-sm font-medium">
                            {selectedActivity.status === 'ended' ? 'Ended' : 'Not started'}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Ends at {new Date(selectedActivity.endTime).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </section>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(640px,0.95fr)]">
                  <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {(problems as any[]).map((problem: any, index: number) => {
                          const latest = latestSubmissionForProblem.get(problem.id);
                          const verdict =
                            latest?.manualVerdict && latest.manualVerdict !== 'pending'
                              ? latest.manualVerdict
                              : latest?.submissionStatus;

                          return (
                            <button
                              key={problem.id}
                              type="button"
                              onClick={() => setSelectedProblemId(problem.id)}
                              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                                selectedProblemId === problem.id
                                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <span>
                                {selectedActivity.activityKind === 'lab_task'
                                  ? 'Task'
                                  : `P${index + 1}`}
                              </span>
                              {verdict ? (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${verdictBadge(
                                    verdict,
                                  )}`}
                                >
                                  {humanize(verdict)}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-b border-slate-200 px-4">
                      <div className="flex gap-2">
                        {[
                          { key: 'statement', label: 'Statement' },
                          { key: 'submissions', label: 'My Submissions' },
                        ].map((tab) => (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() =>
                              setLeftPaneTab(tab.key as 'statement' | 'submissions')
                            }
                            className={`border-b-2 px-3 py-3 text-sm font-medium transition ${
                              leftPaneTab === tab.key
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-slate-500 hover:text-slate-900'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="h-[calc(100vh-15rem)] overflow-y-auto px-5 py-5">
                      {!selectedProblem ? (
                        <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                          Select a problem to view the statement.
                        </div>
                      ) : leftPaneTab === 'statement' ? (
                        <article className="space-y-6">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                              {selectedActivity.activityKind === 'lab_task' ? 'Task' : 'Problem'}
                            </span>
                            <span className="text-sm text-slate-500">
                              {selectedProblem.marks ?? 0} marks · {selectedProblem.timeLimitMs ?? 1000}{' '}
                              ms · {selectedProblem.memoryLimitKb ?? 262144} KB
                            </span>
                          </div>
                          <div>
                            <h3 className="text-3xl font-semibold text-slate-900">
                              {selectedProblem.title}
                            </h3>
                            <p className="mt-2 text-sm text-slate-500">
                              Read the statement here and code on the right.
                            </p>
                          </div>
                          <div className="whitespace-pre-wrap text-[15px] leading-8 text-slate-700">
                            {selectedProblem.statement}
                          </div>

                          {selectedProblem.inputDescription ? (
                            <section>
                              <h4 className="text-lg font-semibold text-slate-900">Input</h4>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">
                                {selectedProblem.inputDescription}
                              </p>
                            </section>
                          ) : null}

                          {selectedProblem.outputDescription ? (
                            <section>
                              <h4 className="text-lg font-semibold text-slate-900">Output</h4>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">
                                {selectedProblem.outputDescription}
                              </p>
                            </section>
                          ) : null}

                          {(selectedProblem.sampleTestCases ?? []).length ? (
                            <section className="space-y-4">
                              <h4 className="text-lg font-semibold text-slate-900">
                                Sample Test Cases
                              </h4>
                              {(selectedProblem.sampleTestCases ?? []).map(
                                (sample: any, index: number) => (
                                  <div
                                    key={`${selectedProblem.id}-${index}`}
                                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                  >
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                      Sample {index + 1}
                                    </p>
                                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                      <div>
                                        <p className="mb-2 text-xs font-medium text-slate-500">
                                          Input
                                        </p>
                                        <pre className="overflow-auto rounded-xl bg-white p-3 text-xs text-slate-700">
                                          {sample.input}
                                        </pre>
                                      </div>
                                      <div>
                                        <p className="mb-2 text-xs font-medium text-slate-500">
                                          Output
                                        </p>
                                        <pre className="overflow-auto rounded-xl bg-white p-3 text-xs text-slate-700">
                                          {sample.output}
                                        </pre>
                                      </div>
                                    </div>
                                    {sample.explanation ? (
                                      <p className="mt-3 text-xs text-slate-500">
                                        {sample.explanation}
                                      </p>
                                    ) : null}
                                  </div>
                                ),
                              )}
                            </section>
                          ) : null}
                        </article>
                      ) : (
                        <div className="space-y-3">
                          {currentProblemSubmissions.length ? (
                            currentProblemSubmissions.map((submission: any) => {
                              const verdict =
                                submission.manualVerdict &&
                                submission.manualVerdict !== 'pending'
                                  ? submission.manualVerdict
                                  : submission.submissionStatus;
                              return (
                                <div
                                  key={submission.id}
                                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-medium text-slate-900">
                                        {new Date(
                                          submission.submittedAt,
                                        ).toLocaleString()}
                                      </p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        Score: {submission.score ?? '—'} · Time:{' '}
                                        {submission.executionTimeMs ?? '—'} ms · Memory:{' '}
                                        {submission.memoryUsedKb ?? '—'} KB
                                      </p>
                                    </div>
                                    <span
                                      className={`rounded-full px-2 py-1 text-[11px] font-medium ${verdictBadge(
                                        verdict,
                                      )}`}
                                    >
                                      {humanize(verdict)}
                                    </span>
                                  </div>
                                  {submission.judgeMessage ? (
                                    <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-slate-600">
                                      {submission.judgeMessage}
                                    </p>
                                  ) : null}
                                  {submission.instructorNote ? (
                                    <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-600">
                                      {submission.instructorNote}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })
                          ) : (
                            <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                              No submissions yet for this problem.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">Editor</h3>
                            <p className="text-sm text-slate-500">
                              Code on the right, read on the left.
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setUseFile(false)}
                              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                                !useFile
                                  ? 'bg-indigo-600 text-white'
                                  : 'border border-slate-300 bg-white text-slate-700'
                              }`}
                            >
                              Editor
                            </button>
                            <button
                              type="button"
                              onClick={() => setUseFile(true)}
                              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                                useFile
                                  ? 'bg-indigo-600 text-white'
                                  : 'border border-slate-300 bg-white text-slate-700'
                              }`}
                            >
                              Upload Code
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="text-sm font-medium text-slate-700">
                              Language
                            </label>
                            <select
                              value={language}
                              onChange={(event) => setLanguage(event.target.value)}
                              className="min-w-[180px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                            >
                              {LANGUAGES.map((item) => (
                                <option key={item} value={item}>
                                  {item}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => runMutation.mutate()}
                              disabled={
                                useFile ||
                                selectedActivity.status !== 'running' ||
                                !code.trim() ||
                                runMutation.isPending
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Play size={16} />
                              {runMutation.isPending ? 'Running...' : 'Run on Samples'}
                            </button>
                            <button
                              type="button"
                              onClick={() => submitMutation.mutate({})}
                              disabled={
                                selectedActivity.status !== 'running' ||
                                submitMutation.isPending ||
                                (!useFile && !code.trim()) ||
                                (useFile && !file)
                              }
                              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Send size={16} />
                              {submitMutation.isPending ? 'Submitting...' : 'Submit'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid h-[calc(100vh-15rem)] grid-rows-[minmax(0,1fr)_auto_auto]">
                      <div className="min-h-0 bg-[#171b26]">
                        {!useFile ? (
                          <AceEditor
                            mode={LANG_MODES[language] ?? 'c_cpp'}
                            theme="monokai"
                            value={code}
                            onChange={setCode}
                            name="student-lab-editor"
                            width="100%"
                            height="100%"
                            fontSize={14}
                            setOptions={{ useWorker: false, showPrintMargin: false }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center p-6">
                            <label
                              className={`flex w-full max-w-xl cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-6 ${
                                file
                                  ? 'border-indigo-400 bg-indigo-50'
                                  : 'border-slate-300 bg-slate-50'
                              }`}
                            >
                              <Upload size={16} className="text-slate-500" />
                              <span className="text-sm text-slate-600">
                                {file ? file.name : 'Choose a source file to submit'}
                              </span>
                              <input
                                type="file"
                                className="hidden"
                                onChange={(event) =>
                                  setFile(event.target.files?.[0] ?? null)
                                }
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      <div className="border-t border-slate-200 px-4 py-3">
                        {selectedActivity.status !== 'running' ? (
                          <p className="text-sm text-slate-500">
                            {selectedActivity.status === 'ended'
                              ? 'This activity has ended. The final auto-submit only works while the page is open.'
                              : 'This activity has not started yet.'}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500">
                            If the timer ends while this page is open, your current editor or
                            selected file will be submitted automatically once.
                          </p>
                        )}
                      </div>

                      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <h4 className="text-sm font-semibold text-slate-900">
                              Latest Run Result
                            </h4>
                            {!runResult ? (
                              <p className="mt-2 text-sm text-slate-500">
                                Run your code on visible sample tests to preview the verdict.
                              </p>
                            ) : (
                              <div className="mt-3 space-y-3">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${verdictBadge(
                                    runResult.verdict,
                                  )}`}
                                >
                                  {humanize(runResult.verdict)}
                                </span>
                                <div className="grid gap-2 text-sm text-slate-600">
                                  <p>Time: {runResult.executionTimeMs ?? '—'} ms</p>
                                  <p>Memory: {runResult.memoryUsedKb ?? '—'} KB</p>
                                  {runResult.judgeMessage ? (
                                    <p>{runResult.judgeMessage}</p>
                                  ) : null}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <h4 className="text-sm font-semibold text-slate-900">
                              Current Problem History
                            </h4>
                            {currentProblemSubmissions.length ? (
                              <div className="mt-3 space-y-2">
                                {currentProblemSubmissions.slice(0, 3).map((submission: any) => {
                                  const verdict =
                                    submission.manualVerdict &&
                                    submission.manualVerdict !== 'pending'
                                      ? submission.manualVerdict
                                      : submission.submissionStatus;
                                  return (
                                    <div
                                      key={submission.id}
                                      className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
                                    >
                                      <span className="text-xs text-slate-500">
                                        {new Date(
                                          submission.submittedAt,
                                        ).toLocaleTimeString()}
                                      </span>
                                      <span
                                        className={`rounded-full px-2 py-1 text-[11px] font-medium ${verdictBadge(
                                          verdict,
                                        )}`}
                                      >
                                        {humanize(verdict)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="mt-2 text-sm text-slate-500">
                                No submissions yet for this problem.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
