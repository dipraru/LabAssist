import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import AceEditor from 'react-ace';
import toast from 'react-hot-toast';
import { ArrowRight, CalendarClock, Play, Send, Upload } from 'lucide-react';
import 'ace-builds/src-noconflict/mode-c_cpp';
import 'ace-builds/src-noconflict/mode-java';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-typescript';
import 'ace-builds/src-noconflict/theme-github';
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

function statusSurface(status: string) {
  if (status === 'running') {
    return 'border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_100%)]';
  }
  if (status === 'ended') {
    return 'border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)]';
  }
  return 'border-amber-200 bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_100%)]';
}

function getActivityDisplayTitle(activity: any): string {
  if (activity?.title?.trim()) {
    return activity.title.trim();
  }

  if (activity?.activityKind === 'lab_task') {
    if (activity?.labClass?.labNumber) {
      return `Lab ${activity.labClass.labNumber} Task`;
    }
    return 'Lab Task';
  }

  return 'Lab Test';
}

function getActivityDuration(activity: any): number {
  if (activity?.durationMinutes && activity.durationMinutes > 0) {
    return activity.durationMinutes;
  }

  if (activity?.startTime && activity?.endTime) {
    const diff = new Date(activity.endTime).getTime() - new Date(activity.startTime).getTime();
    if (Number.isFinite(diff) && diff > 0) {
      return Math.max(1, Math.ceil(diff / 60_000));
    }
  }

  return 60;
}

