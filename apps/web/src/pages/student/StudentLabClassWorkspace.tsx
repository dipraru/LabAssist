import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, Clock3, ExternalLink, FlaskConical, MapPin } from 'lucide-react';
import { api } from '../../lib/api';
import {
  TeacherAvatar,
  formatDateOnly,
  formatTimeRange,
} from '../teacher/teacher.shared';

function courseCode(course: any): string {
  return course?.courseCode ?? course?.code ?? 'N/A';
}

function courseTitle(course: any): string {
  return course?.title ?? course?.name ?? 'Untitled Course';
}

function getMaterialHref(courseId: string, sheetId: string): string {
  return `/student/courses/${courseId}/materials/${sheetId}`;
}

export function StudentLabClassWorkspace() {
  const { courseId, labClassId } = useParams<{
    courseId: string;
    labClassId: string;
  }>();

  const { data: labClass, isLoading } = useQuery({
    queryKey: ['student-lab-class', courseId, labClassId],
    queryFn: () =>
      api
        .get(`/courses/${courseId}/lab-classes/${labClassId}`)
        .then((response) => response.data),
    enabled: Boolean(courseId && labClassId),
  });

  const { data: allLabClasses = [] } = useQuery({
    queryKey: ['student-course-lab-classes', courseId],
    queryFn: () =>
      api.get(`/courses/${courseId}/lab-classes`).then((response) => response.data),
    enabled: Boolean(courseId),
  });

  const { data: lectureMaterials = [] } = useQuery({
    queryKey: ['student-course-lecture-materials', courseId],
    queryFn: () =>
      api.get(`/courses/${courseId}/lecture-materials`).then((response) => response.data),
    enabled: Boolean(courseId),
  });

  const course = labClass?.course ?? null;
  const viewerSectionName = labClass?.viewerSectionName ?? 'All Students';
  const viewerSection = useMemo(
    () =>
      (labClass?.sections ?? []).find(
        (section: any) => section?.sectionName === viewerSectionName,
      ) ?? null,
    [labClass?.sections, viewerSectionName],
  );
  const visibleMaterials = useMemo(
    () =>
      (lectureMaterials as any[]).filter(
        (sheet: any) =>
          sheet?.labClassId === labClassId &&
          (!sheet?.sectionName || sheet.sectionName === viewerSectionName),
      ),
    [labClassId, lectureMaterials, viewerSectionName],
  );
  const orderedLabs = useMemo(
    () =>
      [...(allLabClasses as any[])].sort(
        (left: any, right: any) =>
          Number(left?.labNumber ?? 0) - Number(right?.labNumber ?? 0),
      ),
    [allLabClasses],
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

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              to={`/student/courses/${courseId}`}
              className="text-sm font-medium text-indigo-600 transition hover:text-indigo-700"
            >
              Back to course
            </Link>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              {courseCode(course)} · Lab {labClass.labNumber}
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">{labClass.title}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {labClass.description || `Materials and updates for ${courseTitle(course)}.`}
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">{viewerSectionName}</p>
            <p className="mt-1">Your assigned section</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(340px,0.95fr)]">
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
                  className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5"
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
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
              No lecture material has been posted for this lab yet.
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Lab Details
            </p>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-start gap-3 rounded-[22px] bg-slate-50 px-4 py-3">
                <CalendarDays size={16} className="mt-0.5 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-900">Date</p>
                  <p>{formatDateOnly(viewerSection?.scheduledDate ?? labClass.classDate)}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-[22px] bg-slate-50 px-4 py-3">
                <Clock3 size={16} className="mt-0.5 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-900">Time</p>
                  <p>
                    {viewerSection?.scheduledStartTime && viewerSection?.scheduledEndTime
                      ? formatTimeRange(
                          viewerSection.scheduledStartTime,
                          viewerSection.scheduledEndTime,
                        )
                      : 'Not scheduled'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-[22px] bg-slate-50 px-4 py-3">
                <MapPin size={16} className="mt-0.5 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-900">Room</p>
                  <p>{viewerSection?.roomNumber || 'Room not assigned'}</p>
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
                    <p className="text-sm font-semibold text-slate-900">
                      Lab {item.labNumber}
                    </p>
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
