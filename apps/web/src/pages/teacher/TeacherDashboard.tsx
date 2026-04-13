import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  Clock3,
  FolderArchive,
  Layers3,
  PencilLine,
  TriangleAlert,
} from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Modal } from '../../components/Modal';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import {
  TeacherCourseCard,
  addDays,
  findScheduleOverlaps,
  formatShortDate,
  formatTimeRange,
  formatWeekRange,
  getWeekDates,
  splitTeacherCourses,
  startOfDay,
  startOfWeek,
} from './teacher.shared';

type PlannerScheduleTarget = {
  course: any;
  schedule: any;
  labClass: any | null;
  labClassSection: any | null;
  date: Date;
  isOverride: boolean;
};

function weekdayLabel(date: Date): string {
  return new Intl.DateTimeFormat([], { weekday: 'long' }).format(date);
}

function plannerItemKey(item: any): string {
  return `${item.course?.id}-${item.schedule?.id}`;
}

function normalizeTimeValue(value: string | null | undefined): string {
  if (!value) return '';
  const [hours = '00', minutes = '00'] = String(value).split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeToMinutes(value: string | null | undefined): number {
  const normalized = normalizeTimeValue(value);
  if (!normalized) return -1;
  const [hours = '0', minutes = '0'] = normalized.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function intervalsOverlap(
  startA: string | null | undefined,
  endA: string | null | undefined,
  startB: string | null | undefined,
  endB: string | null | undefined,
) {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);

  if (aStart < 0 || aEnd < 0 || bStart < 0 || bEnd < 0) {
    return false;
  }

  return aStart < bEnd && bStart < aEnd;
}

function buildPlannerItems(
  courses: any[],
  labClassesByCourse: Record<string, any[]>,
  weekStart: Date,
) {
  const weekDates = getWeekDates(weekStart);
  const weekEnd = addDays(weekStart, 6);

  return (courses ?? [])
    .flatMap((course) =>
      (Array.isArray(course?.schedules) ? course.schedules : []).flatMap((schedule: any) => {
        const sectionName = schedule?.sectionName ?? 'All Students';
        const pendingMatch =
          (labClassesByCourse[course.id] ?? [])
            .flatMap((labClass: any) =>
              (labClass?.sections ?? [])
                .filter(
                  (section: any) =>
                    section?.sectionName === sectionName &&
                    section?.status !== 'conducted',
                )
                .map((section: any) => ({ labClass, section })),
            )
            .sort((left: any, right: any) => {
              const leftNumber = Number(left?.labClass?.labNumber ?? 0);
              const rightNumber = Number(right?.labClass?.labNumber ?? 0);
              if (leftNumber !== rightNumber) {
                return leftNumber - rightNumber;
              }

              return String(left?.labClass?.createdAt ?? '').localeCompare(
                String(right?.labClass?.createdAt ?? ''),
              );
            })[0] ?? null;

        if (
          pendingMatch?.section?.scheduledDate &&
          pendingMatch?.section?.scheduledStartTime &&
          pendingMatch?.section?.scheduledEndTime
        ) {
          const actualDate = startOfDay(new Date(pendingMatch.section.scheduledDate));
          if (actualDate >= weekStart && actualDate <= weekEnd) {
            const actualWeekday = weekdayLabel(actualDate);
            const isOverride =
              actualWeekday !== schedule?.dayOfWeek ||
              pendingMatch.section.scheduledStartTime !== schedule?.startTime ||
              pendingMatch.section.scheduledEndTime !== schedule?.endTime ||
              (pendingMatch.section.roomNumber ?? null) !== (schedule?.roomNumber ?? null);

            return [
              {
                course,
                date: actualDate,
                labClass: pendingMatch.labClass,
                labClassSection: pendingMatch.section,
                isOverride,
                schedule: {
                  ...schedule,
                  startTime: pendingMatch.section.scheduledStartTime,
                  endTime: pendingMatch.section.scheduledEndTime,
                  roomNumber:
                    pendingMatch.section.roomNumber ?? schedule?.roomNumber ?? null,
                },
              },
            ];
          }
        }

        const baseDate = weekDates.find((date) => weekdayLabel(date) === schedule?.dayOfWeek);
        if (!baseDate) {
          return [];
        }

        return [
          {
            course,
            date: baseDate,
            labClass: pendingMatch?.labClass ?? null,
            labClassSection: pendingMatch?.section ?? null,
            isOverride: false,
            schedule,
          },
        ];
      }),
    )
    .sort((left, right) => {
      const byDate = left.date.getTime() - right.date.getTime();
      if (byDate !== 0) return byDate;

      return String(left.schedule?.startTime ?? '').localeCompare(
        String(right.schedule?.startTime ?? ''),
      );
    });
}

export function TeacherDashboard() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    startOfWeek(new Date()),
  );
  const [scheduleTarget, setScheduleTarget] = useState<PlannerScheduleTarget | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState({
    scheduledDate: '',
    startTime: '',
    endTime: '',
    roomNumber: '',
  });

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => api.get('/courses/my').then((response) => response.data),
  });

  const { current: currentCourses, old: oldCourses } = useMemo(
    () => splitTeacherCourses(courses as any[]),
    [courses],
  );
  const currentLabCourses = useMemo(
    () => currentCourses.filter((course: any) => course?.type === 'lab'),
    [currentCourses],
  );
  const currentLabCourseIds = useMemo(
    () => currentLabCourses.map((course: any) => String(course.id)).sort(),
    [currentLabCourses],
  );
  const { data: labClassesByCourse = {} } = useQuery({
    queryKey: ['teacher-dashboard-lab-classes', currentLabCourseIds],
    enabled: currentLabCourseIds.length > 0,
    queryFn: async () => {
      const responses = await Promise.all(
        currentLabCourseIds.map(async (courseId) => {
          const response = await api.get(`/courses/${courseId}/lab-classes`);
          return [courseId, response.data] as const;
        }),
      );

      return Object.fromEntries(responses);
    },
  });

  const weekDates = useMemo(() => getWeekDates(selectedWeekStart), [selectedWeekStart]);
  const plannerItems = useMemo(
    () =>
      buildPlannerItems(
        currentCourses,
        labClassesByCourse as Record<string, any[]>,
        selectedWeekStart,
      ),
    [currentCourses, labClassesByCourse, selectedWeekStart],
  );
  const overlapWarnings = useMemo(
    () => findScheduleOverlaps(plannerItems),
    [plannerItems],
  );

  const totalScheduleSlots = currentCourses.reduce(
    (count: number, course: any) =>
      count + (Array.isArray(course?.schedules) ? course.schedules.length : 0),
    0,
  );

  const heroName =
    (user?.profile as { fullName?: string } | undefined)?.fullName ??
    user?.username ??
    'Teacher';
  const todayStart = startOfDay(new Date());
  const [selectedDayKey, setSelectedDayKey] = useState(() =>
    weekDates.find((date) => date.getTime() === todayStart.getTime())?.toISOString() ??
    weekDates[0]?.toISOString() ??
    '',
  );

  useEffect(() => {
    if (!weekDates.length) {
      setSelectedDayKey('');
      return;
    }

    const stillVisible = weekDates.some((date) => date.toISOString() === selectedDayKey);
    if (stillVisible) return;

    const todayInWeek = weekDates.find((date) => date.getTime() === todayStart.getTime());
    setSelectedDayKey((todayInWeek ?? weekDates[0]).toISOString());
  }, [selectedDayKey, todayStart, weekDates]);

  const selectedDate =
    weekDates.find((date) => date.toISOString() === selectedDayKey) ?? weekDates[0] ?? null;
  const selectedDayItems = useMemo(
    () =>
      selectedDate
        ? plannerItems.filter(
            (item: any) => new Date(item.date).getTime() === selectedDate.getTime(),
          )
        : [],
    [plannerItems, selectedDate],
  );
  const selectedDayWarning = useMemo(
    () =>
      selectedDate
        ? overlapWarnings.find(
            (warning) => startOfDay(warning.date).getTime() === selectedDate.getTime(),
          ) ?? null
        : null,
    [overlapWarnings, selectedDate],
  );
  const selectedOverlapKeySet = useMemo(
    () => new Set((selectedDayWarning?.items ?? []).map((item: any) => plannerItemKey(item))),
    [selectedDayWarning],
  );

  const detectDraftOverlap = (target: PlannerScheduleTarget | null) => {
    if (!target) return [];

    const draftDate = scheduleDraft.scheduledDate;
    return plannerItems.filter((item: any) => {
      if (item === target) return false;
      if (plannerItemKey(item) === plannerItemKey(target)) return false;
      if (formatDateForInput(new Date(item.date)) !== draftDate) return false;

      return intervalsOverlap(
        scheduleDraft.startTime,
        scheduleDraft.endTime,
        item.schedule?.startTime,
        item.schedule?.endTime,
      );
    });
  };

  const updateScheduleMutation = useMutation({
    mutationFn: () => {
      if (!scheduleTarget?.labClass || !scheduleTarget?.labClassSection) {
        throw new Error('Start a lab class first to change its schedule');
      }

      return api.patch(
        `/courses/${scheduleTarget.course.id}/lab-classes/${scheduleTarget.labClass.id}/sections/${scheduleTarget.labClassSection.id}/schedule`,
        {
          scheduledDate: scheduleDraft.scheduledDate,
          startTime: normalizeTimeValue(scheduleDraft.startTime),
          endTime: normalizeTimeValue(scheduleDraft.endTime),
          roomNumber: scheduleDraft.roomNumber.trim() || undefined,
        },
      );
    },
    onSuccess: () => {
      const overlappedItems = detectDraftOverlap(scheduleTarget);
      toast.success('Lab schedule changed for this week');
      if (overlappedItems.length && scheduleTarget) {
        const firstOverlap = overlappedItems[0];
        const moreCount = overlappedItems.length - 1;
        toast.error(
          `${scheduleTarget.course?.courseCode} ${scheduleTarget.schedule?.sectionName ?? ''} now overlaps with ${firstOverlap.course?.courseCode} ${firstOverlap.schedule?.sectionName ?? ''}${moreCount > 0 ? ` and ${moreCount} more` : ''}.`,
          { duration: 5000 },
        );
      }
      setScheduleTarget(null);
      queryClient.invalidateQueries({
        queryKey: ['teacher-dashboard-lab-classes', currentLabCourseIds],
      });
      queryClient.invalidateQueries({
        queryKey: ['teacher-course-lab-classes', scheduleTarget?.course?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['teacher-lab-class', scheduleTarget?.course?.id, scheduleTarget?.labClass?.id],
      });
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? error.message ?? 'Failed to change schedule'),
  });

  const openScheduleModal = (item: PlannerScheduleTarget) => {
    setScheduleTarget(item);
    setScheduleDraft({
      scheduledDate: formatDateForInput(item.date),
      startTime: normalizeTimeValue(item.schedule?.startTime),
      endTime: normalizeTimeValue(item.schedule?.endTime),
      roomNumber: item.schedule?.roomNumber ?? '',
    });
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.35)] sm:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                Teacher Workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">
                {heroName}
              </h1>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <CompactStat
              icon={<BookOpen size={18} />}
              label="Current courses"
              value={String(currentCourses.length)}
            />
            <CompactStat
              icon={<FolderArchive size={18} />}
              label="Old courses"
              value={String(oldCourses.length)}
            />
            <CompactStat
              icon={<Layers3 size={18} />}
              label="Weekly slots"
              value={String(totalScheduleSlots)}
            />
          </div>
        </section>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(440px,1fr)]">
          <section className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                  Current Courses
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">Recent courses</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/teacher/courses"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Browse all
                </Link>
                <Link
                  to="/teacher/courses?view=old"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <FolderArchive size={15} />
                  Old courses
                </Link>
              </div>
            </div>

            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="h-52 animate-pulse rounded-[26px] border border-slate-200 bg-white"
                  />
                ))}
              </div>
            ) : currentCourses.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {currentCourses.slice(0, 4).map((course: any) => (
                  <TeacherCourseCard
                    key={course.id}
                    course={course}
                    href={`/teacher/courses/${course.id}`}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[26px] border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
                No current courses
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_70px_-45px_rgba(15,23,42,0.35)]">
            <div className="bg-[radial-gradient(circle_at_top_left,#0f172a,transparent_42%),linear-gradient(135deg,#082f49_0%,#1e3a8a_58%,#38bdf8_100%)] px-5 py-5 text-white">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100/85">
                    Teaching Schedule
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">Weekly Teaching Schedule</h2>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 p-1">
                  <button
                    type="button"
                    onClick={() => setSelectedWeekStart((current) => addDays(current, -7))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10"
                    aria-label="Previous week"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <div className="px-2 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-100/85">
                      Week
                    </p>
                    <p className="text-sm font-semibold text-white">
                      {formatWeekRange(selectedWeekStart)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedWeekStart((current) => addDays(current, 7))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10"
                    aria-label="Next week"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] p-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.3)]">
                <div className="overflow-x-auto">
                  <div className="grid min-w-[880px] grid-cols-7 gap-2">
                    {weekDates.map((date) => {
                      const dayItems = plannerItems.filter(
                        (item: any) => new Date(item.date).getTime() === date.getTime(),
                      );
                      const dayWarning = overlapWarnings.find(
                        (warning) => startOfDay(warning.date).getTime() === date.getTime(),
                      );
                      const active = selectedDate?.getTime() === date.getTime();

                      return (
                        <button
                          key={date.toISOString()}
                          type="button"
                          onClick={() => setSelectedDayKey(date.toISOString())}
                          className={`group rounded-[22px] border px-4 py-4 text-left transition ${
                            active
                              ? 'border-slate-900 bg-slate-900 text-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.45)]'
                              : 'border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p
                                className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
                                  active ? 'text-sky-200' : 'text-sky-700'
                                }`}
                              >
                                {weekdayLabel(date).slice(0, 3)}
                              </p>
                              <p
                                className={`mt-2 text-lg font-semibold ${
                                  active ? 'text-white' : 'text-slate-900'
                                }`}
                              >
                                {date.getDate()}
                              </p>
                              <p
                                className={`mt-1 text-xs ${
                                  active ? 'text-white/70' : 'text-slate-500'
                                }`}
                              >
                                {formatShortDate(date)}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                active
                                  ? 'bg-white/12 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {dayItems.length}
                            </span>
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-2">
                            {dayWarning ? (
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  active
                                    ? 'bg-rose-400/15 text-rose-100'
                                    : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                                }`}
                              >
                                <TriangleAlert size={11} />
                                Warning
                              </span>
                            ) : (
                              <span
                                className={`text-[11px] font-medium ${
                                  active ? 'text-white/55' : 'text-slate-400'
                                }`}
                              >
                                {dayItems.length ? 'View schedule' : 'No class'}
                              </span>
                            )}

                            <span
                              className={`h-2.5 w-2.5 rounded-full transition ${
                                dayItems.length
                                  ? active
                                    ? 'bg-emerald-300'
                                    : 'bg-sky-500'
                                  : active
                                    ? 'bg-white/35'
                                    : 'bg-slate-200'
                              }`}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.28)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                        Selected Day
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold text-slate-900">
                        {selectedDate ? weekdayLabel(selectedDate) : 'Schedule'}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedDate ? formatShortDate(selectedDate) : 'No date selected'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                        {selectedDayItems.length} class{selectedDayItems.length === 1 ? '' : 'es'}
                      </span>
                      {selectedDayWarning ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                          <TriangleAlert size={12} />
                          Warning
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {selectedDayItems.length ? (
                    <div className="mt-5 space-y-3">
                      {selectedDayItems.map((item: any) => {
                        const overlapped = selectedOverlapKeySet.has(plannerItemKey(item));
                        const itemStartTime = timeToMinutes(item.schedule?.startTime);
                        const currentMinutes =
                          todayStart.getTime() === startOfDay(item.date).getTime()
                            ? new Date().getHours() * 60 + new Date().getMinutes()
                            : -1;
                        const canChangeSchedule =
                          item.course?.type === 'lab' &&
                          (
                            startOfDay(item.date).getTime() > todayStart.getTime() ||
                            (
                              startOfDay(item.date).getTime() === todayStart.getTime() &&
                              itemStartTime > currentMinutes
                            )
                          );

                        return (
                          <div
                            key={`${plannerItemKey(item)}-${item.date.toISOString()}`}
                            className={`rounded-[24px] border p-4 transition ${
                              overlapped
                                ? 'border-rose-200 bg-[linear-gradient(135deg,#fff1f2_0%,#ffffff_100%)]'
                                : 'border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)]'
                            }`}
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                                      overlapped
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-sky-50 text-sky-700'
                                    }`}
                                  >
                                    {item.course?.courseCode}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                    {item.schedule?.sectionName ?? 'All Students'}
                                  </span>
                                  {item.isOverride ? (
                                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                                      Changed for this lab class
                                    </span>
                                  ) : null}
                                  {overlapped ? (
                                    <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                                      Overlapped
                                    </span>
                                  ) : null}
                                </div>

                                <h4 className="mt-3 text-base font-semibold text-slate-900">
                                  {item.course?.title}
                                </h4>

                                <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                                  <span className="inline-flex items-center gap-2">
                                    <Clock3 size={14} className="text-slate-400" />
                                    {formatTimeRange(
                                      item.schedule?.startTime,
                                      item.schedule?.endTime,
                                    )}
                                  </span>
                                  {item.schedule?.roomNumber ? (
                                    <span className="inline-flex items-center gap-2">
                                      <CalendarClock size={14} className="text-slate-400" />
                                      Room {item.schedule.roomNumber}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2 lg:justify-end">
                                <Link
                                  to={`/teacher/courses/${item.course?.id}`}
                                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                                >
                                  Open course
                                </Link>
                                {canChangeSchedule ? (
                                  <button
                                    type="button"
                                    onClick={() => openScheduleModal(item)}
                                    className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                                  >
                                    <PencilLine size={14} />
                                    Change schedule
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
                      <p className="text-sm font-medium text-slate-700">
                        No schedule for this day
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Select another day from the weekly strip above.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={Boolean(scheduleTarget)}
        onClose={() => setScheduleTarget(null)}
        title="Change Lab Schedule"
        maxWidthClass="max-w-xl"
      >
        {scheduleTarget ? (
          scheduleTarget.labClass && scheduleTarget.labClassSection ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                updateScheduleMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">
                  {scheduleTarget.course?.courseCode} · {scheduleTarget.labClassSection?.sectionName}
                </p>
                <p className="mt-1">
                  Lab {scheduleTarget.labClass?.labNumber} · {scheduleTarget.labClass?.title}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  This change applies only to this lab class, not the admin schedule.
                </p>
              </div>

              <Field label="Date">
                <input
                  type="date"
                  value={scheduleDraft.scheduledDate}
                  onChange={(event) =>
                    setScheduleDraft((current) => ({
                      ...current,
                      scheduledDate: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Start Time">
                  <input
                    type="time"
                    value={scheduleDraft.startTime}
                    onChange={(event) =>
                      setScheduleDraft((current) => ({
                        ...current,
                        startTime: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </Field>

                <Field label="End Time">
                  <input
                    type="time"
                    value={scheduleDraft.endTime}
                    onChange={(event) =>
                      setScheduleDraft((current) => ({
                        ...current,
                        endTime: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field label="Room">
                <input
                  value={scheduleDraft.roomNumber}
                  onChange={(event) =>
                    setScheduleDraft((current) => ({
                      ...current,
                      roomNumber: event.target.value,
                    }))
                  }
                  className={inputClass}
                  placeholder="Optional"
                />
              </Field>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updateScheduleMutation.isPending}
                  className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updateScheduleMutation.isPending ? 'Saving...' : 'Save schedule'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-600">
                Start a lab class for this course first, then you can change that lab class schedule here.
              </div>
              <div className="flex justify-end">
                <Link
                  to={`/teacher/courses/${scheduleTarget.course?.id}?tab=lab-classes`}
                  className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Open lab classes
                </Link>
              </div>
            </div>
          )
        ) : null}
      </Modal>
    </AppShell>
  );
}

function CompactStat({
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
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white';
