import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FilePlus2,
  Files,
  FlaskConical,
  Link2,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { studentDisplayName } from '../../lib/display';
import { useAuthStore } from '../../store/auth.store';
import {
  StudentAvatar,
  TeacherAvatar,
  TeacherAvatarStack,
  formatDateOnly,
  formatDateTime,
  formatTimeRange,
  getCourseSectionNames,
  getCourseStudents,
  getEffectiveLabSectionSchedule,
  getStudentsForSection,
  isCourseArchived,
} from '../teacher/teacher.shared';
import {
  getStudentIdentityValue,
  getStudentScheduleForCourse,
  getStudentSectionNameForCourse,
} from './student.shared';

type CourseTab =
  | 'lab-classes'
  | 'lecture-materials'
  | 'lab-tasks'
  | 'lab-tests'
  | 'assignments'
  | 'members';

const tabItems: { key: CourseTab; label: string; icon: ReactNode }[] = [
  { key: 'lab-classes', label: 'Lab Classes', icon: <FlaskConical size={16} /> },
  { key: 'lecture-materials', label: 'Lecture Materials', icon: <Files size={16} /> },
  { key: 'lab-tasks', label: 'Lab Tasks', icon: <BookOpen size={16} /> },
  { key: 'lab-tests', label: 'Lab Tests', icon: <BookOpen size={16} /> },
  { key: 'assignments', label: 'Assignments', icon: <FilePlus2 size={16} /> },
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
  return `/student/courses/${courseId}/materials/${sheetId}`;
}

function getActivityHref(courseId: string, activity: any): string {
  return `/student/lab-tests/${activity.id}?courseId=${courseId}&kind=${
    activity.activityKind ?? 'lab_test'
  }`;
}