function formatDateTimeLabel(value: string | null | undefined): string {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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
  const isFocusedWorkspace = Boolean(labTestId);
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
  const [fullscreenRequired, setFullscreenRequired] = useState(false);
  const [proctoringWarnings, setProctoringWarnings] = useState<string[]>([]);
  const autoSubmittedRef = useRef(false);
  const fullscreenStartedRef = useRef(false);
  const lastViolationAtRef = useRef<Record<string, number>>({});

  const filterCourse = searchParams.get('courseId') ?? '';
  const filterKind =
    searchParams.get('kind') === 'lab_task' ? 'lab_task' : 'lab_test';

  const { data: courses = [] } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/my').then((response) => response.data),
  });

  useEffect(() => {
    if (isFocusedWorkspace) return;
    if (!filterCourse && (courses as any[]).length > 0) {
      const next = new URLSearchParams(searchParams);
      next.set('courseId', (courses as any[])[0].id);
      next.set('kind', filterKind);
      setSearchParams(next, { replace: true });
    }
  }, [courses, filterCourse, filterKind, isFocusedWorkspace, searchParams, setSearchParams]);

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ['student-lab-tests', filterCourse, filterKind],
    queryFn: () =>
      api
        .get(`/lab-tests/course/${filterCourse}`, {
          params: { kind: filterKind },
        })
        .then((response) => response.data),
    enabled: Boolean(filterCourse) && !isFocusedWorkspace,
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
  const runningActivitiesCount = useMemo(
    () => (activities as any[]).filter((activity: any) => activity?.status === 'running').length,
    [activities],
  );
  const selectedCourseMeta = useMemo(
    () => (courses as any[]).find((course: any) => course.id === filterCourse) ?? null,
    [courses, filterCourse],
  );

  const proctoringActive = Boolean(
    labTestId && selectedActivity?.status === 'running',
  );

  const pushWarning = (message: string) => {
    setProctoringWarnings((current) => [message, ...current].slice(0, 4));
  };

  const reportViolation = async (
    eventType:
      | 'fullscreen_exit'
      | 'tab_hidden'
      | 'window_blur'
      | 'copy_blocked'
      | 'paste_blocked'
      | 'cut_blocked',
    message: string,
  ) => {
    if (!labTestId || !proctoringActive) return;

    const now = Date.now();
    const lastSentAt = lastViolationAtRef.current[eventType] ?? 0;
    if (now - lastSentAt < 4000) return;
    lastViolationAtRef.current[eventType] = now;

    pushWarning(message);
    toast.error(message, { id: `lab-proctor-${eventType}` });

    try {
      await api.post(`/lab-tests/${labTestId}/proctoring-events`, {
        eventType,
        problemId: selectedProblemId ?? undefined,
        message,
      });
    } catch {
      // Keep the student UI responsive even if the reporting request fails.
    }
  };

  const requestLabFullscreen = async () => {
    try {
      const target = document.documentElement;
      if (!document.fullscreenElement) {
        await target.requestFullscreen();
      }
      fullscreenStartedRef.current = true;
      setFullscreenRequired(false);
    } catch {
      toast.error('Fullscreen permission was denied. Please allow it to continue.');
      setFullscreenRequired(true);
    }
  };

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

  useEffect(() => {
    fullscreenStartedRef.current = false;
    lastViolationAtRef.current = {};
    setProctoringWarnings([]);
    setFullscreenRequired(Boolean(labTestId && selectedActivity?.status === 'running'));
  }, [labTestId, selectedActivity?.status]);

  useEffect(() => {
    if (!proctoringActive) {
      setFullscreenRequired(false);
      return;
    }

    setFullscreenRequired(!document.fullscreenElement);

    const handleFullscreenChange = () => {
      const isFullscreen = Boolean(document.fullscreenElement);
      setFullscreenRequired(!isFullscreen);

      if (!isFullscreen && fullscreenStartedRef.current) {
        reportViolation(
          'fullscreen_exit',
          'Fullscreen mode was exited during the active lab.',
        );
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        reportViolation(
          'tab_hidden',
          'Leaving the active lab tab was detected and reported.',
        );
      }
    };

    const handleWindowBlur = () => {
      if (document.visibilityState === 'visible') {
        reportViolation(
          'window_blur',
          'Moving focus away from the active lab window was detected.',
        );
      }
    };

    const handleClipboardEvent = (event: ClipboardEvent) => {
      event.preventDefault();
      const eventType =
        event.type === 'copy'
          ? 'copy_blocked'
          : event.type === 'cut'
            ? 'cut_blocked'
            : 'paste_blocked';
      const verb =
        event.type === 'copy'
          ? 'Copy'
          : event.type === 'cut'
            ? 'Cut'
            : 'Paste';

      reportViolation(
        eventType,
        `${verb} is disabled during this active lab activity.`,
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const modifierPressed = event.ctrlKey || event.metaKey;
      if (!modifierPressed) return;

      const key = event.key.toLowerCase();
      if (!['c', 'v', 'x'].includes(key)) return;

      event.preventDefault();
      const eventType =
        key === 'c'
          ? 'copy_blocked'
          : key === 'x'
            ? 'cut_blocked'
            : 'paste_blocked';
      const label = key === 'c' ? 'Copy' : key === 'x' ? 'Cut' : 'Paste';
      reportViolation(
        eventType,
        `${label} shortcut is disabled during this active lab activity.`,
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('copy', handleClipboardEvent);
    window.addEventListener('cut', handleClipboardEvent);
    window.addEventListener('paste', handleClipboardEvent);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('copy', handleClipboardEvent);
      window.removeEventListener('cut', handleClipboardEvent);
      window.removeEventListener('paste', handleClipboardEvent);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [labTestId, proctoringActive, selectedProblemId]);

  const tryAutoSubmit = () => {
    if (autoSubmittedRef.current) return;
    if (!selectedActivity || selectedActivity.status !== 'running') return;
    if (!selectedProblemId) return;
    if ((!useFile && !code.trim()) || (useFile && !file)) return;
    autoSubmittedRef.current = true;
    submitMutation.mutate({ silent: true, auto: true });
  };
  const detailBackHref = `/student/lab-tests?courseId=${
    selectedActivity?.courseId ?? filterCourse
  }&kind=${selectedActivity?.activityKind ?? filterKind}`;
  const workspacePanelHeightClass = isFocusedWorkspace
    ? 'h-[calc(100vh-9rem)]'
    : 'h-[calc(100vh-15rem)]';

  return (
    <AppShell>
      <div
        className={
          isFocusedWorkspace
            ? 'space-y-4'
            : 'mx-auto max-w-[1560px] space-y-6'
        }
      >
        {!isFocusedWorkspace ? (
          <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_70px_-42px_rgba(15,23,42,0.35)]">
            <div className="bg-[radial-gradient(circle_at_top_left,#0f172a,transparent_44%),linear-gradient(135deg,#082f49_0%,#1d4ed8_58%,#38bdf8_100%)] px-6 py-8 text-white sm:px-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-100/85">
                    Student Workspace
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
                    {filterKind === 'lab_task' ? 'Lab Tasks' : 'Lab Tests'}
                  </h1>
                  <p className="mt-3 text-sm leading-7 text-sky-50/85">
                    Review course activities, open the active workspace, and keep your submission
                    history in one place with the same structured feel as the teacher dashboard.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3 text-sm text-sky-50/90">
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                      {(activities as any[]).length} total{' '}
                      {filterKind === 'lab_task' ? 'tasks' : 'tests'}
                    </span>
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                      {runningActivitiesCount} running now
                    </span>
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                      {selectedCourseMeta
                        ? `${courseCode(selectedCourseMeta)} · ${courseTitle(selectedCourseMeta)}`
                        : 'Choose a course'}
                    </span>
                  </div>
                </div>

                <div className="w-full max-w-xl rounded-[28px] border border-white/15 bg-white/10 p-4 backdrop-blur">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-100/85">
                        Course
                      </span>
                      <select
                        value={filterCourse}
                        onChange={(event) => {
                          const next = new URLSearchParams(searchParams);
                          next.set('courseId', event.target.value);
                          next.set('kind', filterKind);
                          setSearchParams(next, { replace: true });
                        }}
                        className="w-full rounded-2xl border border-white/15 bg-white/95 px-4 py-3 text-sm text-slate-900 outline-none"
                      >
                        <option value="">Select course</option>
                        {(courses as any[]).map((course: any) => (
                          <option key={course.id} value={course.id}>
                            {courseCode(course)} - {courseTitle(course)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="flex rounded-full border border-white/15 bg-slate-950/15 p-1">
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
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-sky-50/80 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

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
                  className={`group rounded-[28px] border p-5 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_26px_60px_-38px_rgba(15,23,42,0.35)] ${statusSurface(
                    activity.status,
                  )}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">
                        {getActivityDisplayTitle(activity)}
                      </p>
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

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Duration
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {getActivityDuration(activity)} min
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Deadline
                      </p>
                      <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <CalendarClock size={14} className="text-slate-400" />
                        {formatDateTimeLabel(activity.endTime)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-slate-200/80 pt-4">
                    <p className="text-sm text-slate-500">
                      Open a focused workspace in a new tab.
                    </p>
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 transition group-hover:translate-x-0.5">
                      Open workspace
                      <ArrowRight size={15} />
                    </span>
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
            {selectedActivityLoading || !selectedActivity ? (
              <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
                Loading activity...
              </div>
            ) : (
              <>
                {proctoringActive && fullscreenRequired ? (
                  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/78 px-6">
                    <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-2xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">
                        Proctored Activity
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold text-slate-900">
                        Fullscreen is required to continue
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        This {selectedActivity.activityKind === 'lab_task' ? 'lab task' : 'lab test'} is
                        being monitored. Exiting fullscreen, leaving the tab, changing window
                        focus, or trying to copy and paste is recorded and reported to the
                        teacher.
                      </p>
                      <div className="mt-6 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={requestLabFullscreen}
                          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
                        >
                          Enter fullscreen
                        </button>
                        <Link
                          to={detailBackHref}
                          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"
                        >
                          Leave activity
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : null}

                <section className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {selectedActivity.activityKind === 'lab_task' ? 'Lab Task' : 'Lab Test'}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(
                          selectedActivity.status,
                        )}`}
                      >
                        {humanize(selectedActivity.status)}
                      </span>
                      <p className="text-sm font-semibold text-slate-900">
                        {getActivityDisplayTitle(selectedActivity)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <CalendarClock size={15} className="text-slate-400" />
                      {selectedActivity.status === 'running' ? (
                        <>
                          <span>Ends in</span>
                          <Countdown
                            endTime={selectedActivity.endTime}
                            onEnded={tryAutoSubmit}
                          />
                        </>
                      ) : (
                        <span className="font-medium text-slate-700">
                          {selectedActivity.status === 'ended' ? 'Ended' : 'Not started'}
                        </span>
                      )}
                    </div>
                  </div>
                </section>

                {proctoringWarnings.length ? (
                  <section className="rounded-[24px] border border-amber-200 bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_100%)] px-5 py-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-amber-900">
                        Proctoring warnings have been recorded
                      </p>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                        Visible to teachers
                      </span>
                    </div>
                    <div className="mt-3 space-y-1">
                      {proctoringWarnings.map((warning, index) => (
                        <p key={`${warning}-${index}`} className="text-xs leading-6 text-amber-700">
                          {warning}
                        </p>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(640px,0.95fr)]">
                  <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] px-4 py-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Problem Navigator
                          </p>
                          <h3 className="mt-1 text-lg font-semibold text-slate-900">
                            {selectedActivity.activityKind === 'lab_task'
                              ? 'Task overview'
                              : 'Problem set'}
                          </h3>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                          {(problems as any[]).length} item{(problems as any[]).length === 1 ? '' : 's'}
                        </span>
                      </div>
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

                    <div className="border-b border-slate-200 px-4 py-2">
                      <div className="flex gap-2 rounded-full bg-slate-100 p-1">
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
                            className={`rounded-full px-3 py-2.5 text-sm font-medium transition ${
                              leftPaneTab === tab.key
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-900'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div
                      className={`${workspacePanelHeightClass} overflow-y-auto px-5 py-5`}
                    >
                      {!selectedProblem ? (
                        <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                          Select a problem to view the statement.
                        </div>
                      ) : leftPaneTab === 'statement' ? (
                        <article className="space-y-6">
                          <div className="flex flex-wrap items-center gap-3 rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_100%)] px-4 py-4">
                            <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                              {selectedActivity.activityKind === 'lab_task' ? 'Task' : 'Problem'}
                            </span>
                            <span className="text-sm text-slate-600">
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
                          <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 whitespace-pre-wrap text-[15px] leading-8 text-slate-700">
                            {selectedProblem.statement}
                          </div>

                          {selectedProblem.inputDescription ? (
                            <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-5">
                              <h4 className="text-lg font-semibold text-slate-900">Input</h4>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">
                                {selectedProblem.inputDescription}
                              </p>
                            </section>
                          ) : null}

                          {selectedProblem.outputDescription ? (
                            <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-5">
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
                                    className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)] p-4"
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
                                  className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)] px-4 py-4"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-medium text-slate-900">
                                        {formatDateTimeLabel(submission.submittedAt)}
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
                    <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] px-4 py-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">Editor</h3>
                            <p className="text-sm text-slate-500">
                              Keep the problem statement open on the left and work from a cleaner,
                              focused coding surface here.
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2 rounded-full bg-slate-100 p-1">
                            <button
                              type="button"
                              onClick={() => setUseFile(false)}
                              className={`rounded-full px-3 py-2 text-sm font-medium ${
                                !useFile
                                  ? 'bg-white text-slate-900 shadow-sm'
                                  : 'text-slate-600'
                              }`}
                            >
                              Editor
                            </button>
                            <button
                              type="button"
                              onClick={() => setUseFile(true)}
                              className={`rounded-full px-3 py-2 text-sm font-medium ${
                                useFile
                                  ? 'bg-white text-slate-900 shadow-sm'
                                  : 'text-slate-600'
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
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
                              Autosubmit at end if this page stays open
                            </span>
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

                    <div
                      className={`grid ${workspacePanelHeightClass} grid-rows-[minmax(0,1fr)_auto_auto]`}
                    >
                      <div className="min-h-0 bg-white">
                        {!useFile ? (
                          <AceEditor
                            mode={LANG_MODES[language] ?? 'c_cpp'}
                            theme="github"
                            value={code}
                            onChange={setCode}
                            name="student-lab-editor"
                            width="100%"
                            height="100%"
                            fontSize={14}
                            setOptions={{ useWorker: false, showPrintMargin: false }}
                            editorProps={{ $blockScrolling: true }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] p-6">
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

                      <div className="border-t border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] px-4 py-4">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-[0_16px_36px_-32px_rgba(15,23,42,0.35)]">
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

                          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-[0_16px_36px_-32px_rgba(15,23,42,0.35)]">
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
