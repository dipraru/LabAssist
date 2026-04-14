import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ExternalLink, FileText, Image as ImageIcon } from 'lucide-react';
import { api } from '../lib/api';
import { courseCode, courseTitle } from '../lib/display';
import { TeacherAvatar } from '../pages/teacher/teacher.shared';

type Role = 'teacher' | 'student';

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function isPdfLink(url: string): boolean {
  return /\.pdf($|\?)/i.test(url) || url.includes('/uploads/');
}

function isImageLink(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)($|\?)/i.test(url);
}

function getMaterialHref(role: Role, courseId: string, sheetId: string) {
  return `/${role}/courses/${courseId}/materials/${sheetId}`;
}

export function CourseMaterialDetail({ role }: { role: Role }) {
  const { courseId, sheetId } = useParams<{ courseId: string; sheetId: string }>();
  const basePath = role === 'teacher' ? '/teacher/courses' : '/student/courses';

  const { data: course } = useQuery({
    queryKey: [role, 'material-course', courseId],
    queryFn: () => api.get(`/courses/${courseId}`).then((response) => response.data),
    enabled: Boolean(courseId),
  });

  const { data: materials = [], isLoading } = useQuery({
    queryKey: [role, 'material-list', courseId],
    queryFn: () =>
      api.get(`/courses/${courseId}/lecture-materials`).then((response) => response.data),
    enabled: Boolean(courseId),
  });

  const material = useMemo(
    () => (materials as any[]).find((sheet: any) => sheet.id === sheetId) ?? null,
    [materials, sheetId],
  );
  const previewLink = useMemo(
    () =>
      (material?.links ?? []).find((link: any) =>
        isPdfLink(String(link?.url ?? '')) || isImageLink(String(link?.url ?? '')),
      ) ?? null,
    [material?.links],
  );

  if (!courseId || !sheetId) return null;

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-40 animate-pulse rounded-[28px] border border-slate-200 bg-white" />
        <div className="h-[32rem] animate-pulse rounded-[28px] border border-slate-200 bg-white" />
      </div>
    );
  }

  if (!material) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="text-lg font-semibold text-slate-900">Material not found</p>
        <Link
          to={courseId ? `${basePath}/${courseId}` : basePath}
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
        <Link
          to={`${basePath}/${courseId}`}
          className="text-sm font-medium text-indigo-600 transition hover:text-indigo-700"
        >
          Back to course
        </Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
          {courseCode(course)} · Material
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{material.title}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {material.description || `Shared for ${courseTitle(course)}.`}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {formatDateTime(material.createdAt)}
          </span>
          {material.labClassId ? (
            <Link
              to={`${basePath}/${courseId}/lab-classes/${material.labClassId}`}
              className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700"
            >
              Open related lab
            </Link>
          ) : null}
          {material.sectionName ? (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {material.sectionName}
            </span>
          ) : null}
        </div>

        {Array.isArray(course?.teachers) && course.teachers.length ? (
          <div className="mt-5 flex flex-wrap gap-3">
            {course.teachers.map((teacher: any) => (
              <div
                key={teacher.id ?? teacher.teacherId ?? teacher.fullName}
                className="inline-flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2"
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
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,0.9fr)]">
        <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
              {previewLink?.url && isImageLink(previewLink.url) ? (
                <ImageIcon size={18} />
              ) : (
                <FileText size={18} />
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Material Preview
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                {previewLink ? 'Preview' : 'Contents'}
              </h2>
            </div>
          </div>

          {previewLink?.url ? (
            <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
              {isImageLink(previewLink.url) ? (
                <img
                  src={previewLink.url}
                  alt={previewLink.label || material.title}
                  className="max-h-[70vh] w-full object-contain bg-white"
                />
              ) : (
                <iframe
                  src={previewLink.url}
                  title={previewLink.label || material.title}
                  className="h-[70vh] w-full bg-white"
                />
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
              No inline preview available for this material. Open one of the attachments on the
              right.
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Attachments
            </p>
            <div className="mt-4 space-y-3">
              {(material.links ?? []).map((link: any, index: number) => (
                <a
                  key={`${material.id}-${index}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {link.label || `Attachment ${index + 1}`}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">{link.url}</p>
                  </div>
                  <ExternalLink size={16} className="mt-0.5 shrink-0 text-slate-400" />
                </a>
              ))}
            </div>
          </section>

          <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              More Materials
            </p>
            <div className="mt-4 space-y-3">
              {(materials as any[])
                .slice(0, 8)
                .map((sheet: any) => (
                  <a
                    key={sheet.id}
                    href={getMaterialHref(role, courseId, sheet.id)}
                    target="_blank"
                    rel="noreferrer"
                    className={`block rounded-[22px] border px-4 py-3 transition ${
                      sheet.id === sheetId
                        ? 'border-sky-200 bg-sky-50'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">{sheet.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(sheet.createdAt)}</p>
                  </a>
                ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
