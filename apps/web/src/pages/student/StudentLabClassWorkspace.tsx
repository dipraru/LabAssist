import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ExternalLink,
  FlaskConical,
  MapPin,
  XCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { LabDiscussionPanel } from '../../components/LabDiscussionPanel';
import {
  TeacherAvatar,
  formatDateOnly,
  formatDateTime,
  formatTimeRange,
  getEffectiveLabSectionSchedule,
} from '../teacher/teacher.shared';

function getMaterialHref(courseId: string, sheetId: string): string {
  return `/student/courses/${courseId}/materials/${sheetId}`;
}

function getActivityHref(courseId: string, activity: any): string {
  return `/student/lab-tests/${activity.id}?courseId=${courseId}&kind=${
    activity.activityKind ?? 'lab_task'
  }`;
}

function getActivityTitle(activity: any): string {
  if (activity?.title?.trim()) {
    return activity.title.trim();
  }

  if (activity?.labClass?.labNumber) {
    return `Lab ${activity.labClass.labNumber} Task`;
  }

  return 'Lab Task';
}

function getActivityStatusClasses(status: string | null | undefined): string {
  if (status === 'running') return 'bg-emerald-50 text-emerald-700';
  if (status === 'ended') return 'bg-slate-100 text-slate-600';
  return 'bg-amber-50 text-amber-700';
}

