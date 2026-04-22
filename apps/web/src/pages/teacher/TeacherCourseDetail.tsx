import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  Download,
  FilePlus2,
  Files,
  FlaskConical,
  FolderArchive,
  Link2,
  PencilLine,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { studentDisplayName } from '../../lib/display';
import { Modal } from '../../components/Modal';
import { CourseAnnouncementsPanel } from '../../components/CourseAnnouncementsPanel';
import { TeacherLabActivityManager } from './TeacherLabActivityManager';
import { TeacherLabQuizManager } from './TeacherLabQuizManager';
import {
  StudentAvatar,
  TeacherAvatarStack,
  formatDateOnly,
  formatDateTime,
  getCourseSectionNames,
  getCourseStudents,
  getStudentsForSection,
  isCourseArchived,
  resolveStudentSection,
} from './teacher.shared';

const labClassSchema = z.object({
  title: z.string().trim().min(2, 'Lab class title is required'),
  description: z.string().optional(),
});

const assignmentSchema = z.object({
  title: z.string().trim().min(2, 'Assignment title is required'),
  caption: z.string().optional(),
  deadline: z.string().min(1, 'Deadline is required'),
  totalMarks: z.number().positive('Total marks must be positive'),
  allowLateSubmission: z.boolean().optional(),
  links: z.array(
    z.object({
      url: z.string().trim().url('Enter a valid URL').or(z.literal('')),
      label: z.string().optional(),
    }),
  ),
});

const materialSchema = z
  .object({
    title: z.string().trim().min(2, 'Material title is required'),
    description: z.string().optional(),
    placement: z.enum(['universal', 'lab_class']),
    labClassId: z.string().optional(),
    links: z.array(
      z.object({
        url: z.string().trim().url('Enter a valid URL').or(z.literal('')),
        label: z.string().optional(),
      }),
    ),
  })
  .refine((value) => value.links.some((link) => link.url.trim()), {
    message: 'Add at least one material link',
    path: ['links'],
  })
  .refine((value) => value.placement === 'universal' || Boolean(value.labClassId), {
    message: 'Select a lab class',
    path: ['labClassId'],
  });

const editMaterialSchema = z
  .object({
    title: z.string().trim().min(2, 'Material title is required'),
    description: z.string().optional(),
    links: z.array(
      z.object({
        url: z.string().trim().url('Enter a valid URL').or(z.literal('')),
        label: z.string().optional(),
      }),
    ),
  })
  .refine((value) => value.links.some((link) => link.url.trim()), {
    message: 'Add at least one material link',
    path: ['links'],
  });

type CourseTab =
  | 'lab-classes'
  | 'lecture-materials'
  | 'lab-tasks'
  | 'lab-tests'
  | 'lab-quizzes'
  | 'assignments'
  | 'announcements'
  | 'members';

type LabClassFormValues = z.infer<typeof labClassSchema>;
type AssignmentFormValues = z.infer<typeof assignmentSchema>;
type MaterialFormValues = z.infer<typeof materialSchema>;
type EditMaterialFormValues = z.infer<typeof editMaterialSchema>;

const tabItems: { key: CourseTab; label: string; icon: ReactNode }[] = [
  { key: 'lab-classes', label: 'Lab Classes', icon: <FlaskConical size={16} /> },
  { key: 'lecture-materials', label: 'Lecture Materials', icon: <Files size={16} /> },
  { key: 'lab-tasks', label: 'Lab Tasks', icon: <BookOpen size={16} /> },
  { key: 'lab-tests', label: 'Lab Tests', icon: <BookOpen size={16} /> },
  { key: 'lab-quizzes', label: 'Lab Quiz', icon: <ClipboardList size={16} /> },
  { key: 'assignments', label: 'Assignments', icon: <FilePlus2 size={16} /> },
  { key: 'announcements', label: 'Announcements', icon: <BookOpen size={16} /> },
  { key: 'members', label: 'Members', icon: <Users size={16} /> },
];

