import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock3,
  Files,
  PencilLine,
  PlayCircle,
  Plus,
  Save,
  ShieldAlert,
  StopCircle,
  Trash2,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Modal } from '../../components/Modal';
import { courseCode, courseTitle, studentDisplayName } from '../../lib/display';
import { useAuthStore } from '../../store/auth.store';
import {
  formatDateTime,
  getCourseSectionNames,
  isCourseArchived,
} from './teacher.shared';

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
  input: z.string().optional(),
  output: z.string().optional(),
  explanation: z.string().optional(),
});

const hiddenCaseSchema = z.object({
  input: z.string().optional(),
  output: z.string().optional(),
});

const activitySchema = z
  .object({
    courseId: z.string().uuid('Select a course'),
    title: z.string().trim().optional(),
    description: z.string().optional(),
    activityKind: z.enum(['lab_test', 'lab_task']),
    type: z.enum(['verdict_based', 'non_verdict']),
    durationMinutes: z.number().int().positive('Duration is required'),
    totalMarks: z.number().positive().optional(),
    sectionName: z.string().trim().min(1, 'Section is required'),
    labClassId: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.activityKind === 'lab_test' && !value.title?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Title is required',
        path: ['title'],
      });
    }

    if (value.activityKind === 'lab_task' && !value.labClassId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a lab class',
        path: ['labClassId'],
      });
    }
  });

const problemSchema = z.object({
  title: z.string().optional(),
  statement: z.string().optional(),
  inputDescription: z.string().optional(),
  outputDescription: z.string().optional(),
  timeLimitMs: z.number().positive().optional(),
  memoryLimitKb: z.number().positive().optional(),
  sampleTestCases: z.array(sampleCaseSchema),
  hiddenTestCases: z.array(hiddenCaseSchema),
});

const gradeSchema = z.object({
  verdict: verdictEnum,
  score: z.number().min(0).optional(),
  instructorNote: z.string().optional(),
});

type LabActivityKindValue = 'lab_test' | 'lab_task';
type ActivityTab = 'manage' | 'problems' | 'submissions' | 'alerts';
type ProblemCatalogTab = 'mine' | 'bank';

type ActivityFormData = z.infer<typeof activitySchema>;
type ProblemFormData = z.infer<typeof problemSchema>;
type GradeFormData = z.infer<typeof gradeSchema>;

type HeadingCopy = {
  eyebrow?: string;
  title?: string;
  description?: string;
};

export type TeacherLabActivityManagerProps = {
  fixedCourseId?: string | null;
  fixedActivityKind?: LabActivityKindValue | null;
  fixedSectionName?: string | null;
  fixedLabClassId?: string | null;
  syncSearchParams?: boolean;
  heading?: HeadingCopy;
  disableCreation?: boolean;
  hideActivityLibrary?: boolean;
  hideWorkspaceHeader?: boolean;
  initialSelectedActivityId?: string | null;
  autoOpenCreateModal?: boolean;
  onSelectedActivityChange?: (activityId: string | null) => void;
};

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

function getActivityContextBits(activity: any): string[] {
  const bits: string[] = [];
  if (activity?.sectionName) {
    bits.push(activity.sectionName);
  }
  if (activity?.labClass?.labNumber) {
    bits.push(`Lab ${activity.labClass.labNumber}`);
  }
  return bits;
}