function getActivitySurface(status: string | null | undefined): string {
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

function getAttendanceOutcomeLabel(status: string | null | undefined): string {
  if (status === 'present') return 'Attended';
  if (status === 'not_taken') return 'Upcoming';
  return 'Missed';
}

function getAttendanceOutcomeClasses(status: string | null | undefined): string {
  if (status === 'not_taken') {
    return 'bg-amber-50 text-amber-700';
  }
  return status === 'present'
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-rose-50 text-rose-700';
}

export function StudentLabClassWorkspace() {
  const { courseId, labClassId } = useParams<{
    courseId: string;
    labClassId: string;
  }>();

  const { data: labClass, isLoading } = useQuery({
    queryKey: ['student-lab-class-detail', courseId, labClassId],
    queryFn: () =>
      api
        .get(`/courses/${courseId}/lab-classes/${labClassId}`)
        .then((response) => response.data),
    enabled: Boolean(courseId && labClassId),
  });

  const { data: allLabClasses = [] } = useQuery({
    queryKey: ['student-course-lab-classes-sidebar', courseId],
    queryFn: () =>
      api.get(`/courses/${courseId}/lab-classes`).then((response) => response.data),
    enabled: Boolean(courseId),
  });

  const { data: lectureMaterials = [] } = useQuery({
    queryKey: ['student-course-lecture-materials-lab', courseId],
    queryFn: () =>
      api.get(`/courses/${courseId}/lecture-materials`).then((response) => response.data),
    enabled: Boolean(courseId),
  });

  const { data: labTasks = [] } = useQuery({
    queryKey: ['student-lab-class-tasks', courseId, labClassId],
    queryFn: () =>
      api
        .get(`/lab-tests/course/${courseId}`, {
          params: { kind: 'lab_task', labClassId },
        })
        .then((response) => response.data),
    enabled: Boolean(courseId && labClassId),
  });

  const course = labClass?.course ?? null;
  const viewerSectionName = labClass?.viewerSectionName ?? 'All Students';
  const viewerEffectiveSectionName =
    labClass?.viewerEffectiveSectionName ??
    labClass?.viewerAttendance?.sectionName ??
    viewerSectionName;
  const viewerSection = useMemo(
    () =>
      (labClass?.sections ?? []).find(
        (section: any) => section?.sectionName === viewerEffectiveSectionName,
      ) ??
      (labClass?.sections ?? []).find(
        (section: any) => section?.sectionName === 'All Students',
      ) ??
      null,
    [labClass?.sections, viewerEffectiveSectionName],
  );
  const visibleMaterials = useMemo(
    () =>
      (lectureMaterials as any[]).filter(
        (sheet: any) =>
          sheet?.labClassId === labClassId &&
          (!sheet?.sectionName || sheet.sectionName === viewerEffectiveSectionName),
      ),
    [labClassId, lectureMaterials, viewerEffectiveSectionName],
  );
  const orderedLabs = useMemo(
    () =>
      [...(allLabClasses as any[])].sort(
        (left: any, right: any) => Number(right?.labNumber ?? 0) - Number(left?.labNumber ?? 0),
      ),
    [allLabClasses],
  );
  const effectiveSchedule = useMemo(
    () => getEffectiveLabSectionSchedule(course, viewerSection),
    [course, viewerSection],
  );

  if (!courseId || !labClassId) return null;

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-44 animate-pulse rounded-[28px] border border-slate-200 bg-white" />
        <div className="h-96 animate-pulse rounded-[28px] border border-slate-200 bg-white" />
      </div>
    );
  }

  if (!labClass || !course) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="text-lg font-semibold text-slate-900">Lab class not found</p>
        <Link
          to={courseId ? `/student/courses/${courseId}` : '/student/courses'}
          className="mt-5 inline-flex rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Back to course
        </Link>
      </div>
    );
  }

  const attendanceStatus = labClass?.viewerAttendance?.status ?? 'not_taken';
  const attendanceSectionName =
    labClass?.viewerAttendance?.sectionName ?? viewerEffectiveSectionName;
  const attendanceOutcome =
    attendanceStatus === 'present' || attendanceStatus === 'absent'
      ? attendanceStatus
      : 'absent';

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link
              to={`/student/courses/${courseId}?tab=lab-classes`}
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
                {viewerEffectiveSectionName}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${getAttendanceOutcomeClasses(
                  attendanceOutcome,
                )}`}
              >
                {getAttendanceOutcomeLabel(attendanceOutcome)}
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-semibold text-slate-900">{labClass.title}</h1>
            {labClass.description ? (
              <p className="mt-2 text-sm text-slate-500">{labClass.description}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-500">
              <span className="inline-flex items-center gap-2">
                <CalendarClock size={15} className="text-slate-400" />
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
                    : 'Schedule not set'}
              </span>
              {effectiveSchedule?.roomNumber ? (
                <span className="inline-flex items-center gap-2">
                  <MapPin size={15} className="text-slate-400" />
                  Room {effectiveSchedule.roomNumber}
                </span>
              ) : null}
            </div>
          </div>

          <AttendanceStatusCard
            status={attendanceStatus}
            takenAt={labClass?.viewerAttendance?.takenAt}
            sectionName={attendanceSectionName}
            fallbackSectionName={viewerEffectiveSectionName}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(340px,0.95fr)]">
        <div className="space-y-6">
          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                <FlaskConical size={18} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Lab Materials
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  Current Lab Workspace
                </h2>
              </div>
            </div>

            {visibleMaterials.length ? (
              <div className="mt-6 space-y-4">
                {visibleMaterials.map((sheet: any) => (
                  <article
                    key={sheet.id}
                    className="rounded-[26px] border border-sky-200 bg-[linear-gradient(135deg,#f0f9ff_0%,#ffffff_100%)] p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.35)]"
                  >
                    <a
                      href={getMaterialHref(courseId, sheet.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          {sheet.sectionName ? `${sheet.sectionName} only` : 'All sections'}
                        </span>
                        <span className="text-xs font-medium text-slate-400">
                          {formatDateOnly(sheet.createdAt)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
                          Open material
                          <ExternalLink size={12} />
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-slate-900">{sheet.title}</h3>
                      {sheet.description ? (
                        <p className="mt-2 text-sm leading-6 text-slate-600">{sheet.description}</p>
                      ) : null}
                    </a>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {(sheet.links ?? []).map((link: any, index: number) => (
                        <a
                          key={`${sheet.id}-${index}`}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                        >
                          <ExternalLink size={12} />
                          {link.label || 'Open material'}
                        </a>
                      ))}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-white/80 pt-4">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                          {sheet.sectionName ? 'Section-scoped' : 'Shared resource'}
                        </span>
                      </div>
                      <a
                        href={getMaterialHref(courseId, sheet.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900"
                      >
                        View detail
                        <ArrowRight size={16} />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
                No lecture material has been posted for this lab yet.
              </div>
            )}
          </section>

          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <BookOpen size={18} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Lab Tasks
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  Tasks for this lab
                </h2>
              </div>
            </div>

            {(labTasks as any[]).length ? (
              <div className="mt-6 space-y-4">
                {(labTasks as any[]).map((activity: any) => (
                  <div
                    key={activity.id}
                    className={`rounded-[26px] border p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.35)] ${getActivitySurface(
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
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                            {getActivityDurationLabel(activity)}
                          </span>
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
                          {activity.startTime ? formatDateTime(activity.startTime) : 'Not started'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <Link
                        to={getActivityHref(courseId, activity)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        Open task workspace
                        <ArrowRight size={16} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
                No lab task has been published for this lab yet.
              </div>
            )}
          </section>

          <LabDiscussionPanel
            role="student"
            courseId={String(courseId)}
            labClass={labClass}
          />
        </div>

        <aside className="space-y-6">
          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Lab Details
            </p>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-start gap-3 rounded-[22px] bg-slate-50 px-4 py-3">
                <CalendarClock size={16} className="mt-0.5 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-900">Date</p>
                  <p>
                    {effectiveSchedule?.kind === 'override' && effectiveSchedule?.date
                      ? formatDateOnly(effectiveSchedule.date)
                      : formatDateOnly(viewerSection?.scheduledDate ?? labClass.classDate)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-[22px] bg-slate-50 px-4 py-3">
                <Clock3 size={16} className="mt-0.5 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-900">Time</p>
                  <p>
                    {effectiveSchedule?.startTime && effectiveSchedule?.endTime
                      ? formatTimeRange(effectiveSchedule.startTime, effectiveSchedule.endTime)
                      : 'Not scheduled'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-[22px] bg-slate-50 px-4 py-3">
                <MapPin size={16} className="mt-0.5 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-900">Room</p>
                  <p>{effectiveSchedule?.roomNumber || 'Room not assigned'}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Teachers
            </p>
            <div className="mt-4 space-y-3">
              {(course.teachers ?? []).map((teacher: any) => (
                <div
                  key={teacher.id ?? teacher.teacherId ?? teacher.fullName}
                  className="flex items-center gap-3 rounded-[22px] bg-slate-50 px-4 py-3"
                >
                  <TeacherAvatar teacher={teacher} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {teacher.fullName || teacher.teacherId}
                    </p>
                    <p className="text-xs text-slate-500">
                      {teacher.designation || teacher.teacherId || 'Teacher'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Other Labs
            </p>
            <div className="mt-4 space-y-3">
              {orderedLabs.map((item: any) => {
                const href = `/student/courses/${courseId}/lab-classes/${item.id}`;
                const active = item.id === labClassId;
                const itemAttendance = item?.viewerAttendance?.status ?? 'absent';

                return (
                  <Link
                    key={item.id}
                    to={href}
                    className={`block rounded-[22px] border px-4 py-3 transition ${
                      active
                        ? 'border-sky-200 bg-sky-50'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">Lab {item.labNumber}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getAttendanceOutcomeClasses(
                          itemAttendance,
                        )}`}
                      >
                        {getAttendanceOutcomeLabel(itemAttendance)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.title}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function AttendanceStatusCard({
  status,
  takenAt,
  sectionName,
  fallbackSectionName,
}: {
  status: string;
  takenAt?: string | null;
  sectionName?: string | null;
  fallbackSectionName: string;
}) {
  const normalizedStatus =
    status === 'present' || status === 'absent' ? status : 'not_taken';
  const effectiveSectionName = sectionName || fallbackSectionName;

  if (normalizedStatus === 'present') {
    return (
      <div className="rounded-[26px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5" size={20} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">
              Attendance
            </p>
            <p className="mt-2 text-lg font-semibold">Marked present</p>
            <p className="mt-1 text-sm">
              Recorded for {effectiveSectionName}
              {takenAt ? ` on ${formatDateTime(takenAt)}` : '.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (normalizedStatus === 'absent') {
    return (
      <div className="rounded-[26px] border border-rose-200 bg-rose-50 px-5 py-4 text-rose-800">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5" size={20} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">
              Attendance
            </p>
            <p className="mt-2 text-lg font-semibold">Marked absent</p>
            <p className="mt-1 text-sm">
              Recorded for {effectiveSectionName}
              {takenAt ? ` on ${formatDateTime(takenAt)}` : '.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[26px] border border-slate-200 bg-slate-50 px-5 py-4 text-slate-700">
      <div className="flex items-start gap-3">
        <CircleDashed className="mt-0.5" size={20} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Attendance
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-900">Attendance not taken yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Your attendance for {effectiveSectionName} will appear here after the teacher records
            it.
          </p>
        </div>
      </div>
    </div>
  );
}