function getMaterialPlacementLabel(sheet: any) {
  if (sheet?.sectionName && sheet?.labClass?.labNumber) {
    return `Lab ${sheet.labClass.labNumber} · ${sheet.labClass?.title ?? 'Material'} · ${sheet.sectionName}`;
  }
  if (sheet?.labClass?.labNumber) {
    return `Lab ${sheet.labClass.labNumber} · ${sheet.labClass?.title ?? 'Material'}`;
  }
  return 'Universal';
}

function getMaterialHref(courseId: string, sheetId: string): string {
  return `/teacher/courses/${courseId}/materials/${sheetId}`;
}

export function TeacherCourseDetail() {
  const { courseId } = useParams<{ courseId: string }>();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showLabClassModal, setShowLabClassModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any | null>(null);
  const [memberSectionFilter, setMemberSectionFilter] = useState('All Students');
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);

  const requestedTab = searchParams.get('tab');
  const activeTab: CourseTab = tabItems.some((tab) => tab.key === requestedTab)
    ? (requestedTab as CourseTab)
    : 'lab-classes';

  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ['teacher-course', courseId],
    queryFn: () => api.get(`/courses/${courseId}`).then((response) => response.data),
    enabled: Boolean(courseId),
  });
  const { data: labClasses = [] } = useQuery({
    queryKey: ['teacher-course-lab-classes', courseId],
    queryFn: () => api.get(`/courses/${courseId}/lab-classes`).then((response) => response.data),
    enabled: Boolean(courseId),
  });
  const { data: lectureSheets = [] } = useQuery({
    queryKey: ['teacher-course-lecture-materials', courseId],
    queryFn: () =>
      api.get(`/courses/${courseId}/lecture-materials`).then((response) => response.data),
    enabled: Boolean(courseId),
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ['teacher-course-assignments', courseId],
    queryFn: () => api.get(`/assignments/course/${courseId}`).then((response) => response.data),
    enabled: Boolean(courseId),
  });
  const archived = isCourseArchived(course);
  const sectionNames = useMemo(() => getCourseSectionNames(course), [course]);
  const students = useMemo(() => getCourseStudents(course), [course]);
  const visibleStudents = useMemo(
    () => getStudentsForSection(course, memberSectionFilter),
    [course, memberSectionFilter],
  );

  useEffect(() => {
    if (!sectionNames.includes(memberSectionFilter)) {
      setMemberSectionFilter(sectionNames[0] ?? 'All Students');
    }
  }, [memberSectionFilter, sectionNames]);

  const labClassForm = useForm<LabClassFormValues>({
    resolver: zodResolver(labClassSchema),
    defaultValues: {
      title: '',
      description: '',
    },
  });

  const assignmentForm = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      title: '',
      caption: '',
      deadline: '',
      totalMarks: 100,
      allowLateSubmission: false,
      links: [{ url: '', label: '' }],
    },
  });

  const materialForm = useForm<MaterialFormValues>({
    resolver: zodResolver(materialSchema),
    defaultValues: {
      title: '',
      description: '',
      placement: 'universal',
      labClassId: '',
      links: [{ url: '', label: '' }],
    },
  });

  const {
    fields: assignmentLinkFields,
    append: appendAssignmentLink,
    remove: removeAssignmentLink,
  } = useFieldArray({
    control: assignmentForm.control,
    name: 'links',
  });
  const {
    fields: materialLinkFields,
    append: appendMaterialLink,
    remove: removeMaterialLink,
  } = useFieldArray({
    control: materialForm.control,
    name: 'links',
  });
  const editMaterialForm = useForm<EditMaterialFormValues>({
    resolver: zodResolver(editMaterialSchema),
    defaultValues: {
      title: '',
      description: '',
      links: [{ url: '', label: '' }],
    },
  });
  const {
    fields: editMaterialLinkFields,
    append: appendEditMaterialLink,
    remove: removeEditMaterialLink,
  } = useFieldArray({
    control: editMaterialForm.control,
    name: 'links',
  });

  const createLabClassMutation = useMutation({
    mutationFn: (values: LabClassFormValues) =>
      api.post(`/courses/${courseId}/lab-classes`, {
        title: values.title,
        description: values.description?.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Lab class created');
      queryClient.invalidateQueries({ queryKey: ['teacher-course-lab-classes', courseId] });
      labClassForm.reset({
        title: '',
        description: '',
      });
      setShowLabClassModal(false);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to create lab class'),
  });

  const createAssignmentMutation = useMutation({
    mutationFn: (values: AssignmentFormValues) =>
      api.post('/assignments', {
        courseId,
        title: values.title,
        caption: values.caption?.trim() || undefined,
        deadline: new Date(values.deadline).toISOString(),
        totalMarks: values.totalMarks,
        allowLateSubmission: values.allowLateSubmission ?? false,
        links: values.links
          .filter((link) => link.url.trim())
          .map((link) => ({
            url: link.url.trim(),
            label: link.label?.trim() || undefined,
          })),
      }),
    onSuccess: () => {
      toast.success('Assignment created');
      queryClient.invalidateQueries({ queryKey: ['teacher-course-assignments', courseId] });
      assignmentForm.reset({
        title: '',
        caption: '',
        deadline: '',
        totalMarks: 100,
        allowLateSubmission: false,
        links: [{ url: '', label: '' }],
      });
      setShowAssignmentModal(false);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to create assignment'),
  });

  const createMaterialMutation = useMutation({
    mutationFn: (values: MaterialFormValues) => {
      const normalizedLinks = values.links
        .filter((link) => link.url.trim())
        .map((link) => ({
          url: link.url.trim(),
          label: link.label?.trim() || undefined,
        }));

      if (materialFiles.length) {
        const body = new FormData();
        body.append('title', values.title);
        if (values.description?.trim()) {
          body.append('description', values.description.trim());
        }
        if (values.placement === 'lab_class' && values.labClassId) {
          body.append('labClassId', values.labClassId);
        }
        body.append('links', JSON.stringify(normalizedLinks));
        materialFiles.forEach((file) => body.append('files', file));

        return api.post(`/courses/${courseId}/lecture-materials/upload`, body, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      return api.post(`/courses/${courseId}/lecture-materials`, {
        title: values.title,
        description: values.description?.trim() || undefined,
        labClassId: values.placement === 'lab_class' ? values.labClassId : undefined,
        links: normalizedLinks,
      });
    },
    onSuccess: () => {
      toast.success('Lecture material added');
      queryClient.invalidateQueries({ queryKey: ['teacher-course-lecture-materials', courseId] });
      materialForm.reset({
        title: '',
        description: '',
        placement: 'universal',
        labClassId: '',
        links: [{ url: '', label: '' }],
      });
      setMaterialFiles([]);
      setShowMaterialModal(false);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to add lecture material'),
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: (sheetId: string) =>
      api.delete(`/courses/lecture-sheets/${sheetId}`),
    onSuccess: () => {
      toast.success('Lecture material deleted');
      queryClient.invalidateQueries({
        queryKey: ['teacher-course-lecture-materials', courseId],
      });
    },
    onError: (error: any) =>
      toast.error(
        error.response?.data?.message ?? 'Failed to delete lecture material',
      ),
  });
  const updateMaterialMutation = useMutation({
    mutationFn: (values: EditMaterialFormValues) =>
      api.patch(`/courses/lecture-sheets/${editingMaterial.id}`, {
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
        links: values.links
          .filter((link) => link.url.trim())
          .map((link) => ({
            url: link.url.trim(),
            label: link.label?.trim() || undefined,
          })),
      }),
    onSuccess: () => {
      toast.success('Lecture material updated');
      queryClient.invalidateQueries({
        queryKey: ['teacher-course-lecture-materials', courseId],
      });
      setEditingMaterial(null);
      editMaterialForm.reset({
        title: '',
        description: '',
        links: [{ url: '', label: '' }],
      });
    },
    onError: (error: any) =>
      toast.error(
        error.response?.data?.message ?? 'Failed to update lecture material',
      ),
  });
  const progressReportMutation = useMutation({
    mutationFn: () =>
      api.get(`/courses/${courseId}/reports/progress-pdf`).then((response) => response.data),
    onSuccess: (data: { pdf?: string; fileName?: string }) => {
      if (!data?.pdf) {
        toast.error('Could not generate the PDF report');
        return;
      }

      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${data.pdf}`;
      link.download = data.fileName ?? 'course_progress_report.pdf';
      link.click();
      toast.success('Course report downloaded');
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to download report'),
  });

  if (!courseId) return null;

  if (courseLoading) {
    return (
      <div className="space-y-5">
        <div className="h-48 animate-pulse rounded-[28px] border border-slate-200 bg-white" />
        <div className="h-96 animate-pulse rounded-[28px] border border-slate-200 bg-white" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="text-lg font-semibold text-slate-900">Course not found</p>
        <Link
          to="/teacher/courses"
          className="mt-5 inline-flex rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Back to courses
        </Link>
      </div>
    );
  }

  const setActiveTab = (tab: CourseTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const assignedTeachers = Array.isArray(course?.teachers) ? course.teachers : [];

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <Link
              to="/teacher/courses"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back
            </Link>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                {course.courseCode}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  archived
                    ? 'bg-slate-100 text-slate-600'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {archived ? 'Old course' : 'Current course'}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {String(course?.type ?? 'course').toUpperCase()}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                Batch {course?.semester?.batchYear ?? '—'}
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-semibold text-slate-900">{course.title}</h1>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span>Batch {course?.semester?.batchYear ?? '—'}</span>
              <span>{course?.semester?.name?.replace(/_/g, ' ')}</span>
              <span>{sectionNames.length} section{sectionNames.length === 1 ? '' : 's'}</span>
              <span>{students.length} student{students.length === 1 ? '' : 's'}</span>
            </div>

            {assignedTeachers.length ? (
              <div className="mt-5 flex items-center gap-3">
                <TeacherAvatarStack teachers={assignedTeachers} />
                <p className="text-sm text-slate-500">
                  {assignedTeachers
                    .map((teacher: any) => teacher?.fullName ?? teacher?.teacherId)
                    .join(', ')}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => progressReportMutation.mutate()}
              disabled={progressReportMutation.isPending}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={16} />
              {progressReportMutation.isPending ? 'Preparing report...' : 'Download PDF report'}
            </button>

            {activeTab === 'lab-classes' && course?.type === 'lab' ? (
              <button
                type="button"
                onClick={() => setShowLabClassModal(true)}
                disabled={archived}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Plus size={16} />
                Start new lab class
              </button>
            ) : null}

            {activeTab === 'lecture-materials' ? (
              <button
                type="button"
                onClick={() => setShowMaterialModal(true)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <Files size={16} />
                Upload material
              </button>
            ) : null}

            {activeTab === 'assignments' ? (
              <button
                type="button"
                onClick={() => setShowAssignmentModal(true)}
                disabled={archived}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FilePlus2 size={16} />
                New assignment
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {tabItems.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        {archived ? (
          <div className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <FolderArchive size={16} />
            New assignments and lab classes are locked for old courses.
          </div>
        ) : null}
      </section>

      {activeTab === 'lab-classes' ? (
        <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          {course?.type !== 'lab' ? (
            <EmptyState title="No lab classes for this course" />
          ) : (labClasses as any[]).length ? (
            <div className="space-y-4">
              {(labClasses as any[]).map((labClass: any) => (
                <Link
                  key={labClass.id}
                  to={`/teacher/courses/${courseId}/lab-classes/${labClass.id}`}
                  className="block rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                          Lab {labClass.labNumber}
                        </span>
                        <span className="text-sm text-slate-500">
                          {formatDateOnly(labClass.classDate)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-slate-900">
                        {labClass.title}
                      </h3>
                      {labClass.description ? (
                        <p className="mt-2 text-sm text-slate-500">{labClass.description}</p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                      {(labClass.sections ?? []).length} section
                      {(labClass.sections ?? []).length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(labClass.sections ?? []).map((section: any) => (
                      <div
                        key={section.id}
                        className={`rounded-2xl border px-3 py-2 text-xs ${
                          section.status === 'conducted'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        <p className="font-semibold">{section.sectionName}</p>
                        <p className="mt-1 uppercase tracking-[0.12em]">
                          {section.status === 'conducted' ? 'Conducted' : 'Pending'}
                        </p>
                      </div>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No lab classes yet" />
          )}
        </section>
      ) : null}

      {activeTab === 'lecture-materials' ? (
        <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          {(lectureSheets as any[]).length ? (
            <div className="space-y-4">
              {(lectureSheets as any[]).map((sheet: any) => (
                <div
                  key={sheet.id}
                  className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          {getMaterialPlacementLabel(sheet)}
                        </span>
                        <span className="text-xs font-medium text-slate-400">
                          {formatDateTime(sheet.createdAt)}
                        </span>
                        <a
                          href={getMaterialHref(courseId, sheet.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
                        >
                          <Files size={12} />
                          Open
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMaterial(sheet);
                            editMaterialForm.reset({
                              title: sheet.title ?? '',
                              description: sheet.description ?? '',
                              links:
                                Array.isArray(sheet.links) && sheet.links.length
                                  ? sheet.links.map((link: any) => ({
                                      url: link.url ?? '',
                                      label: link.label ?? '',
                                    }))
                                  : [{ url: '', label: '' }],
                            });
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <PencilLine size={12} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (deleteMaterialMutation.isPending) return;
                            if (!window.confirm('Delete this lecture material?')) return;
                            deleteMaterialMutation.mutate(sheet.id);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={deleteMaterialMutation.isPending}
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-slate-900">{sheet.title}</h3>
                      {sheet.description ? (
                        <p className="mt-2 text-sm text-slate-500">{sheet.description}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(sheet.links ?? []).map((link: any, index: number) => (
                      <a
                        key={`${sheet.id}-${index}`}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                      >
                        <Link2 size={12} />
                        {link.label || 'Open material'}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No lecture materials yet" />
          )}
        </section>
      ) : null}

      {activeTab === 'assignments' ? (
        <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          {(assignments as any[]).length ? (
            <div className="space-y-4">
              {(assignments as any[]).map((assignment: any) => (
                <div
                  key={assignment.id}
                  className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {assignment.title}
                      </h3>
                      {assignment.caption ? (
                        <p className="mt-2 text-sm text-slate-500">{assignment.caption}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                        {assignment.totalMarks ?? 0} marks
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                        {formatDateTime(assignment.deadline)}
                      </span>
                    </div>
                  </div>

                  {assignment.links?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {assignment.links.map((link: any) => (
                        <a
                          key={link.id ?? link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                        >
                          <Link2 size={12} />
                          {link.label || 'Open resource'}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No assignments yet" />
          )}
        </section>
      ) : null}

      {activeTab === 'announcements' ? (
        <CourseAnnouncementsPanel
          role="teacher"
          course={course}
          sectionNames={sectionNames}
        />
      ) : null}

      {activeTab === 'members' ? (
        <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          <div className="flex flex-wrap gap-2">
            {sectionNames.map((sectionName) => (
              <button
                key={sectionName}
                type="button"
                onClick={() => setMemberSectionFilter(sectionName)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  memberSectionFilter === sectionName
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {sectionName}
              </button>
            ))}
          </div>

          {visibleStudents.length ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleStudents.map((student: any) => (
                <div
                  key={student.id}
                  className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div className="flex items-center gap-3">
                    <StudentAvatar student={student} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {studentDisplayName(student)}
                      </p>
                      <p className="text-xs text-slate-500">{student.studentId}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                      {resolveStudentSection(course, student)}
                    </span>
                    {student.email ? (
                      <span className="truncate text-xs text-slate-400">{student.email}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No students found" />
          )}
        </section>
      ) : null}

      {activeTab === 'lab-tests' ? (
        <TeacherLabActivityManager
          fixedCourseId={courseId}
          fixedActivityKind="lab_test"
          disableCreation={archived}
          heading={{
            eyebrow: 'Course Workspace',
            title: 'Lab Tests',
            description:
              'Manage all lab tests for this course here, including section-scoped scheduling, problems, submissions, and grading.',
          }}
        />
      ) : null}

      {activeTab === 'lab-quizzes' ? (
        <TeacherLabQuizManager
          fixedCourseId={courseId}
          disableCreation={archived}
          heading={{
            eyebrow: 'Course Workspace',
            title: 'Lab Quiz',
            description:
              'Create Socrative-style lab quizzes with randomized question order, live fullscreen enforcement, manual short-answer grading, and PDF results.',
          }}
        />
      ) : null}

      {activeTab === 'lab-tasks' ? (
        <TeacherLabActivityManager
          fixedCourseId={courseId}
          fixedActivityKind="lab_task"
          disableCreation={archived}
          heading={{
            eyebrow: 'Course Workspace',
            title: 'Lab Tasks',
            description:
              'Review previous lab tasks for this course and create new section-specific tasks that are tied to a lab class.',
          }}
        />
      ) : null}

      <Modal
        open={showLabClassModal}
        onClose={() => setShowLabClassModal(false)}
        title="New Lab Class"
        maxWidthClass="max-w-xl"
      >
        <form
          onSubmit={labClassForm.handleSubmit((values) =>
            createLabClassMutation.mutate(values),
          )}
          className="space-y-4"
        >
          <Field
            label="Title"
            error={labClassForm.formState.errors.title?.message}
          >
            <input
              {...labClassForm.register('title')}
              className={inputClass}
              placeholder="Lab Class 1"
            />
          </Field>
          <Field
            label="Description"
            error={labClassForm.formState.errors.description?.message}
          >
            <textarea
              {...labClassForm.register('description')}
              className={`${inputClass} min-h-24`}
              placeholder="Optional"
            />
          </Field>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createLabClassMutation.isPending}
              className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createLabClassMutation.isPending ? 'Creating...' : 'Create lab class'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showAssignmentModal}
        onClose={() => setShowAssignmentModal(false)}
        title="New Assignment"
        maxWidthClass="max-w-2xl"
      >
        <form
          onSubmit={assignmentForm.handleSubmit((values) =>
            createAssignmentMutation.mutate(values),
          )}
          className="space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Title"
              error={assignmentForm.formState.errors.title?.message}
            >
              <input
                {...assignmentForm.register('title')}
                className={inputClass}
                placeholder="Assignment title"
              />
            </Field>
            <Field
              label="Total Marks"
              error={assignmentForm.formState.errors.totalMarks?.message}
            >
              <Controller
                name="totalMarks"
                control={assignmentForm.control}
                render={({ field }) => (
                  <input
                    type="number"
                    min={1}
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(Number(event.target.value))}
                    className={inputClass}
                  />
                )}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Deadline"
              error={assignmentForm.formState.errors.deadline?.message}
            >
              <input
                type="datetime-local"
                {...assignmentForm.register('deadline')}
                className={inputClass}
              />
            </Field>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" {...assignmentForm.register('allowLateSubmission')} />
              Allow late submission
            </label>
          </div>

          <Field
            label="Caption"
            error={assignmentForm.formState.errors.caption?.message}
          >
            <textarea
              {...assignmentForm.register('caption')}
              className={`${inputClass} min-h-24`}
              placeholder="Optional"
            />
          </Field>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Links</p>
              <button
                type="button"
                onClick={() => appendAssignmentLink({ url: '', label: '' })}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Add link
              </button>
            </div>
            {assignmentLinkFields.map((field, index) => (
              <div key={field.id} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
                <input
                  {...assignmentForm.register(`links.${index}.url`)}
                  className={inputClass}
                  placeholder="https://..."
                />
                <input
                  {...assignmentForm.register(`links.${index}.label`)}
                  className={inputClass}
                  placeholder="Label"
                />
                <button
                  type="button"
                  onClick={() => removeAssignmentLink(index)}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createAssignmentMutation.isPending}
              className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createAssignmentMutation.isPending ? 'Creating...' : 'Create assignment'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showMaterialModal}
        onClose={() => {
          setShowMaterialModal(false);
          setMaterialFiles([]);
        }}
        title="Upload Lecture Material"
        maxWidthClass="max-w-2xl"
      >
        <form
          onSubmit={materialForm.handleSubmit((values) =>
            createMaterialMutation.mutate(values),
          )}
          className="space-y-4"
        >
          <Field label="Title" error={materialForm.formState.errors.title?.message}>
            <input
              {...materialForm.register('title')}
              className={inputClass}
              placeholder="Material title"
            />
          </Field>

          <Field
            label="Description"
            error={materialForm.formState.errors.description?.message}
          >
            <textarea
              {...materialForm.register('description')}
              className={`${inputClass} min-h-24`}
              placeholder="Optional"
            />
          </Field>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">Placement</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="radio"
                  value="universal"
                  {...materialForm.register('placement')}
                />
                Universal
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="radio"
                  value="lab_class"
                  {...materialForm.register('placement')}
                />
                Linked to a lab class
              </label>
            </div>
            {materialForm.watch('placement') === 'lab_class' ? (
              <Field
                label="Lab Class"
                error={materialForm.formState.errors.labClassId?.message}
              >
                <select {...materialForm.register('labClassId')} className={inputClass}>
                  <option value="">Select a lab class</option>
                  {(labClasses as any[]).map((labClass: any) => (
                    <option key={labClass.id} value={labClass.id}>
                      Lab {labClass.labNumber} - {labClass.title}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Links</p>
              <button
                type="button"
                onClick={() => appendMaterialLink({ url: '', label: '' })}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Add link
              </button>
            </div>
            {materialLinkFields.map((field, index) => (
              <div key={field.id} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
                <input
                  {...materialForm.register(`links.${index}.url`)}
                  className={inputClass}
                  placeholder="https://..."
                />
                <input
                  {...materialForm.register(`links.${index}.label`)}
                  className={inputClass}
                  placeholder="Label"
                />
                <button
                  type="button"
                  onClick={() => removeMaterialLink(index)}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Remove
                </button>
              </div>
            ))}
            {materialForm.formState.errors.links?.message ? (
              <p className="text-xs text-rose-500">
                {String(materialForm.formState.errors.links.message)}
              </p>
            ) : null}
          </div>

          <Field label="Files">
            <input
              type="file"
              multiple
              onChange={(event) =>
                setMaterialFiles(Array.from(event.target.files ?? []))
              }
              className={inputClass}
            />
            {materialFiles.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {materialFiles.map((file) => (
                  <span
                    key={`${file.name}-${file.size}`}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {file.name}
                  </span>
                ))}
              </div>
            ) : null}
          </Field>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createMaterialMutation.isPending}
              className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createMaterialMutation.isPending ? 'Saving...' : 'Save material'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingMaterial)}
        onClose={() => {
          setEditingMaterial(null);
          editMaterialForm.reset({
            title: '',
            description: '',
            links: [{ url: '', label: '' }],
          });
        }}
        title="Edit Lecture Material"
        maxWidthClass="max-w-2xl"
      >
        <form
          onSubmit={editMaterialForm.handleSubmit((values) =>
            updateMaterialMutation.mutate(values),
          )}
          className="space-y-4"
        >
          <Field label="Title" error={editMaterialForm.formState.errors.title?.message}>
            <input
              {...editMaterialForm.register('title')}
              className={inputClass}
              placeholder="Material title"
            />
          </Field>

          <Field
            label="Description"
            error={editMaterialForm.formState.errors.description?.message}
          >
            <textarea
              {...editMaterialForm.register('description')}
              className={`${inputClass} min-h-24`}
              placeholder="Optional"
            />
          </Field>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Links</p>
              <button
                type="button"
                onClick={() => appendEditMaterialLink({ url: '', label: '' })}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Add link
              </button>
            </div>
            {editMaterialLinkFields.map((field, index) => (
              <div key={field.id} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
                <input
                  {...editMaterialForm.register(`links.${index}.url`)}
                  className={inputClass}
                  placeholder="https://..."
                />
                <input
                  {...editMaterialForm.register(`links.${index}.label`)}
                  className={inputClass}
                  placeholder="Label"
                />
                <button
                  type="button"
                  onClick={() => removeEditMaterialLink(index)}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Remove
                </button>
              </div>
            ))}
            {editMaterialForm.formState.errors.links?.message ? (
              <p className="text-xs text-rose-500">
                {String(editMaterialForm.formState.errors.links.message)}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={updateMaterialMutation.isPending}
              className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updateMaterialMutation.isPending ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
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
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
      {title}
    </div>
  );
}

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white';
