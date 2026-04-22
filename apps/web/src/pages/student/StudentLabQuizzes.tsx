import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileQuestion,
  Send,
} from 'lucide-react';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { courseCode, courseTitle } from '../../lib/display';

function humanize(value: string | null | undefined) {
  return `${value ?? ''}`
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusBadge(status: string | null | undefined) {
  if (status === 'running') return 'bg-emerald-100 text-emerald-700';
  if (status === 'ended') return 'bg-slate-100 text-slate-600';
  return 'bg-amber-100 text-amber-700';
}

function statusSurface(status: string | null | undefined) {
  if (status === 'running') {
    return 'border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_100%)]';
  }
  if (status === 'ended') {
    return 'border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)]';
  }
  return 'border-amber-200 bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_100%)]';
}

function formatDateTimeLabel(value: string | null | undefined): string {
  if (!value) return 'Not started';
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
      const minutes = Math.floor(diff / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1000);
      setRemaining(`${minutes}m ${seconds}s`);
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [endTime, onEnded]);

  return <span className="font-mono font-semibold text-indigo-700">{remaining}</span>;
}

export function StudentLabQuizzes() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { quizId } = useParams<{ quizId: string }>();
  const isFocusedWorkspace = Boolean(quizId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [answers, setAnswers] = useState<Record<string, { selectedOptionId?: string; answerText?: string }>>({});
  const [fullscreenRequired, setFullscreenRequired] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [completionNotice, setCompletionNotice] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const quizShellRef = useRef<HTMLDivElement | null>(null);
  const fullscreenStartedRef = useRef(false);
  const lastViolationAtRef = useRef<Record<string, number>>({});
  const autoSubmittedRef = useRef(false);

  const filterCourse = searchParams.get('courseId') ?? '';

  const { data: courses = [] } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/my').then((response) => response.data),
  });

  useEffect(() => {
    if (isFocusedWorkspace) return;
    if (!filterCourse && (courses as any[]).length > 0) {
      const next = new URLSearchParams(searchParams);
      next.set('courseId', (courses as any[])[0].id);
      setSearchParams(next, { replace: true });
    }
  }, [courses, filterCourse, isFocusedWorkspace, searchParams, setSearchParams]);

  const { data: quizzes = [], isLoading: quizzesLoading } = useQuery({
    queryKey: ['student-lab-quizzes', filterCourse],
    queryFn: () =>
      api.get(`/lab-quizzes/course/${filterCourse}`).then((response) => response.data),
    enabled: Boolean(filterCourse) && !isFocusedWorkspace,
    refetchInterval: (query) =>
      (query.state.data as any[])?.some((quiz: any) => quiz.status === 'running')
        ? 5000
        : false,
  });

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['student-lab-quiz-session', quizId],
    queryFn: () => api.get(`/lab-quizzes/${quizId}/session`).then((response) => response.data),
    enabled: Boolean(quizId),
    refetchInterval: (query) =>
      query.state.data?.quiz?.status === 'running' ? 5000 : false,
  });

  const quiz = session?.quiz;
  const attempt = session?.attempt;
  const questions = quiz?.questions ?? [];
  const selectedCourseMeta = useMemo(
    () => (courses as any[]).find((course: any) => course.id === filterCourse) ?? null,
    [courses, filterCourse],
  );
  const runningCount = useMemo(
    () => (quizzes as any[]).filter((quizItem: any) => quizItem.status === 'running').length,
    [quizzes],
  );

  const proctoringActive = Boolean(
    quizId &&
      quiz?.status === 'running' &&
      quiz?.proctoringEnabled !== false &&
      !attempt?.submittedAt &&
      !completionNotice,
  );

  useEffect(() => {
    if (!quiz?.courseId || quiz.courseId === filterCourse) return;
    const next = new URLSearchParams(searchParams);
    next.set('courseId', quiz.courseId);
    setSearchParams(next, { replace: true });
  }, [filterCourse, quiz?.courseId, searchParams, setSearchParams]);

  useEffect(() => {
    const nextAnswers: Record<string, { selectedOptionId?: string; answerText?: string }> = {};
    (attempt?.answers ?? []).forEach((answer: any) => {
      nextAnswers[answer.questionId] = {
        selectedOptionId: answer.selectedOptionId ?? undefined,
        answerText: answer.answerText ?? '',
      };
    });
    setAnswers(nextAnswers);
    autoSubmittedRef.current = false;
    setCompletionNotice(null);
  }, [attempt?.id, quizId]);

  const pushWarning = (message: string) => {
    setWarnings((current) => [message, ...current].slice(0, 4));
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
    if (!quizId || !proctoringActive) return;
    const now = Date.now();
    const lastSentAt = lastViolationAtRef.current[eventType] ?? 0;
    if (now - lastSentAt < 4000) return;
    lastViolationAtRef.current[eventType] = now;

    pushWarning(message);
    toast.error(message, { id: `lab-quiz-proctor-${eventType}` });
    try {
      await api.post(`/lab-quizzes/${quizId}/proctoring-events`, {
        eventType,
        message,
      });
    } catch {
      // Reporting should not block the quiz UI.
    }
  };

  const requestFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await (quizShellRef.current ?? document.documentElement).requestFullscreen();
      }
      fullscreenStartedRef.current = true;
      setFullscreenRequired(false);
    } catch {
      toast.error('Fullscreen permission was denied.');
      setFullscreenRequired(true);
    }
  };

  useEffect(() => {
    fullscreenStartedRef.current = false;
    lastViolationAtRef.current = {};
    setWarnings([]);
    setFullscreenRequired(Boolean(proctoringActive && !document.fullscreenElement));
  }, [proctoringActive, quizId]);

  useEffect(() => {
    if (!proctoringActive) {
      setFullscreenRequired(false);
      return;
    }

    const handleFullscreenChange = () => {
      const isFullscreen = Boolean(document.fullscreenElement);
      setFullscreenRequired(!isFullscreen);
      if (!isFullscreen && fullscreenStartedRef.current) {
        reportViolation('fullscreen_exit', 'Fullscreen mode was exited during the quiz.');
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        reportViolation('tab_hidden', 'Leaving the active quiz tab was detected.');
      }
    };
    const handleWindowBlur = () => {
      if (document.visibilityState === 'visible') {
        reportViolation('window_blur', 'Moving focus away from the quiz window was detected.');
      }
    };
    const handleClipboard = (event: ClipboardEvent) => {
      event.preventDefault();
      const eventType =
        event.type === 'copy'
          ? 'copy_blocked'
          : event.type === 'cut'
            ? 'cut_blocked'
            : 'paste_blocked';
      reportViolation(eventType, `${humanize(event.type)} is disabled during the quiz.`);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifierPressed = event.ctrlKey || event.metaKey;
      if (!modifierPressed) return;
      const key = event.key.toLowerCase();
      if (!['c', 'v', 'x'].includes(key)) return;
      event.preventDefault();
      const eventType =
        key === 'c' ? 'copy_blocked' : key === 'x' ? 'cut_blocked' : 'paste_blocked';
      reportViolation(eventType, 'Clipboard shortcuts are disabled during the quiz.');
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('copy', handleClipboard);
    window.addEventListener('cut', handleClipboard);
    window.addEventListener('paste', handleClipboard);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('copy', handleClipboard);
      window.removeEventListener('cut', handleClipboard);
      window.removeEventListener('paste', handleClipboard);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [proctoringActive, quizId]);

  const submitMutation = useMutation({
    mutationFn: async ({ auto = false }: { auto?: boolean } = {}) => {
      const payload = {
        answers: (questions as any[]).map((question: any) => ({
          questionId: question.id,
          selectedOptionId: answers[question.id]?.selectedOptionId,
          answerText: answers[question.id]?.answerText,
        })),
      };
      const response = await api.post(`/lab-quizzes/${quizId}/submit`, payload);
      return { response: response.data, auto };
    },
    onSuccess: ({ auto }) => {
      queryClient.invalidateQueries({ queryKey: ['student-lab-quiz-session', quizId] });
      queryClient.invalidateQueries({ queryKey: ['running-lab-quizzes'] });
      setFullscreenRequired(false);
      setCompletionNotice({
        title: auto ? 'Quiz time ended' : 'Quiz submitted',
        message: auto
          ? 'Your available answers have been submitted automatically.'
          : 'Your quiz submission has been recorded.',
      });
    },
    onError: (error: any, variables) => {
      if (variables?.auto) {
        queryClient.invalidateQueries({ queryKey: ['student-lab-quiz-session', quizId] });
        queryClient.invalidateQueries({ queryKey: ['running-lab-quizzes'] });
        setFullscreenRequired(false);
        setCompletionNotice({
          title: 'Quiz closed',
          message: 'The quiz has ended. Any submitted answers remain recorded.',
        });
        return;
      }
      toast.error(error.response?.data?.message ?? 'Failed to submit quiz');
    },
  });

  const tryAutoSubmit = () => {
    if (autoSubmittedRef.current) return;
    if (!quiz || quiz.status !== 'running') return;
    autoSubmittedRef.current = true;
    submitMutation.mutate({ auto: true });
  };

  useEffect(() => {
    if (!quizId || !quiz || attempt?.submittedAt || completionNotice) return;
    if (quiz.status !== 'ended') return;
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    submitMutation.mutate({ auto: true });
  }, [attempt?.submittedAt, completionNotice, quiz, quizId, submitMutation]);

  const continueToDashboard = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Browser fullscreen exit can fail after permission/state changes.
    }
    setCompletionNotice(null);
    navigate('/student', { replace: true });
  };

  const detailBackHref = `/student/lab-quizzes?courseId=${quiz?.courseId ?? filterCourse}`;

  return (
    <AppShell>
      <div
        ref={isFocusedWorkspace ? quizShellRef : undefined}
        className={
          isFocusedWorkspace
            ? 'min-h-screen space-y-4 bg-slate-50 px-1 py-1 text-slate-900'
            : 'mx-auto max-w-[1560px] space-y-6'
        }
      >
        {!isFocusedWorkspace ? (
          <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_70px_-42px_rgba(15,23,42,0.35)]">
            <div className="bg-[linear-gradient(135deg,#0f172a_0%,#155e75_55%,#22d3ee_100%)] px-6 py-8 text-white sm:px-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/85">
                    Student Workspace
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Lab Quiz</h1>
                  <div className="mt-5 flex flex-wrap gap-3 text-sm text-cyan-50/90">
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                      {(quizzes as any[]).length} total quizzes
                    </span>
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                      {runningCount} running now
                    </span>
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                      {selectedCourseMeta
                        ? `${courseCode(selectedCourseMeta)} · ${courseTitle(selectedCourseMeta)}`
                        : 'Choose a course'}
                    </span>
                  </div>
                </div>
                <label className="w-full max-w-lg space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/85">
                    Course
                  </span>
                  <select
                    value={filterCourse}
                    onChange={(event) => {
                      const next = new URLSearchParams(searchParams);
                      next.set('courseId', event.target.value);
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
              </div>
            </div>
          </section>
        ) : null}

        {!quizId ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {quizzesLoading
              ? [1, 2, 3].map((item) => (
                  <div key={item} className="h-40 animate-pulse rounded-[24px] border border-slate-200 bg-white" />
                ))
              : null}
            {!quizzesLoading &&
              (quizzes as any[]).map((quizItem: any) => (
                <Link
                  key={quizItem.id}
                  to={`/student/lab-quizzes/${quizItem.id}?courseId=${quizItem.courseId}`}
                  className={`group rounded-[28px] border p-5 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 ${statusSurface(
                    quizItem.status,
                  )}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">{quizItem.title}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {quizItem.sectionName ?? 'All Students'}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(quizItem.status)}`}>
                      {humanize(quizItem.status)}
                    </span>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <InfoTile label="Duration" value={`${quizItem.durationMinutes} min`} />
                    <InfoTile label="Starts" value={formatDateTimeLabel(quizItem.startTime)} />
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-slate-200/80 pt-4">
                    <span className="text-sm text-slate-500">Open quiz workspace</span>
                    <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            {!quizzesLoading && !(quizzes as any[]).length ? (
              <div className="col-span-full rounded-[24px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
                {filterCourse ? 'No lab quiz found for this course.' : 'Select a course to see lab quizzes.'}
              </div>
            ) : null}
          </section>
        ) : (
          <div className="space-y-4">
            {sessionLoading || !quiz ? (
              <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
                Loading quiz...
              </div>
            ) : (
              <>
                {completionNotice ? (
                  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/78 px-6">
                    <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-2xl">
                      <CheckCircle2 className="mx-auto text-emerald-600" size={34} />
                      <h2 className="mt-4 text-2xl font-semibold text-slate-900">
                        {completionNotice.title}
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        {completionNotice.message}
                      </p>
                      <button
                        type="button"
                        onClick={continueToDashboard}
                        className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                ) : null}

                {proctoringActive && fullscreenRequired ? (
                  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/78 px-6">
                    <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-2xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">
                        Proctored Quiz
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold text-slate-900">
                        Fullscreen is required to continue
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-slate-600">
                        Exiting fullscreen, leaving this tab, changing window focus, or using clipboard actions is recorded.
                      </p>
                      <div className="mt-6 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={requestFullscreen}
                          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
                        >
                          Enter fullscreen
                        </button>
                        <Link to={detailBackHref} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700">
                          Leave quiz
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : null}

                <section className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        Lab Quiz
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(quiz.status)}`}>
                        {humanize(quiz.status)}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          quiz.proctoringEnabled === false
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {quiz.proctoringEnabled === false ? 'Alert system off' : 'Alert system on'}
                      </span>
                      <p className="text-sm font-semibold text-slate-900">{quiz.title}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      {quiz.status === 'running' ? (
                        <>
                          <CalendarClock size={15} className="text-slate-400" />
                          <span>Ends in</span>
                          <Countdown endTime={quiz.endTime} onEnded={tryAutoSubmit} />
                        </>
                      ) : (
                        <span className="font-medium text-slate-700">{humanize(quiz.status)}</span>
                      )}
                    </div>
                  </div>
                </section>

                {warnings.length ? (
                  <section className="rounded-[24px] border border-amber-200 bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_100%)] px-5 py-4 shadow-sm">
                    <p className="text-sm font-semibold text-amber-900">Proctoring warnings recorded</p>
                    <div className="mt-3 space-y-1">
                      {warnings.map((warning, index) => (
                        <p key={`${warning}-${index}`} className="text-xs leading-6 text-amber-700">
                          {warning}
                        </p>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <FileQuestion size={18} className="text-slate-700" />
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Questions</h3>
                        <p className="text-sm text-slate-500">
                          {questions.length} questions · {quiz.totalMarks ?? 'Total'} marks
                        </p>
                      </div>
                    </div>
                    {attempt?.submittedAt ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 size={13} />
                        Submitted
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-5 space-y-4">
                    {(questions as any[]).map((question: any, index: number) => {
                      const answer = answers[question.id] ?? {};
                      const evaluatedAnswer = (attempt?.answers ?? []).find(
                        (item: any) => item.questionId === question.id,
                      );
                      return (
                        <div key={question.id} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                              Q{index + 1} · {question.questionType === 'mcq' ? 'MCQ' : 'Short'} · {question.marks} marks
                            </span>
                            {quiz.status === 'ended' && evaluatedAnswer?.evaluated ? (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                {evaluatedAnswer.score ?? 0} scored
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-4 whitespace-pre-wrap text-base font-semibold leading-7 text-slate-900">
                            {question.prompt}
                          </p>

                          {question.questionType === 'mcq' ? (
                            <div className="mt-4 grid gap-2">
                              {(question.options ?? []).map((option: any) => (
                                <label
                                  key={option.id}
                                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                                    answer.selectedOptionId === option.id
                                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                      : 'border-slate-200 bg-white text-slate-700'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    disabled={quiz.status !== 'running' || Boolean(attempt?.submittedAt)}
                                    checked={answer.selectedOptionId === option.id}
                                    onChange={() =>
                                      setAnswers((current) => ({
                                        ...current,
                                        [question.id]: { selectedOptionId: option.id },
                                      }))
                                    }
                                  />
                                  {option.text}
                                </label>
                              ))}
                            </div>
                          ) : (
                            <textarea
                              value={answer.answerText ?? ''}
                              onChange={(event) =>
                                setAnswers((current) => ({
                                  ...current,
                                  [question.id]: { answerText: event.target.value },
                                }))
                              }
                              disabled={quiz.status !== 'running' || Boolean(attempt?.submittedAt)}
                              className="mt-4 min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 disabled:bg-slate-100"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {quiz.status === 'ended' ? (
                    <div className="mt-5 rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
                      <p className="font-semibold">
                        Score: {attempt?.totalScore ?? 0}
                      </p>
                      <p className="mt-1">
                        MCQ {attempt?.mcqScore ?? 0} · Short {attempt?.shortScore ?? 0}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
                    <Link to={detailBackHref} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700">
                      Back
                    </Link>
                    <button
                      type="button"
                      onClick={() => submitMutation.mutate({})}
                      disabled={quiz.status !== 'running' || Boolean(attempt?.submittedAt) || submitMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Send size={16} />
                      {submitMutation.isPending ? 'Submitting...' : 'Submit Quiz'}
                    </button>
                  </div>
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Clock3 size={14} className="text-slate-400" />
        {value}
      </p>
    </div>
  );
}