function getActivityTitle(activity: any): string {
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

function getActivityStatusClasses(status: string | null | undefined): string {
  if (status === 'running') return 'bg-emerald-50 text-emerald-700';
  if (status === 'ended') return 'bg-slate-100 text-slate-600';
  return 'bg-amber-50 text-amber-700';
}

function getActivityStatusSurface(status: string | null | undefined): string {
  if (status === 'running') {
    return 'border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_100%)]';
  }
  if (status === 'ended') {
    return 'border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)]';
  }
  return 'border-amber-200 bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_100%)]';
}

function getActivityDurationLabel(activity: any): string {
  if (activity?.durationMinutes && activity.durationMinutes > 0) {
    return `${activity.durationMinutes} min`;
  }

  if (activity?.startTime && activity?.endTime) {
    const diff = new Date(activity.endTime).getTime() - new Date(activity.startTime).getTime();
    if (Number.isFinite(diff) && diff > 0) {
      return `${Math.max(1, Math.ceil(diff / 60_000))} min`;
    }
  }

  return 'Duration unavailable';
}

function getSubmissionStatusLabel(assignment: any): string {
  if (assignment?.mySubmission?.score != null) {
    return `Scored ${assignment.mySubmission.score}/${assignment.totalMarks ?? 0}`;
  }
  if (assignment?.mySubmission) {
    return 'Submitted';
  }
  return 'Not submitted';
}

function getSubmissionStatusClasses(assignment: any): string {
  if (assignment?.mySubmission?.score != null) {
    return 'bg-emerald-50 text-emerald-700';
  }
  if (assignment?.mySubmission) {
    return 'bg-sky-50 text-sky-700';
  }
  return 'bg-slate-100 text-slate-600';
}

function getAttendanceOutcomeLabel(status: string | null | undefined): string {
  return status === 'present' ? 'Attended' : 'Missed';
}

function getAttendanceOutcomeClasses(status: string | null | undefined): string {
  return status === 'present'
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-rose-50 text-rose-700';
}

function getAttendanceOutcomeSurface(status: string | null | undefined): string {
  return status === 'present'
    ? 'border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_100%)]'
    : 'border-rose-200 bg-[linear-gradient(135deg,#fff1f2_0%,#ffffff_100%)]';
}

function getDeadlineTime(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function isAssignmentSubmitted(assignment: any): boolean {
  return Boolean(assignment?.mySubmission);
}

function isAssignmentOverdue(assignment: any): boolean {
  return getDeadlineTime(assignment?.deadline) < Date.now() && !isAssignmentSubmitted(assignment);
}

function sortAssignmentsForStudent(assignments: any[]) {
  return [...(assignments ?? [])].sort((left, right) => {
    const leftSubmitted = isAssignmentSubmitted(left);
    const rightSubmitted = isAssignmentSubmitted(right);

    if (leftSubmitted !== rightSubmitted) {
      return leftSubmitted ? 1 : -1;
    }

    const leftDeadline = getDeadlineTime(left?.deadline);
    const rightDeadline = getDeadlineTime(right?.deadline);
    if (leftDeadline !== rightDeadline) {
      return leftDeadline - rightDeadline;
    }

    return String(left?.title ?? '').localeCompare(String(right?.title ?? ''));
  });
}

function getAssignmentCardSurface(assignment: any): string {
  if (isAssignmentSubmitted(assignment)) {
    return assignment?.mySubmission?.score != null
      ? 'border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_100%)]'
      : 'border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_100%)]';
  }

  if (isAssignmentOverdue(assignment)) {
    return 'border-rose-200 bg-[linear-gradient(135deg,#fff1f2_0%,#ffffff_100%)]';
  }

  return 'border-amber-200 bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_100%)]';
}

function getAssignmentHighlightLabel(assignment: any): string {
  if (assignment?.mySubmission?.score != null) {
    return `Scored ${assignment.mySubmission.score}/${assignment.totalMarks ?? 0}`;
  }
  if (assignment?.mySubmission) {
    return 'Submitted';
  }
  if (isAssignmentOverdue(assignment)) {
    return 'Missed deadline';
  }
  return 'Pending';
}

function getAssignmentHighlightClasses(assignment: any): string {
  if (assignment?.mySubmission?.score != null) {
    return 'bg-emerald-50 text-emerald-700';
  }
  if (assignment?.mySubmission) {
    return 'bg-sky-50 text-sky-700';
  }
  if (isAssignmentOverdue(assignment)) {
    return 'bg-rose-50 text-rose-700';
  }
  return 'bg-amber-50 text-amber-700';
}

function getMaterialCardSurface(sheet: any): string {
  return sheet?.labClassId
    ? 'border-sky-200 bg-[linear-gradient(135deg,#f0f9ff_0%,#ffffff_100%)]'
    : 'border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)]';
}

export function StudentCourseDetail() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const profile = (user?.profile as Record<string, unknown> | undefined) ?? undefined;
  const studentIdentityValue = getStudentIdentityValue(user, profile);

  const requestedTab = searchParams.get('tab');
  const activeTab: CourseTab = tabItems.some((tab) => tab.key === requestedTab)
    ? (requestedTab as CourseTab)
    : 'lab-classes';

  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ['student-course-detail', courseId],
    queryFn: () => api.get(`/courses/${courseId}`).then((response) => response.data),
    enabled: Boolean(courseId),
  });
  const { data: labClasses = [] } = useQuery({
    queryKey: ['student-course-lab-classes-page', courseId],
    queryFn: () => api.get(`/courses/${courseId}/lab-classes`).then((response) => response.data),
    enabled: Boolean(courseId),
  });
  const { data: lectureSheets = [] } = useQuery({
    queryKey: ['student-course-lecture-materials-page', courseId],
    queryFn: () =>
      api.get(`/courses/${courseId}/lecture-materials`).then((response) => response.data),
    enabled: Boolean(courseId),
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ['student-course-assignments-page', courseId],
    queryFn: () => api.get(`/assignments/course/${courseId}`).then((response) => response.data),
    enabled: Boolean(courseId),
  });
  const { data: labTests = [] } = useQuery({
    queryKey: ['student-course-lab-tests-page', courseId],
    queryFn: () =>
      api
        .get(`/lab-tests/course/${courseId}`, {
          params: { kind: 'lab_test' },
        })
        .then((response) => response.data),
    enabled: Boolean(courseId),
  });
  const { data: labTasks = [] } = useQuery({
    queryKey: ['student-course-lab-tasks-page', courseId],
    queryFn: () =>
      api
        .get(`/lab-tests/course/${courseId}`, {
          params: { kind: 'lab_task' },
        })
        .then((response) => response.data),
    enabled: Boolean(courseId),
  });

  const archived = isCourseArchived(course);
  const sectionNames = useMemo(() => getCourseSectionNames(course), [course]);
  const students = useMemo(() => getCourseStudents(course), [course]);
  const viewerSectionName = useMemo(
    () => getStudentSectionNameForCourse(course, studentIdentityValue),
    [course, studentIdentityValue],
  );
  const viewerSchedule = useMemo(
    () => getStudentScheduleForCourse(course, studentIdentityValue),
    [course, studentIdentityValue],
  );
  const visibleLectureSheets = useMemo(
    () =>
      (lectureSheets as any[]).filter((sheet: any) => {
        if (!sheet?.sectionName) {
          return true;
        }

        if (sheet.sectionName === viewerSectionName) {
          return true;
        }

        if (!sheet?.labClassId) {
          return false;
        }

        const matchingLabClass = (labClasses as any[]).find(
          (labClass: any) => labClass?.id === sheet.labClassId,
        );
        const effectiveSectionName =
          matchingLabClass?.viewerEffectiveSectionName ??
          matchingLabClass?.viewerAttendance?.sectionName ??
          viewerSectionName;

        return sheet.sectionName === effectiveSectionName;
      }),
    [labClasses, lectureSheets, viewerSectionName],
  );
  const visibleLabClasses = useMemo(
    () =>
      [...(labClasses as any[])].sort(
        (left: any, right: any) => Number(right?.labNumber ?? 0) - Number(left?.labNumber ?? 0),
      ),
    [labClasses],
  );
  const sortedAssignments = useMemo(
    () => sortAssignmentsForStudent(assignments as any[]),
    [assignments],
  );
  const classmates = useMemo(
    () => getStudentsForSection(course, viewerSectionName),
    [course, viewerSectionName],
  );

  if (courseLoading) {
    return (
      <div className="space-y-5">
        <div className="h-56 animate-pulse rounded-[30px] border border-slate-200 bg-white" />
        <div className="h-96 animate-pulse rounded-[30px] border border-slate-200 bg-white" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="text-lg font-semibold text-slate-900">Course not found</p>
        <Link
          to="/student/courses"
          className="mt-5 inline-flex rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Back to courses
        </Link>
      </div>
    );
  }

  const assignedTeachers = Array.isArray(course?.teachers) ? course.teachers : [];

  const setActiveTab = (tab: CourseTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <Link
              to="/student/courses"
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
                  archived ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'
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

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoBadge label="Your section" value={viewerSectionName} />
            <InfoBadge
              label="Your schedule"
              value={
                viewerSchedule?.startTime && viewerSchedule?.endTime
                  ? `${viewerSchedule.dayOfWeek} · ${formatTimeRange(
                      viewerSchedule.startTime,
                      viewerSchedule.endTime,
                    )}`
                  : 'Not scheduled'
              }
            />
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
      </section>

      {activeTab === 'lab-classes' ? (
        <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          {course?.type !== 'lab' ? (
            <EmptyState title="No lab classes for this course" />
          ) : visibleLabClasses.length ? (
            <div className="space-y-4">
              {visibleLabClasses.map((labClass: any) => {
                const viewerSection =
                  (labClass.sections ?? []).find(
                    (section: any) => section?.sectionName === viewerSectionName,
                  ) ??
                  (labClass.sections ?? []).find(
                    (section: any) => section?.sectionName === 'All Students',
                  ) ??
                  null;
                const effectiveSchedule = getEffectiveLabSectionSchedule(course, viewerSection);
                const attendanceStatus = labClass?.viewerAttendance?.status ?? 'absent';

                return (
                  <Link
                    key={labClass.id}
                    to={`/student/courses/${courseId}/lab-classes/${labClass.id}`}
                    className={`group block rounded-[26px] border p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-38px_rgba(15,23,42,0.45)] ${getAttendanceOutcomeSurface(
                      attendanceStatus,
                    )}`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                            Lab {labClass.labNumber}
                          </span>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                            {viewerSectionName}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${getAttendanceOutcomeClasses(
                              attendanceStatus,
                            )}`}
                          >
                            {getAttendanceOutcomeLabel(attendanceStatus)}
                          </span>
                        </div>
                        <h3 className="mt-3 text-lg font-semibold text-slate-900">
                          {labClass.title}
                        </h3>
                        {labClass.description ? (
                          <p className="mt-2 text-sm text-slate-500">{labClass.description}</p>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-start gap-2 lg:items-end">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          {effectiveSchedule?.kind === 'override' && effectiveSchedule?.date
                            ? `${formatDateOnly(effectiveSchedule.date)} · ${formatTimeRange(
                                effectiveSchedule.startTime,
                                effectiveSchedule.endTime,
                              )}`
                            : effectiveSchedule?.startTime && effectiveSchedule?.endTime
                              ? `${effectiveSchedule.dayOfWeek} · ${formatTimeRange(
                                  effectiveSchedule.startTime,
                                  effectiveSchedule.endTime,
                                )}`
                              : formatDateOnly(labClass.classDate)}
                        </span>
                        {labClass?.viewerAttendance?.takenAt ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                            <CheckCircle2 size={12} className="text-slate-400" />
                            Recorded {formatDateTime(labClass.viewerAttendance.takenAt)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-white/70 pt-4">
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        {effectiveSchedule?.roomNumber ? (
                          <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-600 ring-1 ring-slate-200">
                            Room {effectiveSchedule.roomNumber}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-600 ring-1 ring-slate-200">
                          Materials and task history
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
                        Open workspace
                        <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No lab classes yet" />
          )}
        </section>
      ) : null}

      {activeTab === 'lecture-materials' ? (
        <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          {visibleLectureSheets.length ? (
            <div className="space-y-4">
              {visibleLectureSheets.map((sheet: any) => (
                <div
                  key={sheet.id}
                  className={`rounded-[26px] border p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.35)] ${getMaterialCardSurface(
                    sheet,
                  )}`}
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
                          href={getMaterialHref(String(courseId), sheet.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-50"
                        >
                          <Files size={12} />
                          Open
                        </a>
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

                  <div className="mt-5 flex items-center justify-between border-t border-white/80 pt-4">
                    <div className="flex flex-wrap gap-2">
                      {sheet.labClass?.labNumber ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                          Linked to Lab {sheet.labClass.labNumber}
                        </span>
                      ) : (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                          Course-wide resource
                        </span>
                      )}
                    </div>
                    <a
                      href={getMaterialHref(String(courseId), sheet.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900"
                    >
                      View detail
                      <ArrowRight size={16} />
                    </a>
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
          {sortedAssignments.length ? (
            <div className="space-y-4">
              {sortedAssignments.map((assignment: any) => (
                <div
                  key={assignment.id}
                  className={`rounded-[26px] border p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.35)] ${getAssignmentCardSurface(
                    assignment,
                  )}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getAssignmentHighlightClasses(
                            assignment,
                          )}`}
                        >
                          {getAssignmentHighlightLabel(assignment)}
                        </span>
                        {!isAssignmentSubmitted(assignment) ? (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                            Closest deadlines first
                          </span>
                        ) : null}
                      </div>
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
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                          isAssignmentOverdue(assignment) && !isAssignmentSubmitted(assignment)
                            ? 'bg-rose-50 text-rose-700 ring-rose-200'
                            : 'bg-white text-slate-700 ring-slate-200'
                        }`}
                      >
                        {formatDateTime(assignment.deadline)}
                      </span>
                      {assignment?.mySubmission?.submittedAt ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          Submitted {formatDateTime(assignment.mySubmission.submittedAt)}
                        </span>
                      ) : null}
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

                  <div className="mt-5 flex items-center justify-between border-t border-white/80 pt-4">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getSubmissionStatusClasses(
                          assignment,
                        )}`}
                      >
                        {getSubmissionStatusLabel(assignment)}
                      </span>
                    </div>
                    <Link
                      to={`/student/assignments?assignmentId=${assignment.id}`}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      Open assignment
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No assignments yet" />
          )}
        </section>
      ) : null}

      {activeTab === 'members' ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.6fr)]">
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Teachers
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Course faculty</h2>

            {assignedTeachers.length ? (
              <div className="mt-5 space-y-3">
                {assignedTeachers.map((teacher: any) => (
                  <div
                    key={teacher.id ?? teacher.teacherId ?? teacher.fullName}
                    className="flex items-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <TeacherAvatar teacher={teacher} size="sm" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {teacher.fullName || teacher.teacherId}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {teacher.designation || teacher.teacherId || 'Teacher'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                No teachers assigned yet.
              </div>
            )}
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Classmates
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">Your section</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {viewerSectionName}
              </span>
            </div>

            {classmates.length ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {classmates.map((student: any) => (
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
                    {student.email ? (
                      <p className="mt-4 truncate text-xs text-slate-400">{student.email}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No classmates found for your section" />
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'lab-tests' ? (
        <ActivityList
          courseId={String(courseId)}
          activities={labTests as any[]}
          title="No lab tests yet"
        />
      ) : null}

      {activeTab === 'lab-tasks' ? (
        <ActivityList
          courseId={String(courseId)}
          activities={labTasks as any[]}
          title="No lab tasks yet"
        />
      ) : null}
    </div>
  );
}

function ActivityList({
  courseId,
  activities,
  title,
}: {
  courseId: string;
  activities: any[];
  title: string;
}) {
  if (!activities.length) {
    return (
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
        <EmptyState title={title} />
      </section>
    );
  }

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
      <div className="space-y-4">
        {activities.map((activity: any) => (
          <div
            key={activity.id}
            className={`rounded-[26px] border p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.35)] ${getActivityStatusSurface(
              activity.status,
            )}`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${getActivityStatusClasses(
                      activity.status,
                    )}`}
                  >
                    {String(activity.status ?? 'draft').replace(/_/g, ' ')}
                  </span>
                  {activity.labClass?.labNumber ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                      Lab {activity.labClass.labNumber}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">
                  {getActivityTitle(activity)}
                </h3>
                {activity.description ? (
                  <p className="mt-2 text-sm text-slate-500">{activity.description}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {getActivityDurationLabel(activity)}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {activity.startTime ? formatDateTime(activity.startTime) : 'Not started'}
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-white/80 pt-4">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                  {activity.activityKind === 'lab_task' ? 'Hands-on task' : 'Judge-based test'}
                </span>
              </div>
              <Link
                to={getActivityHref(courseId, activity)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Open workspace
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function InfoBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
      {title}
    </div>
  );
}
