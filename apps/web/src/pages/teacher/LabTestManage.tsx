import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  PlayCircle,
  Plus,
  Save,
  StopCircle,
  Wand2,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { WheelDateTimeInput } from '../../components/WheelDateInput';
import { courseCode, courseTitle, studentDisplayName } from '../../lib/display';

const verdictEnum = z.enum([
  'accepted',
  'wrong_answer',
  'time_limit_exceeded',
  'memory_limit_exceeded',
  'runtime_error',
  'compilation_error',
  'partial',
  'pending',
]);

const sampleCaseSchema = z.object({
  input: z.string().min(1, 'Input is required'),
  output: z.string().min(1, 'Output is required'),
  explanation: z.string().optional(),
});

const hiddenCaseSchema = z.object({
  input: z.string().min(1, 'Input is required'),
  output: z.string().min(1, 'Output is required'),
});

const activitySchema = z.object({
  courseId: z.string().uuid('Select a course'),
  title: z.string().trim().min(2, 'Title is required'),
  description: z.string().optional(),
  activityKind: z.enum(['lab_test', 'lab_task']),
  type: z.enum(['verdict_based', 'non_verdict']),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  totalMarks: z.number().positive().optional(),
});

const problemSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  statement: z.string().trim().min(1, 'Statement is required'),
  inputDescription: z.string().optional(),
  outputDescription: z.string().optional(),
  marks: z.number().positive().optional(),
  timeLimitMs: z.number().positive().optional(),
  memoryLimitKb: z.number().positive().optional(),
  saveToBank: z.boolean(),
  sampleTestCases: z
    .array(sampleCaseSchema)
    .min(1, 'Add at least one sample test case'),
  hiddenTestCases: z.array(hiddenCaseSchema),
});

const gradeSchema = z.object({
  verdict: verdictEnum,
  score: z.number().min(0).optional(),
  instructorNote: z.string().optional(),
});

type ActivityFormData = z.infer<typeof activitySchema>;
type ProblemFormData = z.infer<typeof problemSchema>;
type GradeFormData = z.infer<typeof gradeSchema>;

