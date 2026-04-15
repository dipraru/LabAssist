import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  CheckCheck,
  Clock3,
  Link2,
  MapPin,
  PencilLine,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  UserPlus,
  X,
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { api } from '../../lib/api';
import { studentDisplayName } from '../../lib/display';
import { TeacherLabActivityManager } from './TeacherLabActivityManager';
import {
  StudentAvatar,
  formatDateOnly,
  formatDateTime,
  formatTimeRange,
  getCourseStudents,
  getDefaultLabSection,
  getEffectiveLabSectionSchedule,
  getStudentRollLabel,
  getStudentsForSection,
  isCourseArchived,
  isLabSectionScheduledNow,
  resolveStudentSection,
} from './teacher.shared';

const materialSchema = z
  .object({
    title: z.string().trim().min(2, 'Material title is required'),
    description: z.string().optional(),
    sharingScope: z.enum(['all_sections', 'this_section']),
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

type MaterialFormValues = z.infer<typeof materialSchema>;
type EditMaterialFormValues = z.infer<typeof editMaterialSchema>;

type AttendanceEntry = {
  student: any;
  studentId: string;
  isPresent: boolean;
  isExtra: boolean;
  homeSection: string;
};

type AttendanceAction =
  | 'finish'
  | 'modify'
  | 'all_present'
  | 'clear'
  | null;

function getPresentStudentIdsFromOtherSections(
  labClass: any,
  currentSectionId: string | null | undefined,
) {
  return new Set(
    (labClass?.sections ?? [])
      .filter((section: any) => section?.id !== currentSectionId)
      .flatMap((section: any) =>
        (section?.attendanceRecords ?? [])
          .filter((record: any) => record?.isPresent)
          .map((record: any) => record.studentId),
      ),
  );
}

function buildAttendanceEntries(course: any, labClass: any, section: any): AttendanceEntry[] {
  const courseStudents = getCourseStudents(course);
  const courseStudentMap = new Map(courseStudents.map((student: any) => [student.id, student]));
  const sectionStudents = getStudentsForSection(course, section.sectionName);
  const sectionStudentIds = new Set(sectionStudents.map((student: any) => student.id));
  const records = Array.isArray(section?.attendanceRecords) ? section.attendanceRecords : [];
  const recordsByStudentId = new Map<string, any>(
    records.map((record: any) => [record.studentId, record]),
  );
  const presentElsewhere = getPresentStudentIdsFromOtherSections(labClass, section?.id);

  const baseEntries = sectionStudents
    .filter(
      (student: any) =>
        !presentElsewhere.has(student.id) || recordsByStudentId.has(student.id),
    )
    .map((student: any) => ({
      student,
      studentId: student.id,
      isPresent: Boolean(recordsByStudentId.get(student.id)?.isPresent),
      isExtra: false,
      homeSection: resolveStudentSection(course, student),
    }));

  const extraEntries = records
    .filter((record: any) => !sectionStudentIds.has(record.studentId))
    .map((record: any) => {
      const student = courseStudentMap.get(record.studentId);
      if (!student) return null;

      return {
        student,
        studentId: student.id,
        isPresent: Boolean(record.isPresent),
        isExtra: true,
        homeSection: resolveStudentSection(course, student),
      } satisfies AttendanceEntry;
    })
    .filter((entry: AttendanceEntry | null): entry is AttendanceEntry => Boolean(entry));

  return [...baseEntries, ...extraEntries];
}

function getSectionScheduleSummary(course: any, section: any): string {
  const effective = getEffectiveLabSectionSchedule(course, section);

  if (!effective?.startTime || !effective?.endTime) {
    return 'Schedule not set';
  }

  if (effective.kind === 'override' && effective.date) {
    return `${formatDateOnly(effective.date)} · ${formatTimeRange(
      effective.startTime,
      effective.endTime,
    )}`;
  }

  if (effective.dayOfWeek) {
    return `${effective.dayOfWeek} · ${formatTimeRange(
      effective.startTime,
      effective.endTime,
    )}`;
  }

  return formatTimeRange(effective.startTime, effective.endTime);
}

function getSectionRangeLabel(course: any, sectionName: string | undefined): string {
  const batchSection = (course?.batchSections ?? []).find(
    (section: any) => section?.name === sectionName,
  );

  if (!batchSection?.fromStudentId || !batchSection?.toStudentId) {
    return 'Roll range unavailable';
  }

  return `${batchSection.fromStudentId} - ${batchSection.toStudentId}`;
}

function matchesStudentSearch(student: any, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    studentDisplayName(student),
    student?.studentId,
    student?.rollNumber,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

function getMaterialHref(courseId: string, sheetId: string): string {
  return `/teacher/courses/${courseId}/materials/${sheetId}`;
}

function getLabTaskDisplayTitle(activity: any): string {
  if (activity?.title?.trim()) {
    return activity.title.trim();
  }

  if (activity?.labClass?.labNumber) {
    return `Lab ${activity.labClass.labNumber} Task`;
  }

  return 'Lab Task';
}

function getLabTaskDuration(activity: any): number {
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

export function TeacherLabClassWorkspace() {
  const { courseId, labClassId } = useParams<{
    courseId: string;
    labClassId: string;
  }>();
  const queryClient = useQueryClient();
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [attendanceEntries, setAttendanceEntries] = useState<AttendanceEntry[]>([]);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any | null>(null);
  const [showExtraStudentModal, setShowExtraStudentModal] = useState(false);
  const [showAttendanceConfirmModal, setShowAttendanceConfirmModal] = useState(false);
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [modifyMode, setModifyMode] = useState(false);
  const [pendingAttendanceAction, setPendingAttendanceAction] =
    useState<AttendanceAction>(null);
  const [extraStudentSearch, setExtraStudentSearch] = useState('');
  const [selectedLabTaskId, setSelectedLabTaskId] = useState<string | null>(null);
  const [showNewTaskWorkspace, setShowNewTaskWorkspace] = useState(false);

  const { data: labClass, isLoading } = useQuery({
    queryKey: ['teacher-lab-class', courseId, labClassId],
    queryFn: () =>
      api
        .get(`/courses/${courseId}/lab-classes/${labClassId}`)
        .then((response) => response.data),
    enabled: Boolean(courseId && labClassId),
  });
  const { data: lectureMaterials = [] } = useQuery({
    queryKey: ['teacher-course-lecture-materials', courseId],
    queryFn: () =>
      api.get(`/courses/${courseId}/lecture-materials`).then((response) => response.data),
    enabled: Boolean(courseId),
  });

  const course = labClass?.course ?? null;
  const sections = useMemo(
    () => (Array.isArray(labClass?.sections) ? labClass.sections : []),
    [labClass?.sections],
  );
  const selectedSection = useMemo(
    () =>
      sections.find((section: any) => section.id === selectedSectionId) ??
      getDefaultLabSection(course, sections) ??
      sections[0] ??
      null,
    [course, sections, selectedSectionId],
  );
  const { data: labTasks = [] } = useQuery({
    queryKey: ['teacher-lab-class-tasks', courseId, labClassId, selectedSection?.sectionName],
    queryFn: () =>
      api
        .get(`/lab-tests/course/${courseId}`, {
          params: {
            kind: 'lab_task',
            labClassId,
            sectionName: selectedSection?.sectionName,
          },
        })
        .then((response) => response.data),
    enabled: Boolean(courseId && labClassId && selectedSection?.sectionName),
  });
  const allCourseStudents = useMemo(() => getCourseStudents(course), [course]);
  const presentInOtherSections = useMemo(
    () => getPresentStudentIdsFromOtherSections(labClass, selectedSection?.id),
    [labClass, selectedSection?.id],
  );
  const visibleMaterials = useMemo(
    () =>
      (lectureMaterials as any[]).filter(
        (sheet: any) =>
          sheet?.labClassId === labClassId &&
          (!sheet?.sectionName || sheet.sectionName === selectedSection?.sectionName),
      ),
    [labClassId, lectureMaterials, selectedSection?.sectionName],
  );
  const presentCount = attendanceEntries.filter((entry) => entry.isPresent).length;
  const absentCount = attendanceEntries.length - presentCount;
  const selectedSectionScheduledNow = selectedSection
    ? isLabSectionScheduledNow(selectedSection, course)
    : false;
  const selectedSectionRange = getSectionRangeLabel(course, selectedSection?.sectionName);
  const selectedBatchYear = course?.semester?.batchYear
    ? `Batch ${course.semester.batchYear}`
    : 'Selected batch';
  const selectedEffectiveSchedule = getEffectiveLabSectionSchedule(course, selectedSection);
  const archived = course ? isCourseArchived(course) : false;

  useEffect(() => {
    if (!sections.length) {
      setSelectedSectionId(null);
      return;
    }

    if (!sections.some((section: any) => section.id === selectedSectionId)) {
      const defaultSection = getDefaultLabSection(course, sections);
      setSelectedSectionId(defaultSection?.id ?? sections[0].id);
    }
  }, [course, sections, selectedSectionId]);

  useEffect(() => {
    setModifyMode(false);
    setSelectedLabTaskId(null);
    setShowNewTaskWorkspace(false);
  }, [selectedSectionId]);

  useEffect(() => {
    if (
      selectedLabTaskId &&
      !(labTasks as any[]).some((task: any) => task.id === selectedLabTaskId)
    ) {
      setSelectedLabTaskId(null);
    }
  }, [labTasks, selectedLabTaskId]);

  useEffect(() => {
    if (!course || !labClass || !selectedSection) {
      setAttendanceEntries([]);
      return;
    }

    setAttendanceEntries(buildAttendanceEntries(course, labClass, selectedSection));
  }, [
    course,
    labClass,
    modifyMode,
    selectedSection?.attendanceTakenAt,
    selectedSection?.id,
    selectedSection?.status,
  ]);

  const materialForm = useForm<MaterialFormValues>({
    resolver: zodResolver(materialSchema),
    defaultValues: {
      title: '',
      description: '',
      sharingScope: 'all_sections',
      links: [{ url: '', label: '' }],
    },
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

  const takeAttendanceMutation = useMutation({
    mutationFn: () =>
      api.patch(
        `/courses/${courseId}/lab-classes/${labClassId}/sections/${selectedSection?.id}/attendance`,
        {
          attendance: attendanceEntries.map((entry) => ({
            studentId: entry.studentId,
            isPresent: entry.isPresent,
          })),
        },
      ),
    onSuccess: () => {
      toast.success(modifyMode ? 'Attendance updated' : 'Attendance saved');
      setModifyMode(false);
      setPendingAttendanceAction(null);
      setShowAttendanceConfirmModal(false);
      queryClient.invalidateQueries({ queryKey: ['teacher-lab-class', courseId, labClassId] });
      queryClient.invalidateQueries({ queryKey: ['teacher-course-lab-classes', courseId] });
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to save attendance'),
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
        body.append('labClassId', String(labClassId));
        if (values.sharingScope === 'this_section' && selectedSection?.sectionName) {
          body.append('sectionName', selectedSection.sectionName);
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
        labClassId,
        sectionName:
          values.sharingScope === 'this_section'
            ? selectedSection?.sectionName
            : undefined,
        links: normalizedLinks,
      });
    },
    onSuccess: () => {
      toast.success('Lecture material added');
      queryClient.invalidateQueries({
        queryKey: ['teacher-course-lecture-materials', courseId],
      });
      materialForm.reset({
        title: '',
        description: '',
        sharingScope: 'all_sections',
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

  const availableExtraStudents = useMemo(() => {
    const existingStudentIds = new Set(attendanceEntries.map((entry) => entry.studentId));

    return allCourseStudents.filter(
      (student: any) =>
        !existingStudentIds.has(student.id) &&
        !presentInOtherSections.has(student.id) &&
        matchesStudentSearch(student, extraStudentSearch),
    );
  }, [allCourseStudents, attendanceEntries, extraStudentSearch, presentInOtherSections]);

  if (!courseId || !labClassId) return null;

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-44 animate-pulse rounded-[28px] border border-slate-200 bg-white" />
        <div className="h-96 animate-pulse rounded-[28px] border border-slate-200 bg-white" />
      </div>
    );
  }

  if (!labClass) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="text-lg font-semibold text-slate-900">Lab class not found</p>
        <Link
          to={`/teacher/courses/${courseId}`}
          className="mt-5 inline-flex rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Back to course
        </Link>
      </div>
    );
  }

  if (!selectedSection) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="text-lg font-semibold text-slate-900">No sections found</p>
      </div>
    );
  }

  const handleAttendanceSubmit = () => {
    if (!attendanceEntries.length) return;

    if (modifyMode || !selectedSectionScheduledNow) {
      setPendingAttendanceAction(modifyMode ? 'modify' : 'finish');
      setShowAttendanceConfirmModal(true);
      return;
    }

    takeAttendanceMutation.mutate();
  };

  const handleAddExtraStudent = (student: any) => {
    setAttendanceEntries((current) => [
      ...current,
      {
        student,
        studentId: student.id,
        isPresent: true,
        isExtra: true,
        homeSection: resolveStudentSection(course, student),
      },
    ]);
    setExtraStudentSearch('');
  };

  const confirmAttendanceSubmit = () => {
    if (pendingAttendanceAction === 'all_present') {
      setAttendanceEntries((current) =>
        current.map((entry) => ({ ...entry, isPresent: true })),
      );
      setShowAttendanceConfirmModal(false);
      setPendingAttendanceAction(null);
      return;
    }

    if (pendingAttendanceAction === 'clear') {
      setAttendanceEntries((current) =>
        current.map((entry) => ({ ...entry, isPresent: false })),
      );
      setShowAttendanceConfirmModal(false);
      setPendingAttendanceAction(null);
      return;
    }

    takeAttendanceMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link
              to={`/teacher/courses/${courseId}?tab=lab-classes`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back
            </Link>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                Lab {labClass.labNumber}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {formatDateOnly(labClass.classDate)}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {selectedSection.sectionName}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  selectedSection.status === 'conducted'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {selectedSection.status === 'conducted' ? 'Conducted' : 'Pending'}
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-semibold text-slate-900">{labClass.title}</h1>
            {labClass.description ? (
              <p className="mt-2 text-sm text-slate-500">{labClass.description}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-500">
              <span className="inline-flex items-center gap-2">
                <CalendarClock size={15} className="text-slate-400" />
                {getSectionScheduleSummary(course, selectedSection)}
              </span>
              {selectedEffectiveSchedule?.roomNumber ? (
                <span className="inline-flex items-center gap-2">
                  <MapPin size={15} className="text-slate-400" />
                  Room {selectedEffectiveSchedule.roomNumber}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {selectedSection.status === 'conducted' && !modifyMode ? (
              <>
                <button
                  type="button"
                  onClick={() => setModifyMode(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <PencilLine size={16} />
                  Modify attendance
                </button>
                <button
                  type="button"
                  onClick={() => setShowMaterialModal(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  <Plus size={16} />
                  Add lecture material
                </button>
              </>
            ) : null}

            {modifyMode ? (
              <button
                type="button"
                onClick={() => setModifyMode(false)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <X size={16} />
                Cancel modify
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {sections.map((section: any) => {
            const active = selectedSection?.id === section.id;
            const conducted = section.status === 'conducted';

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setSelectedSectionId(section.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : conducted
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                }`}
              >
                <p className="text-sm font-semibold">{section.sectionName}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.16em]">
                  {conducted ? 'Conducted' : 'Pending'}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {selectedSection.status !== 'conducted' || modifyMode ? (
        <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Attendance
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                {modifyMode ? 'Modify attendance' : `Roll call for ${selectedSection.sectionName}`}
              </h2>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <Clock3 size={15} className="text-slate-400" />
                  {getSectionScheduleSummary(course, selectedSection)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {selectedBatchYear}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  Range {selectedSectionRange}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingAttendanceAction('all_present');
                  setShowAttendanceConfirmModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                All present
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingAttendanceAction('clear');
                  setShowAttendanceConfirmModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setShowExtraStudentModal(true)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <UserPlus size={16} />
                Add extra student
              </button>
            </div>
          </div>

          {attendanceEntries.length ? (
            <div className="mt-5 space-y-4">
              {attendanceEntries.map((entry) => (
                <div
                  key={entry.studentId}
                  className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <StudentAvatar student={entry.student} />
                      <div className="min-w-0">
                        <span className="inline-flex rounded-2xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">
                          {getStudentRollLabel(entry.student)}
                        </span>
                        <p className="mt-3 truncate text-sm font-semibold text-slate-900">
                          {studentDisplayName(entry.student)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{entry.student.studentId}</p>
                        {entry.isExtra ? (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                              Extra
                            </span>
                            <span className="text-xs text-slate-500">
                              From {entry.homeSection}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {entry.isExtra ? (
                        <button
                          type="button"
                          onClick={() =>
                            setAttendanceEntries((current) =>
                              current.filter((item) => item.studentId !== entry.studentId),
                            )
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                          aria-label="Remove extra student"
                        >
                          <X size={14} />
                        </button>
                      ) : null}

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setAttendanceEntries((current) =>
                              current.map((item) =>
                                item.studentId === entry.studentId
                                  ? { ...item, isPresent: true }
                                  : item,
                              ),
                            )
                          }
                          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                            entry.isPresent
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Present
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setAttendanceEntries((current) =>
                              current.map((item) =>
                                item.studentId === entry.studentId
                                  ? { ...item, isPresent: false }
                                  : item,
                              ),
                            )
                          }
                          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                            !entry.isPresent
                              ? 'bg-slate-900 text-white'
                              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Absent
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
              No students are currently available for this section.
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-emerald-700 ring-1 ring-emerald-200">
                Present {presentCount}
              </span>
              <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-600 ring-1 ring-slate-200">
                Absent {absentCount}
              </span>
            </div>

            <button
              type="button"
              onClick={handleAttendanceSubmit}
              disabled={!attendanceEntries.length || takeAttendanceMutation.isPending}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCheck size={16} />
              {takeAttendanceMutation.isPending
                ? 'Saving...'
                : modifyMode
                  ? 'Okay, Modify'
                  : 'Finish attendance'}
            </button>
          </div>
        </section>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Lecture Material
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                    {selectedSection.sectionName}
                  </h2>
                </div>
              </div>

              {visibleMaterials.length ? (
                <div className="mt-5 space-y-4">
                  {visibleMaterials.map((sheet: any) => (
                    <div
                      key={sheet.id}
                      className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          {sheet.sectionName ? `${sheet.sectionName} only` : 'All sections'}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          Lab {sheet?.labClass?.labNumber}
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
                          <Link2 size={12} />
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
                <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                  No lecture material for this section yet.
                </div>
              )}
            </section>

            <section className="space-y-6">
              <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Attendance
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <AttendanceStat label="Present" value={presentCount} />
                  <AttendanceStat label="Absent" value={absentCount} />
                </div>
                <p className="mt-4 text-xs text-slate-400">
                  Completed {formatDateTime(selectedSection.attendanceTakenAt)}
                </p>
              </div>

              <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                      Lab Task
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Select a task or create a new one for this section.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLabTaskId(null);
                      setShowNewTaskWorkspace(true);
                    }}
                    disabled={archived}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus size={16} />
                    New Task
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {(labTasks as any[]).map((task: any) => {
                    const active = selectedLabTaskId === task.id && !showNewTaskWorkspace;
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => {
                          setSelectedLabTaskId(task.id);
                          setShowNewTaskWorkspace(false);
                        }}
                        className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                          active
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`truncate font-semibold ${active ? 'text-white' : 'text-slate-900'}`}>
                              {getLabTaskDisplayTitle(task)}
                            </p>
                            <p className={`mt-1 text-xs ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                              {getLabTaskDuration(task)} min · {task.totalMarks ?? 'N/A'} marks
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              active
                                ? 'bg-white/10 text-white'
                                : 'bg-white text-slate-600 ring-1 ring-slate-200'
                            }`}
                          >
                            {task.status === 'draft'
                              ? 'Draft'
                              : task.status === 'running'
                                ? 'Running'
                                : 'Ended'}
                          </span>
                        </div>
                      </button>
                    );
                  })}

                  {!(labTasks as any[]).length ? (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                      No lab tasks yet for this section.
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </div>

          {selectedLabTaskId || showNewTaskWorkspace ? (
            <TeacherLabActivityManager
              key={`${labClassId}-${selectedSection.id}-${selectedLabTaskId ?? 'new'}-${
                showNewTaskWorkspace ? 'compose' : 'view'
              }`}
              fixedCourseId={courseId}
              fixedActivityKind="lab_task"
              fixedLabClassId={labClassId}
              fixedSectionName={selectedSection.sectionName}
              disableCreation={archived}
              hideActivityLibrary
              initialSelectedActivityId={selectedLabTaskId}
              autoOpenCreateModal={showNewTaskWorkspace}
              onSelectedActivityChange={(activityId) => {
                if (!activityId) return;
                setSelectedLabTaskId(activityId);
                setShowNewTaskWorkspace(false);
              }}
              heading={{
                eyebrow: 'Lab Class Workspace',
                title: `Lab ${labClass.labNumber} Tasks`,
                description: 'Manage the selected task for this conducted section.',
              }}
            />
          ) : null}
        </div>
      )}

      <Modal
        open={showExtraStudentModal}
        onClose={() => {
          setShowExtraStudentModal(false);
          setExtraStudentSearch('');
        }}
        title="Add Extra Students"
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={extraStudentSearch}
              onChange={(event) => setExtraStudentSearch(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
              placeholder="Search by name or student ID"
            />
          </div>

          {availableExtraStudents.length ? (
            <div className="max-h-[24rem] space-y-3 overflow-y-auto pr-1">
              {availableExtraStudents.map((student: any) => (
                <div
                  key={student.id}
                  className="flex items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <StudentAvatar student={student} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {studentDisplayName(student)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{student.studentId}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {resolveStudentSection(course, student)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddExtraStudent(student)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
              No available students found from this course.
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={showMaterialModal}
        onClose={() => {
          setShowMaterialModal(false);
          setMaterialFiles([]);
        }}
        title="Add Lecture Material"
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
            <p className="text-sm font-semibold text-slate-900">Sharing</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="radio"
                  value="all_sections"
                  {...materialForm.register('sharingScope')}
                />
                All sections
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="radio"
                  value="this_section"
                  {...materialForm.register('sharingScope')}
                />
                Only {selectedSection.sectionName}
              </label>
            </div>
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
              <div
                key={field.id}
                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]"
              >
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
              onChange={(event) => setMaterialFiles(Array.from(event.target.files ?? []))}
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
        open={showAttendanceConfirmModal}
        onClose={() => {
          setShowAttendanceConfirmModal(false);
          setPendingAttendanceAction(null);
        }}
        title={
          pendingAttendanceAction === 'modify'
            ? 'Confirm Attendance Update'
            : pendingAttendanceAction === 'all_present'
              ? 'Confirm All Present'
              : pendingAttendanceAction === 'clear'
                ? 'Confirm Clear Attendance'
                : 'Confirm Attendance'
        }
        maxWidthClass="max-w-xl"
      >
        <div className="space-y-4">
          {!selectedSectionScheduledNow &&
          pendingAttendanceAction !== 'all_present' &&
          pendingAttendanceAction !== 'clear' ? (
            <div className="rounded-[22px] border border-rose-200 bg-rose-50 p-4">
              <div className="flex items-start gap-3">
                <TriangleAlert size={18} className="mt-0.5 text-rose-600" />
                <div>
                  <p className="text-sm font-semibold text-rose-900">
                    This section is not scheduled right now.
                  </p>
                  <p className="mt-2 text-sm text-rose-800">
                    {selectedBatchYear} · {selectedSection.sectionName} · Roll range {selectedSectionRange}
                  </p>
                  <p className="mt-2 text-xs text-rose-700">
                    Current schedule: {getSectionScheduleSummary(course, selectedSection)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">
              {pendingAttendanceAction === 'modify'
                ? 'The saved attendance will be updated with your current changes.'
                : pendingAttendanceAction === 'all_present'
                  ? 'Every student in this attendance list will be marked present.'
                  : pendingAttendanceAction === 'clear'
                    ? 'Every student in this attendance list will be marked absent.'
                    : 'Attendance will be completed for this section.'}
            </p>
            <p className="mt-2">
              Present {presentCount} · Absent {absentCount}
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowAttendanceConfirmModal(false);
                setPendingAttendanceAction(null);
              }}
              className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmAttendanceSubmit}
              disabled={
                pendingAttendanceAction === 'all_present' ||
                pendingAttendanceAction === 'clear'
                  ? false
                  : takeAttendanceMutation.isPending
              }
              className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {(pendingAttendanceAction === 'all_present' ||
              pendingAttendanceAction === 'clear'
                ? false
                : takeAttendanceMutation.isPending)
                ? 'Saving...'
                : pendingAttendanceAction === 'modify'
                  ? 'Yes, modify'
                  : pendingAttendanceAction === 'all_present'
                    ? 'Yes, mark all present'
                    : pendingAttendanceAction === 'clear'
                      ? 'Yes, clear attendance'
                  : 'Yes, finish'}
            </button>
          </div>
        </div>
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
              <div
                key={field.id}
                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]"
              >
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

function AttendanceStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
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

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white';
