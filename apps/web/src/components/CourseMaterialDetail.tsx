import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Layers3,
  Link2,
} from 'lucide-react';
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
      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_70px_-45px_rgba(15,23,42,0.35)]">
        <div className="bg-[radial-gradient(circle_at_top_left,#0f172a,transparent_42%),linear-gradient(135deg,#082f49_0%,#1e3a8a_58%,#38bdf8_100%)] px-6 py-8 text-white sm:px-8">
          <Link
            to={`${basePath}/${courseId}`}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
          >
            <ArrowLeft size={16} />
            Back to course
          </Link>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-sky-100/85">
            {courseCode(course)} · Material Viewer
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{material.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-sky-50/85">
            {material.description || `Shared for ${courseTitle(course)}.`}
          </p>

          <div className="mt-6 flex flex-wrap gap-3 text-sm text-sky-50/90">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
              Added {formatDateTime(material.createdAt)}
            </span>
            {material.sectionName ? (
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
                Section {material.sectionName}
              </span>
            ) : (
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
                Shared with all sections
              </span>
            )}
            {material.labClassId ? (
              <Link
                to={`${basePath}/${courseId}/lab-classes/${material.labClassId}`}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 transition hover:bg-white/20"
              >
                Open related lab
              </Link>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 px-6 py-6 sm:px-8 lg:grid-cols-3">
          <MetaCard
            icon={<CalendarClock size={18} />}
            label="Published"
            value={formatDateTime(material.createdAt)}
          />
          <MetaCard
            icon={<Layers3 size={18} />}
            label="Audience"
            value={material.sectionName || 'All sections'}
          />
          <MetaCard
            icon={<Link2 size={18} />}
            label="Attachments"
            value={String((material.links ?? []).length)}
          />
        </div>

        {Array.isArray(course?.teachers) && course.teachers.length ? (
          <div className="border-t border-slate-200 px-6 py-5 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Shared By
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {course.teachers.map((teacher: any) => (
                <div
                  key={teacher.id ?? teacher.teacherId ?? teacher.fullName}
                  className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2"
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
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(360px,0.92fr)]">
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
            <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] p-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.28)]">
              {isImageLink(previewLink.url) ? (
                <img
                  src={previewLink.url}
                  alt={previewLink.label || material.title}
                  className="max-h-[70vh] w-full rounded-[20px] object-contain bg-white"
                />
              ) : (
                <iframe
                  src={previewLink.url}
                  title={previewLink.label || material.title}
                  className="h-[70vh] w-full rounded-[20px] bg-white"
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
                  className="flex items-start justify-between gap-3 rounded-[22px] border border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)] px-4 py-3 transition hover:border-slate-300 hover:bg-white"
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
                  <Link
                    key={sheet.id}
                    to={getMaterialHref(role, courseId, sheet.id)}
                    className={`block rounded-[22px] border px-4 py-3 transition ${
                      sheet.id === sheetId
                        ? 'border-sky-200 bg-sky-50'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{sheet.title}</p>
                      <ArrowRight size={15} className="shrink-0 text-slate-400" />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(sheet.createdAt)}</p>
                  </Link>
                ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function MetaCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 ring-1 ring-slate-200">
        {icon}
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
