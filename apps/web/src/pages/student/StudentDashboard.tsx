import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  Clock3,
  FolderArchive,
  Layers3,
} from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import {
  TeacherCourseCard,
  addDays,
  formatShortDate,
  formatTimeRange,
  formatWeekRange,
  getWeekDates,
  startOfDay,
  startOfWeek,
  splitTeacherCourses,
} from '../teacher/teacher.shared';
import {
  getStudentIdentityValue,
  getStudentScheduleForCourse,
  getStudentSectionNameForCourse,
} from './student.shared';

type StudentPlannerItem = {
  course: any;
  schedule: any;
  sectionName: string;
  date: Date;
  labClass: any | null;
  labClassSection: any | null;
  isOverride: boolean;
};

function weekdayLabel(date: Date): string {
  return new Intl.DateTimeFormat([], { weekday: 'long' }).format(date);
}

function buildStudentPlannerItems(
  courses: any[],
  labClassesByCourse: Record<string, any[]>,
  weekStart: Date,
  studentIdentityValue: string,
) {
  const weekDates = getWeekDates(weekStart);
  const weekEnd = addDays(weekStart, 6);

  return (courses ?? [])
    .flatMap((course) => {
      const sectionName = getStudentSectionNameForCourse(course, studentIdentityValue);
      const schedule = getStudentScheduleForCourse(course, studentIdentityValue);
      if (!schedule) {
        return [];
      }

      const pendingMatch =
        (labClassesByCourse[course.id] ?? [])
          .map((labClass: any) => ({
            labClass,
            section:
              (labClass?.sections ?? []).find(
                (section: any) => section?.sectionName === sectionName,
              ) ??
              (labClass?.sections ?? []).find(
                (section: any) => section?.sectionName === 'All Students',
              ) ??
              null,
          }))
          .filter(
            (item: any) => item.section && item.section.status !== 'conducted',
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
              sectionName,
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
            } satisfies StudentPlannerItem,
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
          sectionName,
          date: baseDate,
          labClass: pendingMatch?.labClass ?? null,
          labClassSection: pendingMatch?.section ?? null,
          isOverride: false,
          schedule,
        } satisfies StudentPlannerItem,
      ];
    })
    .sort((left, right) => {
      const byDate = left.date.getTime() - right.date.getTime();
      if (byDate !== 0) return byDate;

      return String(left.schedule?.startTime ?? '').localeCompare(
        String(right.schedule?.startTime ?? ''),
      );
    });
}

export function StudentDashboard() {
  const { user } = useAuthStore();
  const profile = (user?.profile as Record<string, unknown> | undefined) ?? undefined;
  const studentIdentityValue = getStudentIdentityValue(user, profile);
  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    startOfWeek(new Date()),
  );

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['student-courses-dashboard'],
    queryFn: () => api.get('/courses/my').then((response) => response.data),
  });

  const { current: currentCourses, old: oldCourses } = useMemo(
    () => splitTeacherCourses(courses as any[]),
    [courses],
  );
  const currentLabCourseIds = useMemo(
    () =>
      currentCourses
        .filter((course: any) => course?.type === 'lab')
        .map((course: any) => String(course.id))
        .sort(),
    [currentCourses],
  );

  const { data: labClassesByCourse = {} } = useQuery({
    queryKey: ['student-dashboard-lab-classes', currentLabCourseIds],
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
      buildStudentPlannerItems(
        currentCourses,
        labClassesByCourse as Record<string, any[]>,
        selectedWeekStart,
        studentIdentityValue,
      ),
    [currentCourses, labClassesByCourse, selectedWeekStart, studentIdentityValue],
  );
  const totalScheduleSlots = useMemo(
    () =>
      currentCourses.reduce((count: number, course: any) => {
        const schedule = getStudentScheduleForCourse(course, studentIdentityValue);
        return count + (schedule ? 1 : 0);
      }, 0),
    [currentCourses, studentIdentityValue],
  );

  const heroName =
    String(profile?.fullName ?? user?.username ?? 'Student');
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
            (item) => new Date(item.date).getTime() === selectedDate.getTime(),
          )
        : [],
    [plannerItems, selectedDate],
  );

  return (
    <AppShell>
      <div className="space-y-8">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.35)] sm:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                Student Workspace
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
                  to="/student/courses"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Browse all
                </Link>
                <Link
                  to="/student/courses?view=old"
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
                    href={`/student/courses/${course.id}`}
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
                    Class Schedule
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">Weekly Learning Schedule</h2>
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
                        (item) => new Date(item.date).getTime() === date.getTime(),
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
                            <span
                              className={`text-[11px] font-medium ${
                                active ? 'text-white/55' : 'text-slate-400'
                              }`}
                            >
                              {dayItems.length ? 'View schedule' : 'No class'}
                            </span>

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
                        {selectedDayItems.length} class
                        {selectedDayItems.length === 1 ? '' : 'es'}
                      </span>
                    </div>
                  </div>

                  {selectedDayItems.length ? (
                    <div className="mt-5 space-y-3">
                      {selectedDayItems.map((item) => {
                        const detailHref = item.labClass?.id
                          ? `/student/courses/${item.course?.id}/lab-classes/${item.labClass.id}`
                          : `/student/courses/${item.course?.id}`;

                        return (
                          <div
                            key={`${item.course?.id}-${item.schedule?.id}-${item.date.toISOString()}`}
                            className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)] p-4 transition"
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                                    {item.course?.courseCode}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                    {item.sectionName}
                                  </span>
                                  {item.isOverride ? (
                                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                                      Changed for this lab class
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
                                  to={`/student/courses/${item.course?.id}`}
                                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                                >
                                  Open course
                                </Link>
                                <Link
                                  to={detailHref}
                                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                                >
                                  {item.labClass?.id ? 'Open lab class' : 'View details'}
                                </Link>
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
