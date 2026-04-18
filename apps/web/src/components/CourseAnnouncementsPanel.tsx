import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, CalendarDays, Megaphone, Plus, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { Modal } from './Modal';

type Role = 'teacher' | 'student';

function formatAnnouncementDate(value: string | null | undefined) {
  if (!value) return 'Recently posted';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently posted';
  }

  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getAnnouncementPreview(body: string | null | undefined) {
  const normalized = String(body ?? '').trim();
  if (normalized.length <= 220) {
    return normalized;
  }
  return `${normalized.slice(0, 217).trimEnd()}...`;
}

export function CourseAnnouncementsPanel({
  role,
  course,
  sectionNames,
}: {
  role: Role;
  course: any;
  sectionNames: string[];
}) {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const effectiveSections = useMemo(
    () =>
      Array.from(new Set((sectionNames.length ? sectionNames : ['All Students']).filter(Boolean))),
    [sectionNames],
  );
  const [selectedSections, setSelectedSections] = useState<string[]>(effectiveSections);

  useEffect(() => {
    if (showCreateModal) {
      setSelectedSections(effectiveSections);
    }
  }, [effectiveSections, showCreateModal]);

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['course-announcements', role, course?.id],
    queryFn: () =>
      api
        .get(`/courses/${course.id}/posts`, {
          params: { type: 'announcement' },
        })
        .then((response) => response.data),
    enabled: Boolean(course?.id),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(`/courses/${course.id}/posts`, {
        type: 'announcement',
        title: title.trim(),
        body: details.trim(),
        targetSectionNames: selectedSections,
      }),
    onSuccess: () => {
      toast.success('Announcement posted');
      queryClient.invalidateQueries({
        queryKey: ['course-announcements', role, course?.id],
      });
      setShowCreateModal(false);
      setTitle('');
      setDetails('');
      setSelectedSections(effectiveSections);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to post announcement'),
  });

  const handleCreateAnnouncement = () => {
    if (!title.trim()) {
      toast.error('Announcement title is required');
      return;
    }
    if (!details.trim()) {
      toast.error('Announcement details are required');
      return;
    }
    if (!selectedSections.length) {
      toast.error('Select at least one section');
      return;
    }
    createMutation.mutate();
  };

  return (
    <>
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-[24px] bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_100%)] p-3 text-white shadow-[0_18px_34px_-24px_rgba(29,78,216,0.6)]">
              <Megaphone size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                Course Updates
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                Announcements
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Important notices, reminders, and section-specific updates for {course?.courseCode}.
              </p>
            </div>
          </div>

          {role === 'teacher' ? (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <Plus size={16} />
              New announcement
            </button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="mt-6 grid gap-4">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-36 animate-pulse rounded-[26px] border border-slate-200 bg-slate-50"
              />
            ))}
          </div>
        ) : (announcements as any[]).length ? (
          <div className="mt-6 grid gap-4">
            {(announcements as any[]).map((announcement: any, index: number) => {
              const href = `/${role}/courses/${course.id}/announcements/${announcement.id}`;
              const gradientSurface =
                index % 3 === 0
                  ? 'border-sky-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_100%)]'
                  : index % 3 === 1
                    ? 'border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_100%)]'
                    : 'border-amber-200 bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_100%)]';

              return (
                <Link
                  key={announcement.id}
                  to={href}
                  className={`group rounded-[28px] border p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-40px_rgba(15,23,42,0.42)] ${gradientSurface}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          {course?.courseCode}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                          <CalendarDays size={12} />
                          {formatAnnouncementDate(announcement.createdAt)}
                        </span>
                      </div>

                      <h3 className="mt-4 text-xl font-semibold text-slate-900">
                        {announcement.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {getAnnouncementPreview(announcement.body)}
                      </p>
                    </div>

                    <div className="flex min-w-[210px] flex-col gap-3 lg:items-end">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                        <BellRing size={12} />
                        {(announcement.targetSectionNames ?? []).length || 1} section
                        {(announcement.targetSectionNames ?? []).length === 1 ? '' : 's'}
                      </span>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {((announcement.targetSectionNames ?? []).length
                          ? announcement.targetSectionNames
                          : ['All Students']
                        ).map((sectionName: string) => (
                          <span
                            key={`${announcement.id}-${sectionName}`}
                            className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200"
                          >
                            {sectionName}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-white/80 pt-4">
                    <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                      <Sparkles size={12} className="text-sky-600" />
                      {role === 'teacher'
                        ? 'Open to review the full announcement.'
                        : 'Open to read the complete announcement.'}
                    </div>
                    <span className="text-sm font-semibold text-slate-900">
                      Read announcement
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-[26px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-700">No announcements yet</p>
            <p className="mt-2 text-xs text-slate-500">
              {role === 'teacher'
                ? 'Publish the first announcement to keep your sections informed.'
                : 'New course updates will appear here as soon as your teachers publish them.'}
            </p>
          </div>
        )}
      </section>

      {role === 'teacher' ? (
        <Modal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="New Announcement"
          maxWidthClass="max-w-3xl"
        >
          <div className="space-y-5">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">{course?.courseCode}</p>
              <p className="mt-1">
                Choose which sections should receive this announcement. All sections are selected by default.
              </p>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Title
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={inputClass}
                placeholder="Enter an announcement title"
              />
            </label>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Sections
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSections(effectiveSections)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSections([])}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {effectiveSections.map((sectionName) => {
                  const checked = selectedSections.includes(sectionName);
                  return (
                    <label
                      key={sectionName}
                      className={`flex cursor-pointer items-center gap-3 rounded-[22px] border px-4 py-3 text-sm transition ${
                        checked
                          ? 'border-sky-200 bg-sky-50 text-sky-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelectedSections((current) =>
                            event.target.checked
                              ? [...current, sectionName]
                              : current.filter((item) => item !== sectionName),
                          );
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span className="font-medium">{sectionName}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Details
              </span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={7}
                className={`${inputClass} min-h-40 resize-none`}
                placeholder="Write the full announcement details"
              />
            </label>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateAnnouncement}
                disabled={createMutation.isPending}
                className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createMutation.isPending ? 'Posting...' : 'Post announcement'}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white';