function humanize(value: string | null | undefined) {
  return `${value ?? ''}`
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusBadge(status: string) {
  if (status === 'running') return 'bg-emerald-100 text-emerald-700';
  if (status === 'ended') return 'bg-slate-100 text-slate-600';
  return 'bg-amber-100 text-amber-700';
}

function verdictBadge(verdict: string | null | undefined) {
  switch (verdict) {
    case 'accepted':
      return 'bg-emerald-100 text-emerald-700';
    case 'wrong_answer':
      return 'bg-rose-100 text-rose-700';
    case 'partial':
      return 'bg-sky-100 text-sky-700';
    case 'time_limit_exceeded':
    case 'memory_limit_exceeded':
    case 'runtime_error':
    case 'compilation_error':
      return 'bg-amber-100 text-amber-700';
    case 'manual_review':
      return 'bg-violet-100 text-violet-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

export function LabTestManage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showProblemComposer, setShowProblemComposer] = useState(false);
  const [showCreateProblemForm, setShowCreateProblemForm] = useState(true);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [gradingSubId, setGradingSubId] = useState<string | null>(null);

  const filterCourse = searchParams.get('courseId') ?? '';
  const filterKind =
    searchParams.get('kind') === 'lab_task' ? 'lab_task' : 'lab_test';

  const { data: courses = [] } = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => api.get('/courses/my').then((response) => response.data),
  });

  const { data: labTests = [], isLoading: labTestsLoading } = useQuery({
    queryKey: ['lab-tests-teacher', filterCourse, filterKind],
    queryFn: () =>
      api
        .get(`/lab-tests/course/${filterCourse}`, {
          params: { kind: filterKind },
        })
        .then((response) => response.data),
    enabled: Boolean(filterCourse),
  });

  const selectedTest = useMemo(
    () => (labTests as any[]).find((item: any) => item.id === selectedTestId) ?? null,
    [labTests, selectedTestId],
  );

  useEffect(() => {
    if (!filterCourse && (courses as any[]).length > 0) {
      const next = new URLSearchParams(searchParams);
      next.set('courseId', (courses as any[])[0].id);
      next.set('kind', filterKind);
      setSearchParams(next, { replace: true });
    }
  }, [courses, filterCourse, filterKind, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedTestId && (labTests as any[]).length > 0) {
      setSelectedTestId((labTests as any[])[0].id);
      return;
    }

    if (
      selectedTestId &&
      !(labTests as any[]).some((item: any) => item.id === selectedTestId)
    ) {
      setSelectedTestId((labTests as any[])[0]?.id ?? null);
    }
  }, [labTests, selectedTestId]);

  useEffect(() => {
    setShowProblemComposer(false);
    setShowCreateProblemForm(true);
  }, [selectedTestId]);

  const { data: problems = [] } = useQuery({
    queryKey: ['lab-test-problems', selectedTestId],
    queryFn: () => api.get(`/lab-tests/${selectedTestId}/problems`).then((response) => response.data),
    enabled: Boolean(selectedTestId),
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['lab-test-submissions', selectedTestId],
    queryFn: () =>
      api.get(`/lab-tests/${selectedTestId}/submissions`).then((response) => response.data),
    enabled: Boolean(selectedTestId),
  });

  const { data: problemBank = [] } = useQuery({
    queryKey: ['teacher-problem-bank'],
    queryFn: () => api.get('/lab-tests/problem-bank').then((response) => response.data),
  });

  const activityForm = useForm<ActivityFormData>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      courseId: filterCourse,
      title: '',
      description: '',
      activityKind: filterKind,
      type: 'verdict_based',
      startTime: '',
      endTime: '',
      totalMarks: 100,
    },
  });

  useEffect(() => {
    activityForm.setValue('courseId', filterCourse);
    activityForm.setValue('activityKind', filterKind);
  }, [activityForm, filterCourse, filterKind]);

  const problemForm = useForm<ProblemFormData>({
    resolver: zodResolver(problemSchema),
    defaultValues: {
      title: '',
      statement: '',
      inputDescription: '',
      outputDescription: '',
      marks: undefined,
      timeLimitMs: 1000,
      memoryLimitKb: 262144,
      saveToBank: true,
      sampleTestCases: [{ input: '', output: '', explanation: '' }],
      hiddenTestCases: [{ input: '', output: '' }],
    },
  });

  const sampleFields = useFieldArray({
    control: problemForm.control,
    name: 'sampleTestCases',
  });
  const hiddenFields = useFieldArray({
    control: problemForm.control,
    name: 'hiddenTestCases',
  });

  const gradeForm = useForm<GradeFormData>({
    resolver: zodResolver(gradeSchema),
    defaultValues: {
      verdict: 'pending',
      score: undefined,
      instructorNote: '',
    },
  });

  const createActivityMutation = useMutation({
    mutationFn: (values: ActivityFormData) =>
      api.post('/lab-tests', {
        ...values,
        startTime: new Date(values.startTime).toISOString(),
        endTime: new Date(values.endTime).toISOString(),
      }),
    onSuccess: (response) => {
      toast.success(
        response.data.activityKind === 'lab_task'
          ? 'Lab task created'
          : 'Lab test created',
      );
      queryClient.invalidateQueries({ queryKey: ['lab-tests-teacher'] });
      setSelectedTestId(response.data.id);
      setShowActivityForm(false);
      activityForm.reset({
        courseId: filterCourse,
        title: '',
        description: '',
        activityKind: filterKind,
        type: 'verdict_based',
        startTime: '',
        endTime: '',
        totalMarks: 100,
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to create activity');
    },
  });

  const addProblemMutation = useMutation({
    mutationFn: (values: ProblemFormData) =>
      api.post(`/lab-tests/${selectedTestId}/problems`, values),
    onSuccess: () => {
      toast.success('Problem added');
      queryClient.invalidateQueries({ queryKey: ['lab-test-problems', selectedTestId] });
      queryClient.invalidateQueries({ queryKey: ['teacher-problem-bank'] });
      setShowProblemComposer(false);
      problemForm.reset({
        title: '',
        statement: '',
        inputDescription: '',
        outputDescription: '',
        marks: undefined,
        timeLimitMs: 1000,
        memoryLimitKb: 262144,
        saveToBank: true,
        sampleTestCases: [{ input: '', output: '', explanation: '' }],
        hiddenTestCases: [{ input: '', output: '' }],
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to add problem');
    },
  });

  const importProblemMutation = useMutation({
    mutationFn: (problemId: string) =>
      api.post(`/lab-tests/${selectedTestId}/problems/import`, { problemId }),
    onSuccess: () => {
      toast.success('Problem imported');
      queryClient.invalidateQueries({ queryKey: ['lab-test-problems', selectedTestId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to import problem');
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/lab-tests/${id}/start`),
    onSuccess: () => {
      toast.success('Activity started');
      queryClient.invalidateQueries({ queryKey: ['lab-tests-teacher'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to start activity');
    },
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/lab-tests/${id}/end`),
    onSuccess: () => {
      toast.success('Activity ended');
      queryClient.invalidateQueries({ queryKey: ['lab-tests-teacher'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to end activity');
    },
  });

  const gradeMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: GradeFormData }) =>
      api.patch(`/lab-tests/submissions/${id}/grade`, values),
    onSuccess: () => {
      toast.success('Submission graded');
      queryClient.invalidateQueries({ queryKey: ['lab-test-submissions', selectedTestId] });
      setGradingSubId(null);
      gradeForm.reset({
        verdict: 'pending',
        score: undefined,
        instructorNote: '',
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to grade submission');
    },
  });

  const kindLabel = filterKind === 'lab_task' ? 'Lab Tasks' : 'Lab Tests';

  return (
    <AppShell>
      <div className="mx-auto max-w-[1560px] space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                Teacher Workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">
                {kindLabel}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Create course lab contests or solo tasks, reuse judge problems, and review
                student verdicts before grading.
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

              <button
                type="button"
                onClick={() => setShowActivityForm((current) => !current)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                <Plus size={16} />
                New {filterKind === 'lab_task' ? 'Task' : 'Test'}
              </button>
            </div>
          </div>
        </section>

        {showActivityForm ? (
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <Wand2 size={18} className="text-indigo-500" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Create {filterKind === 'lab_task' ? 'Lab Task' : 'Lab Test'}
                </h2>
                <p className="text-sm text-slate-500">
                  Tasks are single-problem timed activities. Tests can contain multiple problems.
                </p>
              </div>
            </div>

            <form
              onSubmit={activityForm.handleSubmit((values) =>
                createActivityMutation.mutate(values),
              )}
              className="grid gap-4 md:grid-cols-2"
            >
              <Field label="Course" error={activityForm.formState.errors.courseId?.message}>
                <select
                  {...activityForm.register('courseId')}
                  className={inputClass}
                >
                  <option value="">Select course</option>
                  {(courses as any[]).map((course: any) => (
                    <option key={course.id} value={course.id}>
                      {courseCode(course)} - {courseTitle(course)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Mode" error={activityForm.formState.errors.type?.message}>
                <select {...activityForm.register('type')} className={inputClass}>
                  <option value="verdict_based">Verdict Based</option>
                  <option value="non_verdict">Non-Verdict</option>
                </select>
              </Field>

              <Field label="Title" error={activityForm.formState.errors.title?.message}>
                <input
                  {...activityForm.register('title')}
                  className={inputClass}
                  placeholder={filterKind === 'lab_task' ? 'Lab Task 1' : 'Lab Test 1'}
                />
              </Field>

              <Field
                label="Total Marks"
                error={activityForm.formState.errors.totalMarks?.message}
              >
                <input
                  type="number"
                  {...activityForm.register('totalMarks', {
                    setValueAs: (value) => (value === '' ? undefined : Number(value)),
                  })}
                  className={inputClass}
                  placeholder="100"
                />
              </Field>

              <Field
                label="Start Time"
                error={activityForm.formState.errors.startTime?.message}
              >
                <Controller
                  control={activityForm.control}
                  name="startTime"
                  render={({ field }) => (
                    <WheelDateTimeInput value={field.value ?? ''} onChange={field.onChange} />
                  )}
                />
              </Field>

              <Field
                label="End Time"
                error={activityForm.formState.errors.endTime?.message}
              >
                <Controller
                  control={activityForm.control}
                  name="endTime"
                  render={({ field }) => (
                    <WheelDateTimeInput value={field.value ?? ''} onChange={field.onChange} />
                  )}
                />
              </Field>

              <Field
                label="Description"
                error={activityForm.formState.errors.description?.message}
                className="md:col-span-2"
              >
                <textarea
                  {...activityForm.register('description')}
                  className={`${inputClass} min-h-24`}
                  placeholder="Optional instructions for students"
                />
              </Field>

              <div className="md:col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowActivityForm(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createActivityMutation.isPending}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {createActivityMutation.isPending ? 'Creating...' : 'Create activity'}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <BookOpen size={18} className="text-indigo-500" />
              <div>
                <h2 className="font-semibold text-slate-900">{kindLabel}</h2>
                <p className="text-sm text-slate-500">
                  Choose an activity to manage its problems and submissions.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {labTestsLoading ? (
                [1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-24 animate-pulse rounded-2xl border border-slate-100 bg-slate-50"
                  />
                ))
              ) : !(labTests as any[]).length ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  {filterCourse
                    ? `No ${filterKind === 'lab_task' ? 'lab tasks' : 'lab tests'} yet for this course.`
                    : 'Select a course to see activities.'}
                </div>
              ) : (
                (labTests as any[]).map((item: any) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedTestId(item.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedTestId === item.id
                        ? 'border-indigo-300 bg-indigo-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {humanize(item.type)} · {item.totalMarks ?? 'N/A'} marks
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(
                          item.status,
                        )}`}
                      >
                        {humanize(item.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      {new Date(item.startTime).toLocaleString()} to{' '}
                      {new Date(item.endTime).toLocaleString()}
                    </p>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="space-y-6">
            {!selectedTest ? (
              <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
                Pick a {filterKind === 'lab_task' ? 'lab task' : 'lab test'} to manage it.
              </div>
            ) : (
              <>
                <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(
                            selectedTest.status,
                          )}`}
                        >
                          {humanize(selectedTest.status)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {selectedTest.activityKind === 'lab_task' ? 'Lab Task' : 'Lab Test'}
                        </span>
                      </div>
                      <h2 className="mt-3 text-2xl font-semibold text-slate-900">
                        {selectedTest.title}
                      </h2>
                      {selectedTest.description ? (
                        <p className="mt-2 text-sm text-slate-600">
                          {selectedTest.description}
                        </p>
                      ) : null}
                      <p className="mt-3 text-sm text-slate-500">
                        {new Date(selectedTest.startTime).toLocaleString()} to{' '}
                        {new Date(selectedTest.endTime).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {selectedTest.status !== 'running' ? (
                        <button
                          type="button"
                          onClick={() => startMutation.mutate(selectedTest.id)}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                        >
                          <PlayCircle size={16} />
                          Start
                        </button>
                      ) : null}
                      {selectedTest.status === 'running' ? (
                        <button
                          type="button"
                          onClick={() => endMutation.mutate(selectedTest.id)}
                          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white"
                        >
                          <StopCircle size={16} />
                          End
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)]">
                  <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          Problems ({(problems as any[]).length})
                        </h3>
                        <p className="text-sm text-slate-500">
                          Build fresh questions or pull from the judge problem bank.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowProblemComposer((current) => !current);
                          setShowCreateProblemForm(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                      >
                        <Plus size={15} />
                        Add problem
                      </button>
                    </div>

                    {showProblemComposer ? (
                      <div className="mt-5 grid gap-6">
                        <form
                          onSubmit={problemForm.handleSubmit((values) =>
                            addProblemMutation.mutate(values),
                          )}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <button
                            type="button"
                            onClick={() => setShowCreateProblemForm((current) => !current)}
                            className="mb-4 flex w-full items-center gap-2 text-left"
                          >
                            {showCreateProblemForm ? (
                              <ChevronDown size={16} className="text-slate-500" />
                            ) : (
                              <ChevronRight size={16} className="text-slate-500" />
                            )}
                            <h4 className="font-semibold text-slate-900">
                              Create a new problem
                            </h4>
                          </button>

                          {showCreateProblemForm ? (
                          <>
                          <div className="grid gap-4 md:grid-cols-2">
                            <Field
                              label="Title"
                              error={problemForm.formState.errors.title?.message}
                              className="md:col-span-2"
                            >
                              <input
                                {...problemForm.register('title')}
                                className={inputClass}
                                placeholder="Shortest Path"
                              />
                            </Field>

                            <Field
                              label="Statement"
                              error={problemForm.formState.errors.statement?.message}
                              className="md:col-span-2"
                            >
                              <textarea
                                {...problemForm.register('statement')}
                                className={`${inputClass} min-h-28`}
                                placeholder="Describe the problem..."
                              />
                            </Field>

                            <Field label="Input Description">
                              <textarea
                                {...problemForm.register('inputDescription')}
                                className={`${inputClass} min-h-24`}
                                placeholder="Explain the input format"
                              />
                            </Field>

                            <Field label="Output Description">
                              <textarea
                                {...problemForm.register('outputDescription')}
                                className={`${inputClass} min-h-24`}
                                placeholder="Explain the output format"
                              />
                            </Field>

                            <Field label="Marks">
                              <input
                                type="number"
                                {...problemForm.register('marks', {
                                  setValueAs: (value) =>
                                    value === '' ? undefined : Number(value),
                                })}
                                className={inputClass}
                              />
                            </Field>

                            <Field label="Time Limit (ms)">
                              <input
                                type="number"
                                {...problemForm.register('timeLimitMs', {
                                  setValueAs: (value) =>
                                    value === '' ? undefined : Number(value),
                                })}
                                className={inputClass}
                              />
                            </Field>

                            <Field label="Memory Limit (KB)">
                              <input
                                type="number"
                                {...problemForm.register('memoryLimitKb', {
                                  setValueAs: (value) =>
                                    value === '' ? undefined : Number(value),
                                })}
                                className={inputClass}
                              />
                            </Field>

                            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2">
                              <input
                                id="saveToBank"
                                type="checkbox"
                                {...problemForm.register('saveToBank')}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              <label htmlFor="saveToBank" className="text-sm text-slate-700">
                                Save this problem to the reusable teacher problem bank
                              </label>
                            </div>
                          </div>

                          <div className="mt-5 space-y-4">
                            <ProblemCaseSection
                              title="Sample Test Cases"
                              description="Students can see these while solving."
                              fields={sampleFields.fields}
                              append={() =>
                                sampleFields.append({
                                  input: '',
                                  output: '',
                                  explanation: '',
                                })
                              }
                              remove={sampleFields.remove}
                              renderBody={(index) => (
                                <div className="grid gap-3 md:grid-cols-2">
                                  <textarea
                                    {...problemForm.register(
                                      `sampleTestCases.${index}.input`,
                                    )}
                                    className={`${inputClass} min-h-24 font-mono text-xs`}
                                    placeholder="Sample input"
                                  />
                                  <textarea
                                    {...problemForm.register(
                                      `sampleTestCases.${index}.output`,
                                    )}
                                    className={`${inputClass} min-h-24 font-mono text-xs`}
                                    placeholder="Sample output"
                                  />
                                  <div className="md:col-span-2">
                                    <input
                                      {...problemForm.register(
                                        `sampleTestCases.${index}.explanation`,
                                      )}
                                      className={inputClass}
                                      placeholder="Optional explanation"
                                    />
                                  </div>
                                </div>
                              )}
                            />

                            <ProblemCaseSection
                              title="Hidden Test Cases"
                              description="These cases are used for real judging only."
                              fields={hiddenFields.fields}
                              append={() =>
                                hiddenFields.append({ input: '', output: '' })
                              }
                              remove={hiddenFields.remove}
                              renderBody={(index) => (
                                <div className="grid gap-3 md:grid-cols-2">
                                  <textarea
                                    {...problemForm.register(
                                      `hiddenTestCases.${index}.input`,
                                    )}
                                    className={`${inputClass} min-h-24 font-mono text-xs`}
                                    placeholder="Hidden input"
                                  />
                                  <textarea
                                    {...problemForm.register(
                                      `hiddenTestCases.${index}.output`,
                                    )}
                                    className={`${inputClass} min-h-24 font-mono text-xs`}
                                    placeholder="Hidden output"
                                  />
                                </div>
                              )}
                            />
                          </div>

                          <div className="mt-5 flex justify-end">
                            <button
                              type="submit"
                              disabled={addProblemMutation.isPending}
                              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                            >
                              <Save size={16} />
                              {addProblemMutation.isPending ? 'Saving...' : 'Add problem'}
                            </button>
                          </div>
                          </>
                          ) : null}
                        </form>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="mb-4 flex items-center gap-2">
                            <ClipboardList size={16} className="text-slate-500" />
                            <div>
                              <h4 className="font-semibold text-slate-900">
                                Reuse from judge + teacher problem bank
                              </h4>
                              <p className="text-sm text-slate-500">
                                Shared judge questions appear here together with your own saved
                                problems.
                              </p>
                            </div>
                          </div>

                          <div className="space-y-3 max-h-[28rem] overflow-auto pr-1">
                            {(problemBank as any[]).map((problem: any) => (
                              <div
                                key={problem.id}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-900">
                                      {problem.title}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {problem.timeLimitMs ?? 1000} ms ·{' '}
                                      {problem.memoryLimitKb ?? 262144} KB
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => importProblemMutation.mutate(problem.id)}
                                    disabled={importProblemMutation.isPending}
                                    className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                                  >
                                    Import
                                  </button>
                                </div>
                                <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                                  {problem.statement}
                                </p>
                              </div>
                            ))}
                            {!(problemBank as any[]).length ? (
                              <p className="text-sm text-slate-400">
                                No reusable problems found yet.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-5 space-y-3">
                      {(problems as any[]).map((problem: any, index: number) => (
                        <div
                          key={problem.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                                  {selectedTest.activityKind === 'lab_task'
                                    ? 'Task'
                                    : `P${index + 1}`}
                                </span>
                                <p className="font-semibold text-slate-900">
                                  {problem.title}
                                </p>
                              </div>
                              <p className="mt-2 text-xs text-slate-500">
                                {problem.marks ?? 0} marks · {problem.timeLimitMs ?? 1000} ms ·{' '}
                                {problem.memoryLimitKb ?? 262144} KB
                              </p>
                            </div>
                          </div>
                          <p className="mt-3 line-clamp-4 text-sm text-slate-600">
                            {problem.statement}
                          </p>
                        </div>
                      ))}

                      {!(problems as any[]).length ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          No problems added yet.
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="font-semibold text-slate-900">
                      Student Submissions ({(submissions as any[]).length})
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Review the automatic verdict first, then add marks and instructor notes.
                    </p>

                    <div className="mt-5 space-y-3">
                      {(submissions as any[]).map((submission: any) => {
                        const currentVerdict =
                          submission.manualVerdict && submission.manualVerdict !== 'pending'
                            ? submission.manualVerdict
                            : submission.submissionStatus;
                        return (
                          <div
                            key={submission.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {studentDisplayName(submission)}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {submission.problem?.title ?? 'Problem'} ·{' '}
                                  {new Date(submission.submittedAt).toLocaleString()}
                                </p>
                              </div>
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${verdictBadge(
                                  currentVerdict,
                                )}`}
                              >
                                {humanize(currentVerdict)}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
                              <div>Score: {submission.score ?? '—'}</div>
                              <div>Time: {submission.executionTimeMs ?? '—'} ms</div>
                              <div>Memory: {submission.memoryUsedKb ?? '—'} KB</div>
                            </div>

                            {submission.judgeMessage ? (
                              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-slate-600">
                                {submission.judgeMessage}
                              </p>
                            ) : null}

                            {gradingSubId === submission.id ? (
                              <form
                                onSubmit={gradeForm.handleSubmit((values) =>
                                  gradeMutation.mutate({ id: submission.id, values }),
                                )}
                                className="mt-4 space-y-3"
                              >
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <Field label="Verdict">
                                    <select {...gradeForm.register('verdict')} className={inputClass}>
                                      {verdictEnum.options.map((option) => (
                                        <option key={option} value={option}>
                                          {humanize(option)}
                                        </option>
                                      ))}
                                    </select>
                                  </Field>
                                  <Field label="Score">
                                    <input
                                      type="number"
                                      {...gradeForm.register('score', {
                                        setValueAs: (value) =>
                                          value === '' ? undefined : Number(value),
                                      })}
                                      className={inputClass}
                                    />
                                  </Field>
                                </div>
                                <Field label="Instructor Note">
                                  <textarea
                                    {...gradeForm.register('instructorNote')}
                                    className={`${inputClass} min-h-24`}
                                    placeholder="Optional feedback for later review"
                                  />
                                </Field>
                                <div className="flex justify-end gap-3">
                                  <button
                                    type="button"
                                    onClick={() => setGradingSubId(null)}
                                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={gradeMutation.isPending}
                                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                                  >
                                    Save grade
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <div className="mt-4 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setGradingSubId(submission.id);
                                    gradeForm.reset({
                                      verdict:
                                        submission.manualVerdict && submission.manualVerdict !== 'pending'
                                          ? submission.manualVerdict
                                          : 'pending',
                                      score: submission.score ?? undefined,
                                      instructorNote: submission.instructorNote ?? '',
                                    });
                                  }}
                                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                                >
                                  Grade submission
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {!(submissions as any[]).length ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          No submissions yet.
                        </div>
                      ) : null}
                    </div>
                  </section>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-rose-500">{error}</p> : null}
    </div>
  );
}

function ProblemCaseSection({
  title,
  description,
  fields,
  append,
  remove,
  renderBody,
}: {
  title: string;
  description: string;
  fields: { id: string }[];
  append: () => void;
  remove: (index: number) => void;
  renderBody: (index: number) => React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h5 className="font-semibold text-slate-900">{title}</h5>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={append}
          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
        >
          Add case
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {fields.map((field, index) => (
          <div key={field.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-700">Case {index + 1}</p>
              {fields.length > 1 ? (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="text-xs font-medium text-rose-600"
                >
                  Remove
                </button>
              ) : null}
            </div>
            {renderBody(index)}
          </div>
        ))}
      </div>
    </section>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400';
