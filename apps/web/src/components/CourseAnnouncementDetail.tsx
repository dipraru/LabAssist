import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BellRing, CalendarDays, Megaphone } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

type Role = 'teacher' | 'student';

function formatAnnouncementDate(value: string | null | undefined) {
  if (!value) return 'Recently posted';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently posted';
  }

  return new Intl.DateTimeFormat([], {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function CourseAnnouncementDetail({ role }: { role: Role }) {
  const { courseId, announcementId } = useParams<{
    courseId: string;
    announcementId: string;
  }>();

  const { data: announcement, isLoading } = useQuery({
    queryKey: ['course-announcement-detail', role, announcementId],
    queryFn: () =>
      api.get(`/courses/posts/${announcementId}`).then((response) => response.data),
    enabled: Boolean(announcementId),
  });

  const backHref = `/${role}/courses/${courseId}?tab=announcements`;

  if (!courseId || !announcementId) return null;

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-24 animate-pulse rounded-[28px] border border-slate-200 bg-white" />
        <div className="h-80 animate-pulse rounded-[28px] border border-slate-200 bg-white" />
      </div>
    );
  }

  if (!announcement || announcement.type !== 'announcement') {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="text-lg font-semibold text-slate-900">Announcement not found</p>
        <Link
          to={backHref}
          className="mt-5 inline-flex rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Back to announcements
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
        <Link
          to={backHref}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back
        </Link>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
            {announcement.course?.courseCode ?? 'Course'}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            <CalendarDays size={12} />
            {formatAnnouncementDate(announcement.createdAt)}
          </span>
        </div>

        <div className="mt-6 flex items-start gap-4">
          <div className="rounded-[24px] bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] p-3 text-white shadow-[0_18px_34px_-24px_rgba(29,78,216,0.6)]">
            <Megaphone size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
              Announcement
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">
              {announcement.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Shared with{' '}
              {((announcement.targetSectionNames ?? []).length
                ? announcement.targetSectionNames
                : ['All Students']
              ).join(', ')}
              .
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
        <div className="rounded-[28px] border border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_100%)] p-6 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.3)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              <BellRing size={12} />
              Official update
            </span>
          </div>

          <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-700">
            {announcement.body}
          </div>
        </div>
      </section>
    </div>
  );
}
