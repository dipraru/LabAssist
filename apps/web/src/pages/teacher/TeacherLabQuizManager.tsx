import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Clock3,
  Download,
  Eye,
  FileQuestion,
  PencilLine,
  PlayCircle,
  Plus,
  Save,
  Search,
  ShieldAlert,
  StopCircle,
  Trash2,
  Upload,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Modal } from '../../components/Modal';
import { courseCode, courseTitle } from '../../lib/display';
import { formatDateTime, getCourseSectionNames, StudentAvatar } from './teacher.shared';

const quizSchema = z.object({
  title: z.string().trim().min(2, 'Title is required'),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive('Duration is required'),
  totalMarks: z.number().min(0).optional(),
  sectionName: z.string().trim().min(1, 'Section is required'),
  labClassId: z.string().trim().min(1, 'Lab class is required'),
  questionDisplayMode: z.enum(['all', 'one_by_one']),
  proctoringEnabled: z.boolean(),
});

const questionSchema = z
  .object({
    questionType: z.enum(['mcq', 'short_answer']),
    prompt: z.string().trim().min(2, 'Question is required'),
    marks: z.number().min(0, 'Marks are required'),
    correctOptionIndex: z.number().int().min(0).optional(),
    options: z.array(
      z.object({
        text: z.string().optional(),
      }),
    ),
  })
  .superRefine((value, context) => {
    if (value.questionType !== 'mcq') return;
    const options = value.options.filter((option) => option.text?.trim());
    if (options.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Add at least two options',
      });
    }
    if (
      value.correctOptionIndex === undefined ||
      value.correctOptionIndex < 0 ||
      value.correctOptionIndex >= value.options.length ||
      !value.options[value.correctOptionIndex]?.text?.trim()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correctOptionIndex'],
        message: 'Select the correct answer',
      });
    }
  });

type QuizFormData = z.infer<typeof quizSchema>;
type QuestionFormData = z.infer<typeof questionSchema>;

type HeadingCopy = {
  eyebrow?: string;
  title?: string;
  description?: string;
};

function countUnquotedDelimiters(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      count += 1;
    }
  }

  return count;
}

function detectCsvDelimiter(text: string): string {
  const sampleLines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  const candidates = [',', ';', '\t'];

  return candidates.reduce(
    (best, delimiter) => {
      const delimiterCounts = sampleLines.map((line) =>
        countUnquotedDelimiters(line, delimiter),
      );
      const rowsWithDelimiter = delimiterCounts.filter((count) => count > 0).length;
      const totalDelimiters = delimiterCounts.reduce((sum, count) => sum + count, 0);
      const score = rowsWithDelimiter * 100 + totalDelimiters;

      return score > best.score ? { delimiter, score } : best;
    },
    { delimiter: ',', score: 0 },
  ).delimiter;
}

function isBulkQuestionHeader(row: string[]): boolean {
  const firstCell = row[0]?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
  if (!['question', 'questions', 'prompt'].includes(firstCell)) return false;
  return row
    .slice(1)
    .some(
      (cell) =>
        /^option(\s*\d+)?$/i.test(cell.trim()) ||
        /^choice(\s*\d+)?$/i.test(cell.trim()),
    );
}