function getActivityDurationMinutes(activity: any): number {
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

function formatDurationLabel(minutes: number | null | undefined) {
  const safeMinutes = minutes && minutes > 0 ? minutes : 0;
  if (!safeMinutes) return '—';
  if (safeMinutes < 60) return `${safeMinutes} min`;

  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
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

function getDefaultHeading(
  kind: LabActivityKindValue,
  currentCourse: any,
  fixedCourseId?: string | null,
): HeadingCopy {
  if (fixedCourseId && currentCourse) {
    return {
      eyebrow: 'Course Workspace',
      title: kind === 'lab_task' ? 'Lab Tasks' : 'Lab Tests',
      description:
        kind === 'lab_task'
          ? 'Manage course lab tasks.'
          : 'Manage course lab tests.',
    };
  }

  return {
    eyebrow: 'Teacher Workspace',
    title: kind === 'lab_task' ? 'Lab Tasks' : 'Lab Tests',
    description: 'Create, manage, and review lab activities.',
  };
}

function getProblemCode(problem: any, sourceProblemMap?: Map<string, any>) {
  if (problem?.problemCode?.trim()) {
    return problem.problemCode.trim();
  }

  const sourceProblem = problem?.sourceProblemId
    ? sourceProblemMap?.get(problem.sourceProblemId)
    : null;

  if (sourceProblem?.problemCode?.trim()) {
    return sourceProblem.problemCode.trim();
  }

  if (problem?.id) {
    return `ID-${String(problem.id).slice(0, 8).toUpperCase()}`;
  }

  return 'ID-UNKNOWN';
}

function buildProblemPayload(values: ProblemFormData) {
  const sampleTestCases = values.sampleTestCases
    .map((sample) => ({
      input: sample.input?.trim() ?? '',
      output: sample.output?.trim() ?? '',
      explanation: sample.explanation?.trim() || undefined,
    }))
    .filter((sample) => sample.input || sample.output);

  const hiddenTestCases = values.hiddenTestCases
    .map((testCase) => ({
      input: testCase.input?.trim() ?? '',
      output: testCase.output?.trim() ?? '',
    }))
    .filter((testCase) => testCase.input || testCase.output);

  return {
    title: values.title?.trim() ?? '',
    statement: values.statement?.trim() ?? '',
    inputDescription: values.inputDescription?.trim() || undefined,
    outputDescription: values.outputDescription?.trim() || undefined,
    timeLimitMs: values.timeLimitMs,
    memoryLimitKb: values.memoryLimitKb,
    sampleTestCases,
    hiddenTestCases,
  };
}

function formatRemainingTime(endTime: string | null | undefined, nowMs: number) {
  if (!endTime) return null;

  const diff = new Date(endTime).getTime() - nowMs;
  if (!Number.isFinite(diff) || diff <= 0) {
    return 'Ended';
  }

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

export function TeacherLabActivityManager({
  fixedCourseId = null,
  fixedActivityKind = null,
  fixedSectionName = null,
  fixedLabClassId = null,
  syncSearchParams = false,
  heading,
  disableCreation = false,
  hideActivityLibrary = false,
  hideWorkspaceHeader = false,
  initialSelectedActivityId,
  autoOpenCreateModal = false,
  onSelectedActivityChange,
}: TeacherLabActivityManagerProps) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityTab, setActivityTab] = useState<ActivityTab>('manage');
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [showProblemModal, setShowProblemModal] = useState(false);
  const [editingProblemBankId, setEditingProblemBankId] = useState<string | null>(null);
  const [problemCatalogTab, setProblemCatalogTab] = useState<ProblemCatalogTab>('mine');
  const [selectedCatalogProblemId, setSelectedCatalogProblemId] = useState<string | null>(null);
  const [showMyProblemsPanel, setShowMyProblemsPanel] = useState(true);
  const [showProblemBankPanel, setShowProblemBankPanel] = useState(true);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [selectedTestId, setSelectedTestId] = useState<string | null>(
    initialSelectedActivityId ?? null,
  );
  const [gradingSubId, setGradingSubId] = useState<string | null>(null);
  const [localCourseId, setLocalCourseId] = useState(fixedCourseId ?? '');
  const [localKind, setLocalKind] = useState<LabActivityKindValue>(
    fixedActivityKind ?? 'lab_test',
  );
  const [clockNow, setClockNow] = useState(() => Date.now());

  const controlledSelection = initialSelectedActivityId !== undefined;
  const urlCourseId = searchParams.get('courseId') ?? '';
  const urlKind: LabActivityKindValue =
    searchParams.get('kind') === 'lab_task' ? 'lab_task' : 'lab_test';
  const requestedActivityId = syncSearchParams ? searchParams.get('activityId') : null;

  const filterCourse = fixedCourseId ?? (syncSearchParams ? urlCourseId : localCourseId);
  const filterKind = fixedActivityKind ?? (syncSearchParams ? urlKind : localKind);
  const sectionFilter = fixedSectionName?.trim() ?? '';
  const labClassFilter = fixedLabClassId?.trim() ?? '';

  const { data: courses = [] } = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => api.get('/courses/my').then((response) => response.data),
  });

  const { data: currentCourse } = useQuery({
    queryKey: ['teacher-course', filterCourse],
    queryFn: () => api.get(`/courses/${filterCourse}`).then((response) => response.data),
    enabled: Boolean(filterCourse),
  });

  const { data: labClasses = [] } = useQuery({
    queryKey: ['teacher-course-lab-classes', filterCourse],
    queryFn: () =>
      api.get(`/courses/${filterCourse}/lab-classes`).then((response) => response.data),
    enabled: Boolean(filterCourse),
  });

  const { data: labTests = [], isLoading: labTestsLoading } = useQuery({
    queryKey: [
      'lab-tests-teacher',
      filterCourse,
      filterKind,
      sectionFilter,
      labClassFilter,
    ],
    queryFn: () =>
      api
        .get(`/lab-tests/course/${filterCourse}`, {
          params: {
            kind: filterKind,
            ...(sectionFilter ? { sectionName: sectionFilter } : {}),
            ...(labClassFilter ? { labClassId: labClassFilter } : {}),
          },
        })
        .then((response) => response.data),
    enabled: Boolean(filterCourse),
    refetchInterval: (query) =>
      (query.state.data as any[])?.some(
        (item: any) => item.id === selectedTestId && item.status === 'running',
      )
        ? 5000
        : false,
  });

  const selectedTest = useMemo(
    () => (labTests as any[]).find((item: any) => item.id === selectedTestId) ?? null,
    [labTests, selectedTestId],
  );

  const sectionNames = useMemo(() => getCourseSectionNames(currentCourse), [currentCourse]);
  const selectedCourseArchived = useMemo(
    () => (currentCourse ? isCourseArchived(currentCourse) : false),
    [currentCourse],
  );
  const creationDisabled = disableCreation || selectedCourseArchived;

  const activityForm = useForm<ActivityFormData>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      courseId: filterCourse,
      title: '',
      description: '',
      activityKind: filterKind,
      type: 'verdict_based',
      durationMinutes: 60,
      totalMarks: 100,
      sectionName: fixedSectionName ?? '',
      labClassId: fixedLabClassId ?? '',
    },
  });

  const watchedSectionName = fixedSectionName ?? activityForm.watch('sectionName');
  const watchedLabClassId = fixedLabClassId ?? activityForm.watch('labClassId');
  const selectedLabClass = useMemo(
    () => (labClasses as any[]).find((item: any) => item.id === watchedLabClassId) ?? null,
    [labClasses, watchedLabClassId],
  );
  const availableTaskLabClasses = useMemo(
    () =>
      (labClasses as any[]).filter((labClass: any) =>
        (labClass.sections ?? []).some(
          (section: any) =>
            `${section?.sectionName ?? ''}`.trim() === `${watchedSectionName ?? ''}`.trim() &&
            section?.status === 'conducted',
        ),
      ),
    [labClasses, watchedSectionName],
  );

  const { data: problems = [] } = useQuery({
    queryKey: ['lab-test-problems', selectedTestId],
    queryFn: () =>
      api.get(`/lab-tests/${selectedTestId}/problems`).then((response) => response.data),
    enabled: Boolean(selectedTestId),
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['lab-test-submissions', selectedTestId],
    queryFn: () =>
      api.get(`/lab-tests/${selectedTestId}/submissions`).then((response) => response.data),
    enabled: Boolean(selectedTestId),
  });

  const { data: proctoringEvents = [] } = useQuery({
    queryKey: ['lab-test-proctoring-events', selectedTestId],
    queryFn: () =>
      api
        .get(`/lab-tests/${selectedTestId}/proctoring-events`)
        .then((response) => response.data),
    enabled: Boolean(selectedTestId),
    refetchInterval: selectedTest?.status === 'running' ? 5000 : false,
  });

  const { data: problemBank = [] } = useQuery({
    queryKey: ['teacher-problem-bank'],
    queryFn: () =>
      api.get('/lab-tests/problem-bank').then((response) => {
        const payload = response.data;
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.items)) return payload.items;
        if (Array.isArray(payload?.data)) return payload.data;
        return [];
      }),
  });

  const myProblems = useMemo(
    () => (problemBank as any[]).filter((problem: any) => problem.authorId === user?.id),
    [problemBank, user?.id],
  );
  const bankProblems = useMemo(
    () => (problemBank as any[]).filter((problem: any) => problem.authorId !== user?.id),
    [problemBank, user?.id],
  );
  const activeCatalogProblems = problemCatalogTab === 'mine' ? myProblems : bankProblems;
  const sourceProblemMap = useMemo(
    () => new Map((problemBank as any[]).map((problem: any) => [problem.id, problem])),
    [problemBank],
  );
  const selectedCatalogProblem = useMemo(
    () =>
      activeCatalogProblems.find((problem: any) => problem.id === selectedCatalogProblemId) ??
      activeCatalogProblems[0] ??
      null,
    [activeCatalogProblems, selectedCatalogProblemId],
  );

  const problemForm = useForm<ProblemFormData>({
    resolver: zodResolver(problemSchema),
    defaultValues: {
      title: '',
      statement: '',
      inputDescription: '',
      outputDescription: '',
      timeLimitMs: 1000,
      memoryLimitKb: 262144,
      sampleTestCases: [],
      hiddenTestCases: [],
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

  const selectedDurationMinutes = selectedTest ? getActivityDurationMinutes(selectedTest) : 0;
  const canEditSelectedTest = selectedTest?.status === 'draft';
  const selectedSourceProblemIds = new Set(
    (problems as any[])
      .map((problem: any) => problem.sourceProblemId)
      .filter((value: string | null | undefined): value is string => Boolean(value)),
  );
  const manageLocked = selectedTest?.status !== 'draft';
  const kindLabel = filterKind === 'lab_task' ? 'Lab Tasks' : 'Lab Tests';
  const headerCopy = heading ?? getDefaultHeading(filterKind, currentCourse, fixedCourseId);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    onSelectedActivityChange?.(selectedTestId);
  }, [onSelectedActivityChange, selectedTestId]);

  useEffect(() => {
    if (fixedCourseId) {
      setLocalCourseId(fixedCourseId);
    }
  }, [fixedCourseId]);

  useEffect(() => {
    if (fixedActivityKind) {
      setLocalKind(fixedActivityKind);
    }
  }, [fixedActivityKind]);

  useEffect(() => {
    if (fixedCourseId || filterCourse || !(courses as any[]).length) {
      return;
    }

    const nextCourseId = (courses as any[])[0].id;
    if (syncSearchParams) {
      const next = new URLSearchParams(searchParams);
      next.set('courseId', nextCourseId);
      next.set('kind', filterKind);
      next.delete('activityId');
      setSearchParams(next, { replace: true });
      return;
    }

    setLocalCourseId(nextCourseId);
  }, [
    courses,
    filterCourse,
    filterKind,
    fixedCourseId,
    searchParams,
    setSearchParams,
    syncSearchParams,
  ]);

  useEffect(() => {
    activityForm.setValue('courseId', filterCourse);
    activityForm.setValue('activityKind', filterKind);
  }, [activityForm, filterCourse, filterKind]);

  useEffect(() => {
    if (fixedSectionName?.trim()) {
      activityForm.setValue('sectionName', fixedSectionName.trim());
      return;
    }

    const currentValue = activityForm.getValues('sectionName');
    if (!sectionNames.length) {
      activityForm.setValue('sectionName', '');
      return;
    }

    if (!sectionNames.includes(currentValue)) {
      activityForm.setValue('sectionName', sectionNames[0]);
    }
  }, [activityForm, fixedSectionName, sectionNames]);

  useEffect(() => {
    if (fixedLabClassId?.trim()) {
      activityForm.setValue('labClassId', fixedLabClassId.trim());
      return;
    }

    if (filterKind !== 'lab_task') {
      activityForm.setValue('labClassId', '');
      return;
    }

    const currentValue = activityForm.getValues('labClassId');
    const availableIds = availableTaskLabClasses.map((item: any) => item.id);
    if (currentValue && availableIds.includes(currentValue)) {
      return;
    }

    activityForm.setValue('labClassId', availableIds[0] ?? '');
  }, [activityForm, availableTaskLabClasses, filterKind, fixedLabClassId]);

  useEffect(() => {
    if (controlledSelection) {
      setSelectedTestId(initialSelectedActivityId ?? null);
      return;
    }

    if (
      requestedActivityId &&
      (labTests as any[]).some((item: any) => item.id === requestedActivityId)
    ) {
      setSelectedTestId(requestedActivityId);
      return;
    }

    if (autoOpenCreateModal) {
      setSelectedTestId(null);
      return;
    }

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
  }, [
    autoOpenCreateModal,
    controlledSelection,
    initialSelectedActivityId,
    labTests,
    requestedActivityId,
    selectedTestId,
  ]);

  useEffect(() => {
    if (!syncSearchParams || fixedCourseId || fixedActivityKind || !selectedTestId) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    if (filterCourse) {
      next.set('courseId', filterCourse);
    }
    next.set('kind', filterKind);
    next.set('activityId', selectedTestId);
    setSearchParams(next, { replace: true });
  }, [
    filterCourse,
    filterKind,
    fixedActivityKind,
    fixedCourseId,
    searchParams,
    selectedTestId,
    setSearchParams,
    syncSearchParams,
  ]);

  useEffect(() => {
    setActivityTab('manage');
    setGradingSubId(null);
  }, [selectedTestId]);

  useEffect(() => {
    setScoreDrafts((current) => {
      const next: Record<string, string> = {};
      for (const problem of problems as any[]) {
        next[problem.id] =
          current[problem.id] ?? (problem.marks === null || problem.marks === undefined ? '' : String(problem.marks));
      }
      return next;
    });
  }, [problems]);

  useEffect(() => {
    if (!activeCatalogProblems.length) {
      setSelectedCatalogProblemId(null);
      return;
    }

    if (
      !selectedCatalogProblemId ||
      !activeCatalogProblems.some((problem: any) => problem.id === selectedCatalogProblemId)
    ) {
      setSelectedCatalogProblemId(activeCatalogProblems[0].id);
    }
  }, [activeCatalogProblems, selectedCatalogProblemId]);

  useEffect(() => {
    if (autoOpenCreateModal && !creationDisabled) {
      setEditingActivityId(null);
      setShowActivityForm(true);
    }
  }, [autoOpenCreateModal, creationDisabled]);

  const resetActivityForm = () => {
    activityForm.reset({
      courseId: filterCourse,
      title: '',
      description: '',
      activityKind: filterKind,
      type: 'verdict_based',
      durationMinutes: 60,
      totalMarks: 100,
      sectionName: fixedSectionName ?? sectionNames[0] ?? '',
      labClassId:
        fixedLabClassId ?? (filterKind === 'lab_task' ? availableTaskLabClasses[0]?.id ?? '' : ''),
    });
  };

  const populateActivityForm = (activity: any) => {
    activityForm.reset({
      courseId: activity.courseId,
      title: activity.title ?? '',
      description: activity.description ?? '',
      activityKind: activity.activityKind,
      type: activity.type,
      durationMinutes: getActivityDurationMinutes(activity),
      totalMarks: activity.totalMarks ?? 100,
      sectionName: activity.sectionName ?? '',
      labClassId: activity.labClassId ?? '',
    });
  };

  const resetProblemForm = () => {
    problemForm.reset({
      title: '',
      statement: '',
      inputDescription: '',
      outputDescription: '',
      timeLimitMs: 1000,
      memoryLimitKb: 262144,
      sampleTestCases: [],
      hiddenTestCases: [],
    });
  };

  const populateProblemForm = (problem: any) => {
    problemForm.reset({
      title: problem.title ?? '',
      statement: problem.statement ?? '',
      inputDescription: problem.inputDescription ?? '',
      outputDescription: problem.outputDescription ?? '',
      timeLimitMs: problem.timeLimitMs ?? 1000,
      memoryLimitKb: problem.memoryLimitKb ?? 262144,
      sampleTestCases:
        Array.isArray(problem.sampleTestCases) && problem.sampleTestCases.length
          ? problem.sampleTestCases.map((sample: any) => ({
              input: sample.input ?? '',
              output: sample.output ?? '',
              explanation: sample.explanation ?? sample.note ?? '',
            }))
          : [],
      hiddenTestCases:
        Array.isArray(problem.hiddenTestCases) && problem.hiddenTestCases.length
          ? problem.hiddenTestCases.map((sample: any) => ({
              input: sample.input ?? '',
              output: sample.output ?? '',
            }))
          : [],
    });
  };

  const invalidateActivityQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['lab-tests-teacher'] });
    queryClient.invalidateQueries({ queryKey: ['teacher', 'course-lab-activities'] });
    queryClient.invalidateQueries({ queryKey: ['student-lab-tests'] });
    queryClient.invalidateQueries({ queryKey: ['teacher-lab-class-tasks'] });
  };

  const createActivityMutation = useMutation({
    mutationFn: (values: ActivityFormData) =>
      api.post('/lab-tests', {
        ...values,
        title: values.activityKind === 'lab_task' ? '' : values.title?.trim() ?? '',
        description: values.description?.trim() || undefined,
        sectionName: fixedSectionName ?? values.sectionName,
        labClassId:
          values.activityKind === 'lab_task'
            ? fixedLabClassId ?? values.labClassId
            : undefined,
      }),
    onSuccess: (response) => {
      toast.success(
        response.data.activityKind === 'lab_task' ? 'Lab task created' : 'Lab test created',
      );
      invalidateActivityQueries();
      setSelectedTestId(response.data.id);
      setShowActivityForm(false);
      setEditingActivityId(null);
      resetActivityForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to create activity');
    },
  });

  const updateActivityMutation = useMutation({
    mutationFn: (values: ActivityFormData) =>
      api.patch(`/lab-tests/${editingActivityId}`, {
        title: values.activityKind === 'lab_task' ? '' : values.title?.trim() ?? '',
        description: values.description?.trim() || undefined,
        type: values.type,
        durationMinutes: values.durationMinutes,
        totalMarks: values.totalMarks,
        sectionName: fixedSectionName ?? values.sectionName,
        labClassId:
          values.activityKind === 'lab_task'
            ? fixedLabClassId ?? values.labClassId
            : undefined,
      }),
    onSuccess: () => {
      toast.success('Activity updated');
      invalidateActivityQueries();
      setShowActivityForm(false);
      setEditingActivityId(null);
      resetActivityForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to update activity');
    },
  });

  const createReusableProblemMutation = useMutation({
    mutationFn: (values: ProblemFormData) =>
      api.post('/lab-tests/problem-bank', {
        ...buildProblemPayload(values),
        saveToBank: true,
      }),
    onSuccess: (response) => {
      toast.success('Problem created');
      queryClient.invalidateQueries({ queryKey: ['teacher-problem-bank'] });
      setProblemCatalogTab('mine');
      setSelectedCatalogProblemId(response.data.id);
      setShowProblemModal(false);
      setEditingProblemBankId(null);
      resetProblemForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to create problem');
    },
  });

  const updateReusableProblemMutation = useMutation({
    mutationFn: (values: ProblemFormData) =>
      api.patch(`/lab-tests/problem-bank/${editingProblemBankId}`, buildProblemPayload(values)),
    onSuccess: () => {
      toast.success('Problem updated');
      queryClient.invalidateQueries({ queryKey: ['teacher-problem-bank'] });
      setShowProblemModal(false);
      setEditingProblemBankId(null);
      resetProblemForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to update problem');
    },
  });

  const importProblemMutation = useMutation({
    mutationFn: (problemId: string) =>
      api.post(`/lab-tests/${selectedTestId}/problems/import`, { problemId }),
    onSuccess: () => {
      toast.success('Problem added');
      queryClient.invalidateQueries({ queryKey: ['lab-test-problems', selectedTestId] });
      queryClient.invalidateQueries({ queryKey: ['lab-test-submissions', selectedTestId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to add problem');
    },
  });

  const removeProblemMutation = useMutation({
    mutationFn: (problemId: string) => api.delete(`/lab-tests/${selectedTestId}/problems/${problemId}`),
    onSuccess: () => {
      toast.success('Problem removed');
      queryClient.invalidateQueries({ queryKey: ['lab-test-problems', selectedTestId] });
      queryClient.invalidateQueries({ queryKey: ['lab-test-submissions', selectedTestId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to remove problem');
    },
  });

  const updateActivityProblemMutation = useMutation({
    mutationFn: ({ problemId, marks }: { problemId: string; marks?: number }) =>
      api.patch(`/lab-tests/${selectedTestId}/problems/${problemId}`, { marks }),
    onSuccess: () => {
      toast.success('Score updated');
      queryClient.invalidateQueries({ queryKey: ['lab-test-problems', selectedTestId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to update score');
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/lab-tests/${id}/start`),
    onSuccess: () => {
      toast.success('Activity started');
      invalidateActivityQueries();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'Failed to start activity');
    },
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/lab-tests/${id}/end`),
    onSuccess: () => {
      toast.success('Activity ended');
      invalidateActivityQueries();
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

  const openCreateForm = () => {
    setEditingActivityId(null);
    resetActivityForm();
    setShowActivityForm(true);
  };

  const openEditForm = () => {
    if (!selectedTest) return;
    setEditingActivityId(selectedTest.id);
    populateActivityForm(selectedTest);
    setShowActivityForm(true);
  };

  const closeActivityForm = () => {
    setShowActivityForm(false);
    setEditingActivityId(null);
    resetActivityForm();
  };

  const openNewProblemModal = () => {
    setEditingProblemBankId(null);
    resetProblemForm();
    setShowProblemModal(true);
  };

  const openEditProblemModal = (problem: any) => {
    setEditingProblemBankId(problem.id);
    populateProblemForm(problem);
    setShowProblemModal(true);
  };

  const closeProblemModal = () => {
    setShowProblemModal(false);
    setEditingProblemBankId(null);
    resetProblemForm();
  };

  const handleCourseChange = (courseId: string) => {
    if (fixedCourseId) return;

    setSelectedTestId(null);
    if (syncSearchParams) {
      const next = new URLSearchParams(searchParams);
      next.set('courseId', courseId);
      next.set('kind', filterKind);
      next.delete('activityId');
      setSearchParams(next, { replace: true });
      return;
    }

    setLocalCourseId(courseId);
  };

  const handleKindChange = (kind: LabActivityKindValue) => {
    if (fixedActivityKind) return;

    setSelectedTestId(null);
    if (syncSearchParams) {
      const next = new URLSearchParams(searchParams);
      next.set('kind', kind);
      if (filterCourse) {
        next.set('courseId', filterCourse);
      }
      next.delete('activityId');
      setSearchParams(next, { replace: true });
      return;
    }

    setLocalKind(kind);
  };

  const handleSaveScore = (problem: any) => {
    const rawValue = scoreDrafts[problem.id];
    const parsedMarks = rawValue === '' ? null : Number(rawValue);
    if (parsedMarks !== null && (!Number.isFinite(parsedMarks) || parsedMarks < 0)) {
      toast.error('Enter a valid score');
      return;
    }

    updateActivityProblemMutation.mutate({
      problemId: problem.id,
      marks: parsedMarks ?? undefined,
    });
  };

  const activityFormSubmitting =
    createActivityMutation.isPending || updateActivityMutation.isPending;
  const problemFormSubmitting =
    createReusableProblemMutation.isPending || updateReusableProblemMutation.isPending;
  const isEditingActivity = Boolean(editingActivityId);
  const isEditingProblem = Boolean(editingProblemBankId);

  return (
    <div className="space-y-6">
      {!hideWorkspaceHeader ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
              {headerCopy.eyebrow ?? 'Teacher Workspace'}
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-900">
              {headerCopy.title ?? kindLabel}
            </h2>
            {headerCopy.description ? (
              <p className="mt-2 max-w-3xl text-sm text-slate-500">{headerCopy.description}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            {!fixedCourseId ? (
              <select
                value={filterCourse}
                onChange={(event) => handleCourseChange(event.target.value)}
                className={inputClass}
              >
                <option value="">Select course</option>
                {(courses as any[]).map((course: any) => (
                  <option key={course.id} value={course.id}>
                    {courseCode(course)} - {courseTitle(course)}
                  </option>
                ))}
              </select>
            ) : currentCourse ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">
                  {courseCode(currentCourse)} - {courseTitle(currentCourse)}
                </p>
                <p className="mt-1">
                  {fixedLabClassId
                    ? 'Lab-class scoped tasks'
                    : filterKind === 'lab_task'
                      ? 'Course-scoped tasks'
                      : 'Course-scoped tests'}
                </p>
              </div>
            ) : null}

            {!fixedActivityKind ? (
              <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1">
                {[
                  { value: 'lab_test' as const, label: 'Lab Tests' },
                  { value: 'lab_task' as const, label: 'Lab Tasks' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => handleKindChange(item.value)}
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
            ) : null}

            <button
              type="button"
              onClick={openCreateForm}
              disabled={!filterCourse || creationDisabled}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={16} />
              New {filterKind === 'lab_task' ? 'Task' : 'Test'}
            </button>
          </div>
        </div>

        {creationDisabled ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            This course is archived, so new activities are locked.
          </div>
        ) : null}
        </section>
      ) : null}

      <Modal
        open={showActivityForm}
        onClose={closeActivityForm}
        title={`${isEditingActivity ? 'Edit' : 'New'} ${
          filterKind === 'lab_task' ? 'Lab Task' : 'Lab Test'
        }`}
        maxWidthClass="max-w-3xl"
      >
        <form
          onSubmit={activityForm.handleSubmit((values) =>
            isEditingActivity
              ? updateActivityMutation.mutate(values)
              : createActivityMutation.mutate(values),
          )}
          className="space-y-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Activity
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {filterKind === 'lab_task' ? 'Lab Task' : 'Lab Test'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Course
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {currentCourse
                  ? `${courseCode(currentCourse)} - ${courseTitle(currentCourse)}`
                  : 'Select a course'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {filterKind === 'lab_test' ? (
              <Field label="Title" error={activityForm.formState.errors.title?.message}>
                <input
                  {...activityForm.register('title')}
                  className={inputClass}
                  placeholder="Lab Test 1"
                />
              </Field>
            ) : null}

            <Field label="Mode" error={activityForm.formState.errors.type?.message}>
              <select {...activityForm.register('type')} className={inputClass}>
                <option value="verdict_based">Verdict Based</option>
                <option value="non_verdict">Non-Verdict</option>
              </select>
            </Field>

            <Field
              label="Duration (minutes)"
              error={activityForm.formState.errors.durationMinutes?.message}
            >
              <input
                type="number"
                {...activityForm.register('durationMinutes', {
                  setValueAs: (value) => (value === '' ? undefined : Number(value)),
                })}
                className={inputClass}
                placeholder="90"
              />
            </Field>

            <Field label="Total Marks" error={activityForm.formState.errors.totalMarks?.message}>
              <input
                type="number"
                {...activityForm.register('totalMarks', {
                  setValueAs: (value) => (value === '' ? undefined : Number(value)),
                })}
                className={inputClass}
                placeholder="100"
              />
            </Field>

            {fixedSectionName?.trim() ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Section
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{fixedSectionName}</p>
              </div>
            ) : (
              <Field label="Section" error={activityForm.formState.errors.sectionName?.message}>
                <select {...activityForm.register('sectionName')} className={inputClass}>
                  <option value="">Select section</option>
                  {sectionNames.map((sectionName) => (
                    <option key={sectionName} value={sectionName}>
                      {sectionName}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {filterKind === 'lab_task' ? (
              fixedLabClassId?.trim() ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Lab Class
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {selectedLabClass
                      ? `Lab ${selectedLabClass.labNumber} - ${selectedLabClass.title}`
                      : 'Selected lab class'}
                  </p>
                </div>
              ) : (
                <Field label="Lab Class" error={activityForm.formState.errors.labClassId?.message}>
                  <select {...activityForm.register('labClassId')} className={inputClass}>
                    <option value="">
                      {availableTaskLabClasses.length
                        ? 'Select a conducted lab class'
                        : 'No conducted lab class'}
                    </option>
                    {availableTaskLabClasses.map((labClass: any) => (
                      <option key={labClass.id} value={labClass.id}>
                        Lab {labClass.labNumber} - {labClass.title}
                      </option>
                    ))}
                  </select>
                </Field>
              )
            ) : null}
          </div>

          <Field
            label="Description"
            error={activityForm.formState.errors.description?.message}
          >
            <textarea
              {...activityForm.register('description')}
              className={`${inputClass} min-h-28`}
              placeholder="Optional instructions"
            />
          </Field>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={closeActivityForm}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={activityFormSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              <Save size={16} />
              {activityFormSubmitting
                ? isEditingActivity
                  ? 'Saving...'
                  : 'Creating...'
                : isEditingActivity
                  ? 'Save Changes'
                  : `Create ${filterKind === 'lab_task' ? 'Task' : 'Test'}`}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showProblemModal}
        onClose={closeProblemModal}
        title={isEditingProblem ? 'Edit Problem' : 'New Problem'}
        maxWidthClass="max-w-4xl"
      >
        <form
          onSubmit={problemForm.handleSubmit((values) =>
            isEditingProblem
              ? updateReusableProblemMutation.mutate(values)
              : createReusableProblemMutation.mutate(values),
          )}
          className="space-y-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title" error={problemForm.formState.errors.title?.message}>
              <input
                {...problemForm.register('title')}
                className={inputClass}
                placeholder="Shortest Path"
              />
            </Field>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Problem ID
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {isEditingProblem && selectedCatalogProblem
                  ? getProblemCode(selectedCatalogProblem)
                  : 'Assigned after save'}
              </p>
            </div>

            <Field
              label="Statement"
              error={problemForm.formState.errors.statement?.message}
              className="md:col-span-2"
            >
              <textarea
                {...problemForm.register('statement')}
                className={`${inputClass} min-h-36`}
                placeholder="Write the full problem statement"
              />
            </Field>

            <Field label="Input" error={problemForm.formState.errors.inputDescription?.message}>
              <textarea
                {...problemForm.register('inputDescription')}
                className={`${inputClass} min-h-24`}
                placeholder="Input format"
              />
            </Field>

            <Field label="Output" error={problemForm.formState.errors.outputDescription?.message}>
              <textarea
                {...problemForm.register('outputDescription')}
                className={`${inputClass} min-h-24`}
                placeholder="Output format"
              />
            </Field>

            <Field label="Time Limit (ms)">
              <input
                type="number"
                {...problemForm.register('timeLimitMs', {
                  setValueAs: (value) => (value === '' ? undefined : Number(value)),
                })}
                className={inputClass}
                placeholder="1000"
              />
            </Field>

            <Field label="Memory Limit (KB)">
              <input
                type="number"
                {...problemForm.register('memoryLimitKb', {
                  setValueAs: (value) => (value === '' ? undefined : Number(value)),
                })}
                className={inputClass}
                placeholder="262144"
              />
            </Field>
          </div>

          <ProblemCaseSection
            title="Sample Test Cases"
            description="Shown to students."
            fields={sampleFields.fields}
            append={() => sampleFields.append({ input: '', output: '', explanation: '' })}
            remove={sampleFields.remove}
            renderBody={(index) => (
              <div className="grid gap-3 md:grid-cols-2">
                <textarea
                  {...problemForm.register(`sampleTestCases.${index}.input`)}
                  className={`${inputClass} min-h-24 font-mono text-xs`}
                  placeholder="Sample input"
                />
                <textarea
                  {...problemForm.register(`sampleTestCases.${index}.output`)}
                  className={`${inputClass} min-h-24 font-mono text-xs`}
                  placeholder="Sample output"
                />
                <div className="md:col-span-2">
                  <input
                    {...problemForm.register(`sampleTestCases.${index}.explanation`)}
                    className={inputClass}
                    placeholder="Explanation"
                  />
                </div>
              </div>
            )}
          />

          <ProblemCaseSection
            title="Hidden Test Cases"
            description="Used for judging."
            fields={hiddenFields.fields}
            append={() => hiddenFields.append({ input: '', output: '' })}
            remove={hiddenFields.remove}
            renderBody={(index) => (
              <div className="grid gap-3 md:grid-cols-2">
                <textarea
                  {...problemForm.register(`hiddenTestCases.${index}.input`)}
                  className={`${inputClass} min-h-24 font-mono text-xs`}
                  placeholder="Hidden input"
                />
                <textarea
                  {...problemForm.register(`hiddenTestCases.${index}.output`)}
                  className={`${inputClass} min-h-24 font-mono text-xs`}
                  placeholder="Hidden output"
                />
              </div>
            )}
          />

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={closeProblemModal}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={problemFormSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              <Save size={16} />
              {problemFormSubmitting
                ? isEditingProblem
                  ? 'Saving...'
                  : 'Creating...'
                : isEditingProblem
                  ? 'Save Changes'
                  : 'Create Problem'}
            </button>
          </div>
        </form>
      </Modal>

      <div
        className={
          hideActivityLibrary ? 'space-y-6' : 'grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]'
        }
      >
        {!hideActivityLibrary ? (
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <BookOpen size={18} className="text-slate-700" />
              <div>
                <h3 className="font-semibold text-slate-900">{kindLabel}</h3>
                <p className="text-sm text-slate-500">Select one to manage.</p>
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
                    ? `No ${filterKind === 'lab_task' ? 'lab tasks' : 'lab tests'} found yet.`
                    : 'Select a course first.'}
                </div>
              ) : (
                (labTests as any[]).map((item: any) => {
                  const contextBits = getActivityContextBits(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedTestId(item.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        selectedTestId === item.id
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className={`truncate font-semibold ${
                              selectedTestId === item.id ? 'text-white' : 'text-slate-900'
                            }`}
                          >
                            {getActivityDisplayTitle(item)}
                          </p>
                          <p
                            className={`mt-1 text-xs ${
                              selectedTestId === item.id ? 'text-slate-200' : 'text-slate-500'
                            }`}
                          >
                            {humanize(item.type)} · {item.totalMarks ?? 'N/A'} marks
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            selectedTestId === item.id
                              ? 'bg-white/15 text-white'
                              : statusBadge(item.status)
                          }`}
                        >
                          {humanize(item.status)}
                        </span>
                      </div>

                      {contextBits.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {contextBits.map((bit) => (
                            <span
                              key={`${item.id}-${bit}`}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                selectedTestId === item.id
                                  ? 'bg-white/10 text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {bit}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div
                        className={`mt-3 flex flex-wrap gap-2 text-xs ${
                          selectedTestId === item.id ? 'text-slate-200' : 'text-slate-500'
                        }`}
                      >
                        <span>Duration {formatDurationLabel(getActivityDurationMinutes(item))}</span>
                        {item.startTime ? <span>Started {formatDateTime(item.startTime)}</span> : null}
                        {item.endTime && item.status !== 'draft' ? (
                          <span>Remaining {formatRemainingTime(item.endTime, clockNow)}</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        <section className="space-y-6">
          {!selectedTest ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
              {autoOpenCreateModal
                ? `Create a ${filterKind === 'lab_task' ? 'lab task' : 'lab test'} to continue.`
                : `Select a ${filterKind === 'lab_task' ? 'lab task' : 'lab test'} to continue.`}
            </div>
          ) : (
            <>
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
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
                      {selectedTest.sectionName ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {selectedTest.sectionName}
                        </span>
                      ) : null}
                      {selectedTest.labClass?.labNumber ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          Lab {selectedTest.labClass.labNumber}
                        </span>
                      ) : null}
                    </div>

                    <h3 className="mt-3 text-2xl font-semibold text-slate-900">
                      {getActivityDisplayTitle(selectedTest)}
                    </h3>

                    {selectedTest.description ? (
                      <p className="mt-2 text-sm text-slate-600">{selectedTest.description}</p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={14} />
                        Duration {formatDurationLabel(selectedDurationMinutes)}
                      </span>
                      {selectedTest.startTime ? (
                        <span>Started {formatDateTime(selectedTest.startTime)}</span>
                      ) : null}
                      {selectedTest.endTime && selectedTest.status !== 'draft' ? (
                        <span>
                          {selectedTest.status === 'ended' ? 'Ended' : 'Ends'}{' '}
                          {formatDateTime(selectedTest.endTime)}
                        </span>
                      ) : null}
                      {selectedTest.endTime && selectedTest.status !== 'draft' ? (
                        <span>Remaining {formatRemainingTime(selectedTest.endTime, clockNow)}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {canEditSelectedTest ? (
                      <button
                        type="button"
                        onClick={openEditForm}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        <PencilLine size={16} />
                        Edit
                      </button>
                    ) : null}
                    {selectedTest.status === 'draft' ? (
                      <button
                        type="button"
                        onClick={() => startMutation.mutate(selectedTest.id)}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                      >
                        <PlayCircle size={16} />
                        Start
                      </button>
                    ) : null}
                    {selectedTest.status === 'running' ? (
                      <button
                        type="button"
                        onClick={() => endMutation.mutate(selectedTest.id)}
                        className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
                      >
                        <StopCircle size={16} />
                        End
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                  {[
                    { key: 'manage' as const, label: 'Manage' },
                    { key: 'problems' as const, label: 'Problems' },
                    {
                      key: 'submissions' as const,
                      label: `Submissions (${(submissions as any[]).length})`,
                    },
                    {
                      key: 'alerts' as const,
                      label: `Alerts (${(proctoringEvents as any[]).length})`,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActivityTab(tab.key)}
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                        activityTab === tab.key
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {activityTab === 'manage' ? (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                  <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          Added Problems ({(problems as any[]).length})
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Score is set here for this activity.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActivityTab('problems')}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        <Files size={15} />
                        Problem Library
                      </button>
                    </div>

                    {manageLocked ? (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                        Problem list is locked after the activity starts.
                      </div>
                    ) : null}

                    <div className="mt-5 space-y-3">
                      {(problems as any[]).map((problem: any) => {
                        const scoreValue = scoreDrafts[problem.id] ?? '';
                        const isSavingScore =
                          updateActivityProblemMutation.isPending &&
                          updateActivityProblemMutation.variables?.problemId === problem.id;
                        const isRemoving =
                          removeProblemMutation.isPending &&
                          removeProblemMutation.variables === problem.id;

                        return (
                          <div
                            key={problem.id}
                            className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                                    {getProblemCode(problem, sourceProblemMap)}
                                  </span>
                                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                                    {`Problem ${problem.orderIndex ?? ''}`}
                                  </span>
                                </div>
                                <h4 className="mt-3 text-base font-semibold text-slate-900">
                                  {problem.title}
                                </h4>
                                <p className="mt-2 text-sm text-slate-500">
                                  {problem.timeLimitMs ?? 1000} ms · {problem.memoryLimitKb ?? 262144} KB
                                </p>
                              </div>

                              <div className="flex flex-col gap-3 sm:min-w-[220px]">
                                <div className="flex gap-2">
                                  <input
                                    value={scoreValue}
                                    onChange={(event) =>
                                      setScoreDrafts((current) => ({
                                        ...current,
                                        [problem.id]: event.target.value,
                                      }))
                                    }
                                    type="number"
                                    placeholder="Score"
                                    disabled={manageLocked}
                                    className={`${inputClass} h-10`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveScore(problem)}
                                    disabled={manageLocked || isSavingScore}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <Save size={14} />
                                    {isSavingScore ? 'Saving...' : 'Save'}
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => removeProblemMutation.mutate(problem.id)}
                                  disabled={manageLocked || isRemoving}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <Trash2 size={14} />
                                  {isRemoving ? 'Removing...' : 'Remove'}
                                </button>
                              </div>
                            </div>

                            <p className="mt-3 line-clamp-4 text-sm text-slate-600">
                              {problem.statement}
                            </p>
                          </div>
                        );
                      })}

                      {!(problems as any[]).length ? (
                        <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                          No problems added yet.
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Add Problems</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Add from your own library or the shared bank.
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 space-y-4">
                      <CollapsibleLibrary
                        title="My Problems"
                        count={myProblems.length}
                        open={showMyProblemsPanel}
                        onToggle={() => setShowMyProblemsPanel((current) => !current)}
                      >
                        {myProblems.length ? (
                          myProblems.map((problem: any) => {
                            const alreadyAdded = selectedSourceProblemIds.has(problem.id);
                            const isAdding =
                              importProblemMutation.isPending &&
                              importProblemMutation.variables === problem.id;
                            return (
                              <ManageProblemCard
                                key={problem.id}
                                problem={problem}
                                problemCode={getProblemCode(problem)}
                                added={alreadyAdded}
                                disabled={alreadyAdded || manageLocked}
                                isPending={isAdding}
                                onAdd={() => importProblemMutation.mutate(problem.id)}
                              />
                            );
                          })
                        ) : (
                          <EmptyMiniState text="No problems created by you yet." />
                        )}
                      </CollapsibleLibrary>

                      <CollapsibleLibrary
                        title="Problem Bank"
                        count={bankProblems.length}
                        open={showProblemBankPanel}
                        onToggle={() => setShowProblemBankPanel((current) => !current)}
                      >
                        {bankProblems.length ? (
                          bankProblems.map((problem: any) => {
                            const alreadyAdded = selectedSourceProblemIds.has(problem.id);
                            const isAdding =
                              importProblemMutation.isPending &&
                              importProblemMutation.variables === problem.id;
                            return (
                              <ManageProblemCard
                                key={problem.id}
                                problem={problem}
                                problemCode={getProblemCode(problem)}
                                added={alreadyAdded}
                                disabled={alreadyAdded || manageLocked}
                                isPending={isAdding}
                                onAdd={() => importProblemMutation.mutate(problem.id)}
                              />
                            );
                          })
                        ) : (
                          <EmptyMiniState text="No shared problems available." />
                        )}
                      </CollapsibleLibrary>
                    </div>
                  </section>
                </div>
              ) : null}

              {activityTab === 'problems' ? (
                <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                  <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">Problem Library</h3>
                        <p className="mt-1 text-sm text-slate-500">Browse and manage reusable problems.</p>
                      </div>
                      <button
                        type="button"
                        onClick={openNewProblemModal}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                      >
                        <Plus size={15} />
                        New Problem
                      </button>
                    </div>

                    <div className="mt-4 flex rounded-full border border-slate-200 bg-slate-50 p-1">
                      {[
                        { key: 'mine' as const, label: `My Problems (${myProblems.length})` },
                        { key: 'bank' as const, label: `Problem Bank (${bankProblems.length})` },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setProblemCatalogTab(tab.key)}
                          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                            problemCatalogTab === tab.key
                              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 space-y-3">
                      {activeCatalogProblems.map((problem: any) => {
                        const isActive = selectedCatalogProblem?.id === problem.id;
                        return (
                          <button
                            key={problem.id}
                            type="button"
                            onClick={() => setSelectedCatalogProblemId(problem.id)}
                            className={`w-full rounded-2xl border p-4 text-left transition ${
                              isActive
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                    isActive
                                      ? 'bg-white/10 text-white'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {getProblemCode(problem)}
                                </span>
                                <p
                                  className={`mt-3 truncate font-semibold ${
                                    isActive ? 'text-white' : 'text-slate-900'
                                  }`}
                                >
                                  {problem.title}
                                </p>
                              </div>
                            </div>
                            <p
                              className={`mt-2 line-clamp-2 text-sm ${
                                isActive ? 'text-slate-200' : 'text-slate-500'
                              }`}
                            >
                              {problem.statement}
                            </p>
                          </button>
                        );
                      })}

                      {!activeCatalogProblems.length ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          {problemCatalogTab === 'mine'
                            ? 'No personal problems yet.'
                            : 'No shared problems available.'}
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <ProblemPreviewCard
                    problem={selectedCatalogProblem}
                    userId={user?.id ?? null}
                    onEdit={
                      selectedCatalogProblem?.authorId === user?.id
                        ? () => openEditProblemModal(selectedCatalogProblem)
                        : undefined
                    }
                  />
                </div>
              ) : null}

              {activityTab === 'submissions' ? (
                <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="font-semibold text-slate-900">
                    Student Submissions ({(submissions as any[]).length})
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Review verdicts and update scores when needed.
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
                                {formatDateTime(submission.submittedAt)}
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
                                  placeholder="Optional note"
                                />
                              </Field>
                              <div className="flex justify-end gap-3">
                                <button
                                  type="button"
                                  onClick={() => setGradingSubId(null)}
                                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={gradeMutation.isPending}
                                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                                >
                                  Save Grade
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
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                              >
                                Grade Submission
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
              ) : null}

              {activityTab === 'alerts' ? (
                <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <ShieldAlert size={18} className="text-amber-600" />
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        Proctoring Alerts ({(proctoringEvents as any[]).length})
                      </h3>
                      <p className="text-sm text-slate-500">
                        Focus loss, fullscreen exits, and copy-paste attempts.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {(proctoringEvents as any[]).slice(0, 12).map((event: any) => (
                      <div
                        key={event.id}
                        className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {studentDisplayName(event.student)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatDateTime(event.createdAt)}
                            </p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                            {humanize(event.eventType)}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-amber-900">
                          {event.message ?? humanize(event.eventType)}
                        </p>
                      </div>
                    ))}

                    {!(proctoringEvents as any[]).length ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        No alerts recorded for this activity.
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
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
  children: ReactNode;
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
  renderBody: (index: number) => ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h5 className="font-semibold text-slate-900">{title}</h5>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={append}
          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-white"
        >
          Add Case
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {fields.map((field, index) => (
          <div key={field.id} className="rounded-2xl border border-slate-200 bg-white p-3">
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

function CollapsibleLibrary({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h4 className="font-semibold text-slate-900">{title}</h4>
          <p className="mt-1 text-xs text-slate-500">{count} problems</p>
        </div>
        {open ? (
          <ChevronDown size={18} className="text-slate-500" />
        ) : (
          <ChevronRight size={18} className="text-slate-500" />
        )}
      </button>

      {open ? <div className="mt-4 space-y-3">{children}</div> : null}
    </section>
  );
}

function ManageProblemCard({
  problem,
  problemCode,
  added,
  disabled,
  isPending,
  onAdd,
}: {
  problem: any;
  problemCode: string;
  added: boolean;
  disabled: boolean;
  isPending: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {problemCode}
          </span>
          <p className="mt-3 font-semibold text-slate-900">{problem.title}</p>
          <p className="mt-1 text-xs text-slate-500">
            {problem.timeLimitMs ?? 1000} ms · {problem.memoryLimitKb ?? 262144} KB
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled || isPending}
          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {added ? 'Added' : isPending ? 'Adding...' : 'Add'}
        </button>
      </div>
      <p className="mt-2 line-clamp-3 text-sm text-slate-600">{problem.statement}</p>
    </div>
  );
}

function EmptyMiniState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function ProblemPreviewCard({
  problem,
  userId,
  onEdit,
}: {
  problem: any;
  userId: string | null;
  onEdit?: () => void;
}) {
  if (!problem) {
    return (
      <section className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
        Select a problem to view it.
      </section>
    );
  }

  const isOwner = problem.authorId === userId;

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
              {getProblemCode(problem)}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {isOwner ? 'My Problem' : 'Problem Bank'}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {problem.timeLimitMs ?? 1000} ms
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {problem.memoryLimitKb ?? 262144} KB
            </span>
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-slate-900">{problem.title}</h3>
        </div>

        {isOwner && onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <PencilLine size={16} />
            Edit
          </button>
        ) : null}
      </div>

      <article className="mt-6 space-y-6">
        <div className="whitespace-pre-wrap text-[15px] leading-8 text-slate-700">
          {problem.statement}
        </div>

        {problem.inputDescription ? (
          <section>
            <h4 className="text-lg font-semibold text-slate-900">Input</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">
              {problem.inputDescription}
            </p>
          </section>
        ) : null}

        {problem.outputDescription ? (
          <section>
            <h4 className="text-lg font-semibold text-slate-900">Output</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">
              {problem.outputDescription}
            </p>
          </section>
        ) : null}

        {(problem.sampleTestCases ?? []).length ? (
          <section className="space-y-4">
            <h4 className="text-lg font-semibold text-slate-900">Sample Test Cases</h4>
            {(problem.sampleTestCases ?? []).map((sample: any, index: number) => (
              <div
                key={`${problem.id}-${index}`}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Sample {index + 1}
                </p>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-500">Input</p>
                    <pre className="overflow-auto rounded-xl bg-white p-3 text-xs text-slate-700">
                      {sample.input}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-500">Output</p>
                    <pre className="overflow-auto rounded-xl bg-white p-3 text-xs text-slate-700">
                      {sample.output}
                    </pre>
                  </div>
                </div>
                {sample.explanation ? (
                  <p className="mt-3 text-xs text-slate-500">{sample.explanation}</p>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}
      </article>
    </section>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-900';