function parseCsvRows(text: string): string[][] {
  const delimiter = detectCsvDelimiter(text);
  const normalizedText = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const next = normalizedText[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(current.trim());
      current = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(current.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      current = '';
      continue;
    }
    current += char;
  }

  row.push(current.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function buildBulkQuestionsFromCsv(text: string): QuestionFormData[] {
  const questions: QuestionFormData[] = [];
  const rows = parseCsvRows(text);
  for (const [index, row] of rows.entries()) {
    if (index === 0 && isBulkQuestionHeader(row)) continue;
    const prompt = row[0]?.trim() ?? '';
    if (!prompt) continue;
    const options = row.slice(1).map((value) => value.trim()).filter(Boolean);
    if (options.length >= 1) {
      questions.push({
        questionType: 'mcq',
        prompt,
        marks: 1,
        correctOptionIndex: 0,
        options: options.map((option) => ({ text: option })),
      });
      continue;
    }
    questions.push({
      questionType: 'short_answer',
      prompt,
      marks: 1,
      correctOptionIndex: 0,
      options: [{ text: '' }, { text: '' }],
    });
  }
  return questions;
}

function serializeQuestionPayload(values: QuestionFormData) {
  return {
    questionType: values.questionType,
    prompt: values.prompt,
    marks: values.marks,
    options:
      values.questionType === 'mcq'
        ? values.options.map((option) => option.text?.trim() ?? '').filter(Boolean)
        : undefined,
    correctOptionIndex:
      values.questionType === 'mcq' ? values.correctOptionIndex : undefined,
  };
}

export function TeacherLabQuizManager({
  fixedCourseId,
  disableCreation = false,
  heading,
}: {
  fixedCourseId: string;
  disableCreation?: boolean;
  heading?: HeadingCopy;
}) {
  const queryClient = useQueryClient();
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showBulkQuestionModal, setShowBulkQuestionModal] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [bulkQuestionDrafts, setBulkQuestionDrafts] = useState<QuestionFormData[]>([]);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'questions' | 'submissions' | 'evaluations' | 'alerts'>('questions');
  const [alertRollQuery, setAlertRollQuery] = useState('');
  const [answerSheetTarget, setAnswerSheetTarget] = useState<{
    row: any;
    mode: 'view' | 'evaluate';
  } | null>(null);

  const { data: course } = useQuery({
    queryKey: ['teacher-course', fixedCourseId],
    queryFn: () => api.get(`/courses/${fixedCourseId}`).then((response) => response.data),
    enabled: Boolean(fixedCourseId),
  });

  const { data: labClasses = [] } = useQuery({
    queryKey: ['teacher-course-lab-classes', fixedCourseId],
    queryFn: () =>
      api.get(`/courses/${fixedCourseId}/lab-classes`).then((response) => response.data),
    enabled: Boolean(fixedCourseId),
  });

  const { data: quizzes = [], isLoading: quizzesLoading } = useQuery({
    queryKey: ['teacher-lab-quizzes', fixedCourseId],
    queryFn: () =>
      api.get(`/lab-quizzes/course/${fixedCourseId}`).then((response) => response.data),
    enabled: Boolean(fixedCourseId),
    refetchInterval: (query) =>
      (query.state.data as any[])?.some((quiz: any) => quiz.status === 'running')
        ? 5000
        : false,
  });

  const selectedQuiz =
    (quizzes as any[]).find((quiz: any) => quiz.id === selectedQuizId) ?? null;

  const { data: quizDetail } = useQuery({
    queryKey: ['teacher-lab-quiz-detail', selectedQuizId],
    queryFn: () => api.get(`/lab-quizzes/${selectedQuizId}`).then((response) => response.data),
    enabled: Boolean(selectedQuizId),
  });

  const activeQuiz = quizDetail ?? selectedQuiz;
  const questions = activeQuiz?.questions ?? [];

  const { data: attemptsData } = useQuery({
    queryKey: ['teacher-lab-quiz-attempts', selectedQuizId],
    queryFn: () =>
      api.get(`/lab-quizzes/${selectedQuizId}/attempts`).then((response) => response.data),
    enabled: Boolean(selectedQuizId),
    refetchInterval: activeQuiz?.status === 'running' ? 5000 : false,
  });

  const { data: proctoringEvents = [] } = useQuery({
    queryKey: ['teacher-lab-quiz-alerts', selectedQuizId],
    queryFn: () =>
      api
        .get(`/lab-quizzes/${selectedQuizId}/proctoring-events`)
        .then((response) => response.data),
    enabled: Boolean(selectedQuizId),
    refetchInterval: activeQuiz?.status === 'running' ? 5000 : false,
  });

  const sectionNames = useMemo(
    () => ['All Students', ...getCourseSectionNames(course).filter((item) => item !== 'All Students')],
    [course],
  );
  const totalQuestionMarks = useMemo(
    () => (questions as any[]).reduce((sum, question) => sum + Number(question.marks ?? 0), 0),
    [questions],
  );
  const hasShortQuestions = useMemo(
    () => (questions as any[]).some((question) => question.questionType === 'short_answer'),
    [questions],
  );
  const bulkQuestionSummary = useMemo(
    () =>
      bulkQuestionDrafts.reduce(
        (summary, question) => ({
          mcq: summary.mcq + (question.questionType === 'mcq' ? 1 : 0),
          short: summary.short + (question.questionType === 'short_answer' ? 1 : 0),
        }),
        { mcq: 0, short: 0 },
      ),
    [bulkQuestionDrafts],
  );
  const attemptRows = attemptsData?.rows ?? [];
  const submittedRows = useMemo(
    () => attemptRows.filter((row: any) => Boolean(row.attempt?.submittedAt)),
    [attemptRows],
  );
  const alertedStudentIds = useMemo(
    () =>
      new Set(
        (proctoringEvents as any[])
          .map((event: any) => event.student?.id ?? event.studentId)
          .filter(Boolean),
      ),
    [proctoringEvents],
  );
  const pendingEvaluationCount = useMemo(
    () =>
      attemptRows.filter(
        (row: any) => row.attempt?.submittedAt && !row.attempt?.evaluationComplete,
      ).length,
    [attemptRows],
  );
  const evaluatedCount = useMemo(
    () =>
      attemptRows.filter(
        (row: any) => row.attempt?.submittedAt && row.attempt?.evaluationComplete,
      ).length,
    [attemptRows],
  );

  const quizForm = useForm<QuizFormData>({
    resolver: zodResolver(quizSchema),
    defaultValues: {
      title: '',
      description: '',
      durationMinutes: 20,
      totalMarks: 10,
      sectionName: 'All Students',
      labClassId: '',
      questionDisplayMode: 'all',
      proctoringEnabled: true,
    },
  });
  const watchedSectionName = quizForm.watch('sectionName');
  const availableQuizLabClasses = useMemo(() => {
    const scopedSectionName = `${watchedSectionName ?? 'All Students'}`.trim() || 'All Students';
    return (labClasses as any[]).filter((labClass: any) =>
      (labClass.sections ?? []).some((section: any) => {
        const sectionName = `${section?.sectionName ?? ''}`.trim();
        const conducted = section?.status === 'conducted';
        return (
          conducted &&
          (scopedSectionName === 'All Students' || sectionName === scopedSectionName)
        );
      }),
    );
  }, [labClasses, watchedSectionName]);

  const questionForm = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      questionType: 'mcq',
      prompt: '',
      marks: 1,
      correctOptionIndex: 0,
      options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
    },
  });

  const optionFields = useFieldArray({
    control: questionForm.control,
    name: 'options',
  });
  const questionType = questionForm.watch('questionType');
  const correctOptionIndex = questionForm.watch('correctOptionIndex');
  const editingQuestion = useMemo(
    () =>
      (questions as any[]).find((question: any) => question.id === editingQuestionId) ??
      null,
    [editingQuestionId, questions],
  );
  const answerOnlyQuestionEdit = Boolean(editingQuestion && activeQuiz?.status !== 'draft');
  const totalMarksMatch = useMemo(() => {
    const configured = Number(activeQuiz?.totalMarks);
    return Number.isFinite(configured) && Math.abs(configured - totalQuestionMarks) < 0.001;
  }, [activeQuiz?.totalMarks, totalQuestionMarks]);

  useEffect(() => {
    if (selectedQuizId && (quizzes as any[]).some((quiz: any) => quiz.id === selectedQuizId)) {
      return;
    }
    setSelectedQuizId((quizzes as any[])[0]?.id ?? null);
  }, [quizzes, selectedQuizId]);

  useEffect(() => {
    if (!sectionNames.includes(quizForm.getValues('sectionName'))) {
      quizForm.setValue('sectionName', sectionNames[0] ?? 'All Students');
    }
  }, [quizForm, sectionNames]);

  useEffect(() => {
    const currentLabClassId = quizForm.getValues('labClassId');
    if (
      currentLabClassId &&
      availableQuizLabClasses.some((labClass: any) => labClass.id === currentLabClassId)
    ) {
      return;
    }
    quizForm.setValue('labClassId', availableQuizLabClasses[0]?.id ?? '');
  }, [availableQuizLabClasses, quizForm]);

  useEffect(() => {
    const rows = attemptsData?.rows ?? [];
    setGradeDrafts((current) => {
      const next = { ...current };
      rows.forEach((row: any) => {
        const attempt = row.attempt;
        (attempt?.answers ?? []).forEach((answer: any) => {
          const key = `${attempt.id}:${answer.questionId}`;
          if (next[key] === undefined && answer.score !== null && answer.score !== undefined) {
            next[key] = String(answer.score);
          }
        });
      });
      return next;
    });
  }, [attemptsData]);

  const invalidateQuizQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['teacher-lab-quizzes'] });
    queryClient.invalidateQueries({ queryKey: ['teacher-lab-quiz-detail'] });
    queryClient.invalidateQueries({ queryKey: ['teacher-lab-quiz-attempts'] });
    queryClient.invalidateQueries({ queryKey: ['teacher-lab-quiz-alerts'] });
    queryClient.invalidateQueries({ queryKey: ['running-lab-quizzes'] });
    queryClient.invalidateQueries({ queryKey: ['student-course-lab-quizzes-page'] });
  };

  const resetQuizForm = () => {
    quizForm.reset({
      title: '',
      description: '',
      durationMinutes: 20,
      totalMarks: 10,
      sectionName: sectionNames[0] ?? 'All Students',
      labClassId: availableQuizLabClasses[0]?.id ?? '',
      questionDisplayMode: 'all',
      proctoringEnabled: true,
    });
  };

  const resetQuestionForm = () => {
    setEditingQuestionId(null);
    questionForm.reset({
      questionType: 'mcq',
      prompt: '',
      marks: 1,
      correctOptionIndex: 0,
      options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
    });
  };

  const createQuizMutation = useMutation({
    mutationFn: (values: QuizFormData) =>
      api.post('/lab-quizzes', {
        courseId: fixedCourseId,
        title: values.title,
        description: values.description?.trim() || undefined,
        durationMinutes: values.durationMinutes,
        totalMarks: values.totalMarks,
        sectionName: values.sectionName,
        labClassId: values.labClassId,
        questionDisplayMode: values.questionDisplayMode,
        proctoringEnabled: values.proctoringEnabled,
      }),
    onSuccess: (response) => {
      toast.success('Lab quiz created');
      invalidateQuizQueries();
      setSelectedQuizId(response.data.id);
      setShowQuizModal(false);
      resetQuizForm();
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to create lab quiz'),
  });

  const updateQuizMutation = useMutation({
    mutationFn: (values: QuizFormData) =>
      api.patch(`/lab-quizzes/${editingQuizId}`, {
        title: values.title,
        description: values.description?.trim() || undefined,
        durationMinutes: values.durationMinutes,
        totalMarks: values.totalMarks,
        sectionName: values.sectionName,
        labClassId: values.labClassId,
        questionDisplayMode: values.questionDisplayMode,
        proctoringEnabled: values.proctoringEnabled,
      }),
    onSuccess: () => {
      toast.success('Lab quiz updated');
      invalidateQuizQueries();
      setShowQuizModal(false);
      setEditingQuizId(null);
      resetQuizForm();
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to update lab quiz'),
  });

  const addQuestionMutation = useMutation({
    mutationFn: (values: QuestionFormData) =>
      api.post(
        `/lab-quizzes/${selectedQuizId}/questions`,
        serializeQuestionPayload(values),
      ),
    onSuccess: () => {
      toast.success('Question added');
      invalidateQuizQueries();
      setShowQuestionModal(false);
      resetQuestionForm();
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to add question'),
  });

  const bulkAddQuestionsMutation = useMutation({
    mutationFn: async (values: QuestionFormData[]) => {
      for (const question of values) {
        await api.post(
          `/lab-quizzes/${selectedQuizId}/questions`,
          serializeQuestionPayload(question),
        );
      }
    },
    onSuccess: () => {
      toast.success(`${bulkQuestionDrafts.length} questions added`);
      setBulkQuestionDrafts([]);
      setShowBulkQuestionModal(false);
      invalidateQuizQueries();
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to add questions'),
  });

  const updateQuestionMutation = useMutation({
    mutationFn: (values: QuestionFormData) => {
      const payload =
        activeQuiz?.status === 'draft'
          ? serializeQuestionPayload(values)
          : values.questionType === 'mcq'
            ? { correctOptionIndex: values.correctOptionIndex }
            : {};

      return api.patch(
        `/lab-quizzes/${selectedQuizId}/questions/${editingQuestionId}`,
        payload,
      );
    },
    onSuccess: () => {
      toast.success(answerOnlyQuestionEdit ? 'Answer updated' : 'Question updated');
      invalidateQuizQueries();
      setShowQuestionModal(false);
      resetQuestionForm();
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to update question'),
  });

  const removeQuestionMutation = useMutation({
    mutationFn: (questionId: string) =>
      api.delete(`/lab-quizzes/${selectedQuizId}/questions/${questionId}`),
    onSuccess: () => {
      toast.success('Question removed');
      invalidateQuizQueries();
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to remove question'),
  });

  const startMutation = useMutation({
    mutationFn: (quizId: string) => api.patch(`/lab-quizzes/${quizId}/start`),
    onSuccess: () => {
      toast.success('Lab quiz started');
      invalidateQuizQueries();
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to start lab quiz'),
  });

  const endMutation = useMutation({
    mutationFn: (quizId: string) => api.patch(`/lab-quizzes/${quizId}/end`),
    onSuccess: () => {
      toast.success('Lab quiz ended');
      invalidateQuizQueries();
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to end lab quiz'),
  });

  const gradeMutation = useMutation({
    mutationFn: ({
      attemptId,
      grades,
    }: {
      attemptId: string;
      grades: { questionId: string; score: number }[];
    }) =>
      api.patch(`/lab-quizzes/${selectedQuizId}/attempts/${attemptId}/grade`, {
        grades,
      }),
    onSuccess: () => {
      toast.success('Marks saved');
      queryClient.invalidateQueries({ queryKey: ['teacher-lab-quiz-attempts', selectedQuizId] });
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to save marks'),
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      api.get(`/lab-quizzes/${selectedQuizId}/report-pdf`).then((response) => response.data),
    onSuccess: (data: { pdf?: string; fileName?: string }) => {
      if (!data?.pdf) {
        toast.error('Could not generate quiz report');
        return;
      }
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${data.pdf}`;
      link.download = data.fileName ?? 'lab_quiz_results.pdf';
      link.click();
      toast.success('Quiz report downloaded');
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to download report'),
  });

  const openCreateQuiz = () => {
    setEditingQuizId(null);
    resetQuizForm();
    setShowQuizModal(true);
  };

  const handleBulkCsvUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const questionsFromCsv = buildBulkQuestionsFromCsv(text);
      if (!questionsFromCsv.length) {
        toast.error('No valid questions found in the CSV');
        return;
      }
      setBulkQuestionDrafts(questionsFromCsv);
      toast.success(`${questionsFromCsv.length} questions imported`);
    } catch {
      toast.error('Could not read the CSV file');
    }
  };

  const openBulkQuestionModal = () => {
    setBulkQuestionDrafts([]);
    setShowBulkQuestionModal(true);
  };

  const openEditQuiz = () => {
    if (!activeQuiz) return;
    setEditingQuizId(activeQuiz.id);
    quizForm.reset({
      title: activeQuiz.title ?? '',
      description: activeQuiz.description ?? '',
      durationMinutes: activeQuiz.durationMinutes ?? 20,
      totalMarks: activeQuiz.totalMarks ?? totalQuestionMarks,
      sectionName: activeQuiz.sectionName ?? 'All Students',
      labClassId: activeQuiz.labClassId ?? '',
      questionDisplayMode: activeQuiz.questionDisplayMode ?? 'all',
      proctoringEnabled: activeQuiz.proctoringEnabled ?? true,
    });
    setShowQuizModal(true);
  };

  const openEditQuestion = (question: any) => {
    setEditingQuestionId(question.id);
    questionForm.reset({
      questionType: question.questionType ?? 'mcq',
      prompt: question.prompt ?? '',
      marks: Number(question.marks ?? 1),
      correctOptionIndex:
        question.questionType === 'mcq'
          ? Math.max(
              0,
              (question.options ?? []).findIndex(
                (option: any) => option.id === question.correctOptionId,
              ),
            )
          : 0,
      options:
        question.questionType === 'mcq' && (question.options ?? []).length
          ? (question.options ?? []).map((option: any) => ({
              text: option.text ?? '',
            }))
          : [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
    });
    setShowQuestionModal(true);
  };

  const handleSaveAttemptGrades = (row: any) => {
    const attempt = row?.attempt;
    if (!attempt?.id) return;
    try {
      const grades = (questions as any[])
        .filter((question: any) => question.questionType === 'short_answer')
        .filter((question: any) =>
          (attempt.answers ?? []).some(
            (answer: any) => answer.questionId === question.id && answer.answerText,
          ),
        )
        .map((question: any) => {
          const key = `${attempt.id}:${question.id}`;
          const score = Number(gradeDrafts[key] ?? '');
          if (!Number.isFinite(score) || score < 0 || score > Number(question.marks ?? 0)) {
            throw new Error(`Enter a valid mark for ${question.prompt}`);
          }
          return { questionId: question.id, score };
        });

      if (!grades.length) {
        toast.error('No submitted short answers to evaluate');
        return;
      }

      gradeMutation.mutate(
        { attemptId: attempt.id, grades },
        {
          onSuccess: () => setAnswerSheetTarget(null),
        },
      );
    } catch (error: any) {
      toast.error(error.message ?? 'Enter valid marks');
    }
  };

  const canEdit = activeQuiz?.status === 'draft';
  const canDownloadReport = Boolean(attemptsData?.canDownloadReport);
  const tabs = [
    { id: 'questions', label: 'Questions', badge: questions.length },
    { id: 'submissions', label: 'Submissions', badge: submittedRows.length },
    { id: 'evaluations', label: 'Evaluations', badge: pendingEvaluationCount },
    { id: 'alerts', label: 'Alert', badge: (proctoringEvents as any[]).length },
  ] as const;
  const filteredProctoringEvents = useMemo(() => {
    const query = alertRollQuery.trim().toLowerCase();
    if (!query) return proctoringEvents as any[];
    return (proctoringEvents as any[]).filter((event: any) => {
      const roll = `${event.student?.studentId ?? ''}`.toLowerCase();
      const name = getStudentName(event.student).toLowerCase();
      return roll.includes(query) || name.includes(query);
    });
  }, [alertRollQuery, proctoringEvents]);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
              {heading?.eyebrow ?? 'Course Workspace'}
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-900">
              {heading?.title ?? 'Lab Quiz'}
            </h2>
            {heading?.description ? (
              <p className="mt-2 max-w-3xl text-sm text-slate-500">{heading.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={openCreateQuiz}
            disabled={disableCreation}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={16} />
            New Quiz
          </button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <FileQuestion size={18} className="text-slate-700" />
            <div>
              <h3 className="font-semibold text-slate-900">Lab Quiz</h3>
              <p className="text-sm text-slate-500">Select one to manage.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {quizzesLoading ? (
              [1, 2, 3].map((item) => (
                <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-50" />
              ))
            ) : !(quizzes as any[]).length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No lab quiz created yet.
              </div>
            ) : (
              (quizzes as any[]).map((quiz: any) => (
                <button
                  key={quiz.id}
                  type="button"
                  onClick={() => setSelectedQuizId(quiz.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedQuizId === quiz.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{quiz.title}</p>
                      <p className="mt-1 text-xs opacity-75">
                        {quiz.labClass?.labNumber ? `Lab ${quiz.labClass.labNumber} · ` : ''}
                        {quiz.sectionName ?? 'All Students'} · {quiz.durationMinutes} min
                      </p>
                    </div>
                    <StatusBadge status={quiz.status} inverted={selectedQuizId === quiz.id} />
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {!activeQuiz ? (
          <section className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
            Select or create a lab quiz to continue.
          </section>
        ) : (
          <section className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={activeQuiz.status} />
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {activeQuiz.sectionName ?? 'All Students'}
                    </span>
                    {activeQuiz.labClass?.labNumber ? (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700">
                        Lab {activeQuiz.labClass.labNumber}
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        activeQuiz.proctoringEnabled === false
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {activeQuiz.proctoringEnabled === false ? 'Alerts off' : 'Alerts on'}
                    </span>
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold text-slate-900">
                    {activeQuiz.title}
                  </h3>
                  {activeQuiz.description ? (
                    <p className="mt-2 text-sm text-slate-600">{activeQuiz.description}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 size={14} />
                      {activeQuiz.durationMinutes} min
                    </span>
                    <span>{questions.length} questions</span>
                    <span>{activeQuiz.totalMarks ?? totalQuestionMarks} marks</span>
                    {activeQuiz.status === 'draft' && !totalMarksMatch ? (
                      <span className="font-semibold text-rose-600">
                        Question marks total {totalQuestionMarks}
                      </span>
                    ) : null}
                    {activeQuiz.startTime ? <span>Started {formatDateTime(activeQuiz.startTime)}</span> : null}
                    {activeQuiz.endTime ? <span>Ends {formatDateTime(activeQuiz.endTime)}</span> : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={openEditQuiz}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <PencilLine size={16} />
                      Edit
                    </button>
                  ) : null}
                  {activeQuiz.status === 'draft' ? (
                    <button
                      type="button"
                      onClick={() => startMutation.mutate(activeQuiz.id)}
                      disabled={!totalMarksMatch || startMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <PlayCircle size={16} />
                      Start
                    </button>
                  ) : null}
                  {activeQuiz.status === 'running' ? (
                    <button
                      type="button"
                      onClick={() => endMutation.mutate(activeQuiz.id)}
                      className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
                    >
                      <StopCircle size={16} />
                      End
                    </button>
                  ) : null}
                  {activeQuiz.status === 'ended' ? (
                    <button
                      type="button"
                      onClick={() => reportMutation.mutate()}
                      disabled={!canDownloadReport || reportMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download size={16} />
                      {reportMutation.isPending ? 'Preparing...' : 'Download PDF'}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                      activeTab === tab.id
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        activeTab === tab.id
                          ? 'bg-white/15 text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  </button>
                ))}
              </div>

              <div className="p-5">
                {activeTab === 'questions' ? (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Questions</h3>
                        <p className="text-sm text-slate-500">MCQ answers are evaluated automatically.</p>
                      </div>
                      {canEdit ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              resetQuestionForm();
                              setShowQuestionModal(true);
                            }}
                            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                          >
                            <Plus size={15} />
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={openBulkQuestionModal}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            <Upload size={15} />
                            Bulk Add
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-3">
                      {(questions as any[]).length ? (
                        (questions as any[]).map((question: any, index: number) => (
                          <div key={question.id} className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                                  Q{index + 1} · {question.questionType === 'mcq' ? 'MCQ' : 'Short'} · {question.marks} marks
                                </span>
                                <p className="mt-3 whitespace-pre-wrap text-sm font-semibold text-slate-900">
                                  {question.prompt}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditQuestion(question)}
                                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
                                  title={
                                    activeQuiz.status === 'draft'
                                      ? 'Edit question'
                                      : 'Edit answer'
                                  }
                                >
                                  <PencilLine size={15} />
                                </button>
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={() => removeQuestionMutation.mutate(question.id)}
                                    className="rounded-xl border border-rose-200 bg-white p-2 text-rose-600 transition hover:bg-rose-50"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {question.questionType === 'mcq' ? (
                              <div className="mt-3 space-y-2">
                                {(question.options ?? []).map((option: any) => (
                                  <div
                                    key={option.id}
                                    className={`rounded-xl border px-3 py-2 text-sm ${
                                      option.id === question.correctOptionId
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : 'border-slate-200 bg-white text-slate-600'
                                    }`}
                                  >
                                    {option.text}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <EmptyState title="No questions yet" />
                      )}
                    </div>
                  </div>
                ) : null}

                {activeTab === 'submissions' ? (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Submissions</h3>
                        <p className="text-sm text-slate-500">{submittedRows.length} submitted</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {submittedRows.length ? (
                        submittedRows.map((row: any) => (
                          <StudentQuizRow
                            key={row.student.id}
                            row={row}
                            warned={alertedStudentIds.has(row.student.id)}
                            actionLabel="View"
                            actionIcon={<Eye size={15} />}
                            onAction={() => setAnswerSheetTarget({ row, mode: 'view' })}
                          />
                        ))
                      ) : (
                        <EmptyState title="No submissions yet" />
                      )}
                    </div>
                  </div>
                ) : null}

                {activeTab === 'evaluations' ? (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Evaluations</h3>
                        <p className="text-sm text-slate-500">
                          {pendingEvaluationCount} pending · {evaluatedCount} evaluated
                        </p>
                      </div>
                      {hasShortQuestions && activeQuiz.status === 'ended' ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                          Manual marks required
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-3">
                      {submittedRows.length ? (
                        submittedRows.map((row: any) => (
                          <StudentQuizRow
                            key={row.student.id}
                            row={row}
                            warned={alertedStudentIds.has(row.student.id)}
                            actionLabel="Manual Evaluate"
                            actionIcon={<Save size={15} />}
                            disabled={activeQuiz.status !== 'ended'}
                            onAction={() =>
                              setAnswerSheetTarget({
                                row,
                                mode: 'evaluate',
                              })
                            }
                          />
                        ))
                      ) : (
                        <EmptyState title="No submitted papers to evaluate" />
                      )}
                    </div>
                  </div>
                ) : null}

                {activeTab === 'alerts' ? (
                  <div>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-center gap-3">
                        <ShieldAlert size={18} className="text-amber-600" />
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">Alert</h3>
                          <p className="text-sm text-slate-500">Fullscreen, tab, window, and clipboard events.</p>
                        </div>
                      </div>
                      <label className="relative w-full max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                          value={alertRollQuery}
                          onChange={(event) => setAlertRollQuery(event.target.value)}
                          placeholder="Search by roll"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-sky-400 focus:bg-white"
                        />
                      </label>
                    </div>
                    <div className="mt-4 space-y-2">
                      {filteredProctoringEvents.length ? (
                        filteredProctoringEvents.map((event: any) => (
                          <div key={event.id} className="flex flex-col gap-2 rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <span className="font-medium text-amber-900">
                              {getStudentName(event.student)} · {event.student?.studentId ?? 'No roll'} · {String(event.eventType).replace(/_/g, ' ')}
                            </span>
                            <span className="text-xs text-amber-700">{formatDateTime(event.createdAt)}</span>
                          </div>
                        ))
                      ) : (
                        <EmptyState title="No alerts recorded" />
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </section>
        )}
      </div>

      <Modal
        open={showQuizModal}
        onClose={() => {
          setShowQuizModal(false);
          setEditingQuizId(null);
          resetQuizForm();
        }}
        title={editingQuizId ? 'Edit Lab Quiz' : 'New Lab Quiz'}
        maxWidthClass="max-w-2xl"
      >
        <form
          onSubmit={quizForm.handleSubmit((values) =>
            editingQuizId
              ? updateQuizMutation.mutate(values)
              : createQuizMutation.mutate(values),
          )}
          className="space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title" error={quizForm.formState.errors.title?.message}>
              <input {...quizForm.register('title')} className={inputClass} placeholder="Lab Quiz 1" />
            </Field>
            <Field label="Section" error={quizForm.formState.errors.sectionName?.message}>
              <select {...quizForm.register('sectionName')} className={inputClass}>
                {sectionNames.map((sectionName) => (
                  <option key={sectionName} value={sectionName}>
                    {sectionName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lab Class" error={quizForm.formState.errors.labClassId?.message}>
              <select {...quizForm.register('labClassId')} className={inputClass}>
                <option value="">
                  {availableQuizLabClasses.length
                    ? 'Select a conducted lab class'
                    : 'No conducted lab class'}
                </option>
                {availableQuizLabClasses.map((labClass: any) => (
                  <option key={labClass.id} value={labClass.id}>
                    Lab {labClass.labNumber} - {labClass.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Duration (minutes)" error={quizForm.formState.errors.durationMinutes?.message}>
              <input
                type="number"
                {...quizForm.register('durationMinutes', {
                  setValueAs: (value) => (value === '' ? undefined : Number(value)),
                })}
                className={inputClass}
              />
            </Field>
            <Field label="Total Marks" error={quizForm.formState.errors.totalMarks?.message}>
              <input
                type="number"
                {...quizForm.register('totalMarks', {
                  setValueAs: (value) => (value === '' ? undefined : Number(value)),
                })}
                className={inputClass}
              />
            </Field>
            <Field label="Question Display" error={quizForm.formState.errors.questionDisplayMode?.message}>
              <select {...quizForm.register('questionDisplayMode')} className={inputClass}>
                <option value="all">Show all questions</option>
                <option value="one_by_one">Show one by one</option>
              </select>
            </Field>
          </div>
          <Field label="Description" error={quizForm.formState.errors.description?.message}>
            <textarea {...quizForm.register('description')} className={`${inputClass} min-h-24`} />
          </Field>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input type="checkbox" {...quizForm.register('proctoringEnabled')} />
            Enable alert system
          </label>
          {course ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {courseCode(course)} - {courseTitle(course)}
            </div>
          ) : null}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowQuizModal(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
              Cancel
            </button>
            <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              <Save size={16} />
              Save
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showQuestionModal}
        onClose={() => {
          setShowQuestionModal(false);
          resetQuestionForm();
        }}
        title={
          editingQuestion
            ? answerOnlyQuestionEdit
              ? 'Edit Answer'
              : 'Edit Question'
            : 'Add Question'
        }
        maxWidthClass="max-w-3xl"
      >
        <form
          onSubmit={questionForm.handleSubmit((values) =>
            editingQuestionId
              ? updateQuestionMutation.mutate(values)
              : addQuestionMutation.mutate(values),
          )}
          className="space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Question Type">
              <select
                {...questionForm.register('questionType')}
                disabled={answerOnlyQuestionEdit}
                className={inputClass}
              >
                <option value="mcq">MCQ</option>
                <option value="short_answer">Short Answer</option>
              </select>
            </Field>
            <Field label="Marks" error={questionForm.formState.errors.marks?.message}>
              <input
                type="number"
                {...questionForm.register('marks', {
                  setValueAs: (value) => (value === '' ? undefined : Number(value)),
                })}
                disabled={answerOnlyQuestionEdit}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Question" error={questionForm.formState.errors.prompt?.message}>
            <textarea
              {...questionForm.register('prompt')}
              disabled={answerOnlyQuestionEdit}
              className={`${inputClass} min-h-28`}
            />
          </Field>

          {questionType === 'mcq' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Options</p>
                {!answerOnlyQuestionEdit ? (
                  <button
                    type="button"
                    onClick={() => optionFields.append({ text: '' })}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    Add option
                  </button>
                ) : null}
              </div>
              {optionFields.fields.map((field, index) => (
                <div key={field.id} className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                  <input
                    type="radio"
                    checked={correctOptionIndex === index}
                    onChange={() => questionForm.setValue('correctOptionIndex', index)}
                  />
                  <input
                    {...questionForm.register(`options.${index}.text`)}
                    disabled={answerOnlyQuestionEdit}
                    className={inputClass}
                    placeholder={`Option ${index + 1}`}
                  />
                  {!answerOnlyQuestionEdit ? (
                    <button
                      type="button"
                      onClick={() => optionFields.remove(index)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
              {questionForm.formState.errors.options?.message ? (
                <p className="text-xs text-rose-500">
                  {String(questionForm.formState.errors.options.message)}
                </p>
              ) : null}
              {questionForm.formState.errors.correctOptionIndex?.message ? (
                <p className="text-xs text-rose-500">
                  {String(questionForm.formState.errors.correctOptionIndex.message)}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowQuestionModal(false);
                resetQuestionForm();
              }}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addQuestionMutation.isPending || updateQuestionMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={16} />
              {editingQuestion
                ? answerOnlyQuestionEdit
                  ? 'Save Answer'
                  : 'Save Question'
                : 'Add Question'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showBulkQuestionModal}
        onClose={() => {
          setShowBulkQuestionModal(false);
          setBulkQuestionDrafts([]);
        }}
        title="Bulk Add Questions"
        maxWidthClass="max-w-lg"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            <p className="font-semibold text-slate-900">CSV format</p>
            <p>Question, Option 1, Option 2, Option 3, ...</p>
            <p>Comma, semicolon, and tab-separated files are supported.</p>
            <p>Rows with one or more option columns become MCQ questions.</p>
            <p>Rows with empty option columns become short questions.</p>
            <p>MCQ correct answer defaults to the first option.</p>
          </div>
          <Field label="CSV File">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                handleBulkCsvUpload(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
              className={inputClass}
            />
          </Field>
          {bulkQuestionDrafts.length ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">
                {bulkQuestionDrafts.length} questions ready to import
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {bulkQuestionSummary.mcq} MCQ · {bulkQuestionSummary.short} short
              </p>
            </div>
          ) : null}
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => {
                setShowBulkQuestionModal(false);
                setBulkQuestionDrafts([]);
              }}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => bulkAddQuestionsMutation.mutate(bulkQuestionDrafts)}
              disabled={!bulkQuestionDrafts.length || bulkAddQuestionsMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload size={15} />
              {bulkAddQuestionsMutation.isPending ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      </Modal>

      <AnswerSheetModal
        open={Boolean(answerSheetTarget && activeQuiz)}
        row={answerSheetTarget?.row}
        mode={answerSheetTarget?.mode ?? 'view'}
        quiz={activeQuiz}
        questions={questions as any[]}
        gradeDrafts={gradeDrafts}
        setGradeDrafts={setGradeDrafts}
        saving={gradeMutation.isPending}
        onSave={() => answerSheetTarget?.row && handleSaveAttemptGrades(answerSheetTarget.row)}
        onClose={() => setAnswerSheetTarget(null)}
      />
    </div>
  );
}

function getStudentName(student: any): string {
  return (
    student?.fullName ??
    student?.user?.fullName ??
    student?.user?.username ??
    'Unnamed Student'
  );
}

function getStudentRoll(student: any): string {
  return student?.studentId ?? 'No roll';
}

function StudentQuizRow({
  row,
  warned,
  actionLabel,
  actionIcon,
  disabled = false,
  onAction,
}: {
  row: any;
  warned: boolean;
  actionLabel: string;
  actionIcon: ReactNode;
  disabled?: boolean;
  onAction: () => void;
}) {
  const attempt = row.attempt ?? {};
  const submitted = Boolean(attempt.submittedAt);
  const evaluated = submitted && Boolean(attempt.evaluationComplete);

  return (
    <div className="flex flex-col gap-4 rounded-[22px] border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative shrink-0">
          <StudentAvatar student={row.student} />
          {warned ? (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white ring-2 ring-white">
              <AlertTriangle size={12} />
            </span>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {getStudentName(row.student)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Roll {getStudentRoll(row.student)} · {row.sectionName}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            submitted ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {submitted ? 'Submitted' : 'Not submitted'}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            !submitted
              ? 'bg-slate-100 text-slate-600'
              : evaluated
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
          }`}
        >
          {!submitted ? 'No answer sheet' : evaluated ? 'Evaluated' : 'Pending'}
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
          Total {attempt.totalScore ?? 0}
        </span>
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionIcon}
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function AnswerSheetModal({
  open,
  row,
  mode,
  quiz,
  questions,
  gradeDrafts,
  setGradeDrafts,
  saving,
  onSave,
  onClose,
}: {
  open: boolean;
  row: any;
  mode: 'view' | 'evaluate';
  quiz: any;
  questions: any[];
  gradeDrafts: Record<string, string>;
  setGradeDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const attempt = row?.attempt ?? {};
  const canEvaluate = Boolean(
    mode === 'evaluate' &&
      quiz?.status === 'ended' &&
      attempt?.id &&
      attempt?.submittedAt,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${getStudentName(row?.student)} Answer Sheet`}
      maxWidthClass="max-w-4xl"
    >
      {!row ? null : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <StudentAvatar student={row.student} />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {getStudentName(row.student)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Roll {getStudentRoll(row.student)} · {row.sectionName}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200">
                MCQ {attempt.mcqScore ?? 0}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200">
                Short {attempt.shortScore ?? 0}
              </span>
              <span className="rounded-full bg-slate-900 px-2.5 py-1 font-semibold text-white">
                Total {attempt.totalScore ?? 0}
              </span>
            </div>
          </div>

          {!attempt?.submittedAt ? (
            <EmptyState title="This student has not submitted the quiz yet" />
          ) : (
            <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
              {questions.map((question, index) => {
                const answer = (attempt.answers ?? []).find(
                  (item: any) => item.questionId === question.id,
                );
                const selectedOption = (question.options ?? []).find(
                  (option: any) => option.id === answer?.selectedOptionId,
                );
                const correctOption = (question.options ?? []).find(
                  (option: any) => option.id === question.correctOptionId,
                );
                const gradeKey = `${attempt.id}:${question.id}`;
                return (
                  <div key={question.id} className="rounded-[22px] border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        Q{index + 1} · {question.questionType === 'mcq' ? 'MCQ' : 'Short'} · {question.marks} marks
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {answer?.score ?? 0} scored
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm font-semibold text-slate-900">
                      {question.prompt}
                    </p>

                    {question.questionType === 'mcq' ? (
                      <div className="mt-3 space-y-2 text-sm">
                        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                          Submitted: {selectedOption?.text ?? 'No answer'}
                        </p>
                        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
                          Correct: {correctOption?.text ?? 'Not set'}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <p className="min-h-16 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                          {answer?.answerText || 'No answer submitted'}
                        </p>
                        {canEvaluate && answer?.answerText ? (
                          <input
                            type="number"
                            min={0}
                            max={question.marks}
                            value={gradeDrafts[gradeKey] ?? ''}
                            onChange={(event) =>
                              setGradeDrafts((current) => ({
                                ...current,
                                [gradeKey]: event.target.value,
                              }))
                            }
                            className="w-32 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-400 focus:bg-white"
                            placeholder={`/${question.marks}`}
                          />
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Close
            </button>
            {canEvaluate ? (
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={15} />
                {saving ? 'Saving...' : 'Save Evaluation'}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}

function StatusBadge({ status, inverted = false }: { status: string; inverted?: boolean }) {
  if (inverted) {
    return (
      <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white">
        {status.replace(/_/g, ' ')}
      </span>
    );
  }
  const className =
    status === 'running'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'ended'
        ? 'bg-slate-100 text-slate-600'
        : 'bg-amber-100 text-amber-700';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      {children}
      {error ? <p className="mt-1.5 text-xs text-rose-500">{error}</p> : null}
    </label>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
      {title}
    </div>
  );
}

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white';
