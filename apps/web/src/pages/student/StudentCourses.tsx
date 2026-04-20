import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, FolderArchive, Layers3 } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { CourseMaterialDetail } from '../../components/CourseMaterialDetail';
import { CourseAnnouncementDetail } from '../../components/CourseAnnouncementDetail';
import { api } from '../../lib/api';
import { courseCode } from '../../lib/display';
import { useAuthStore } from '../../store/auth.store';
import {
  TeacherCourseCard,
  splitTeacherCourses,
} from '../teacher/teacher.shared';
import { StudentCourseDetail } from './StudentCourseDetail';
import { StudentLabClassWorkspace } from './StudentLabClassWorkspace';
import {
  getStudentIdentityValue,
  getStudentScheduleForCourse,
  getStudentSectionNameForCourse,
} from './student.shared';

type NextCourseSlot = {
  course: any;
  sectionName: string;
  startAt: Date;
  endAt: Date;
};

const weekdayIndex: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hoursText = '0', minutesText = '0'] = String(value).split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function getNextWeeklyWindow(
  dayOfWeek: string | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  now: Date,
): { startAt: Date; endAt: Date } | null {
  const targetDay = weekdayIndex[String(dayOfWeek ?? '').trim().toLowerCase()];
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (targetDay === undefined || startMinutes === null || endMinutes === null) {
    return null;
  }

  const startAt = new Date(now);
  startAt.setHours(0, 0, 0, 0);
  const deltaDays = (targetDay - now.getDay() + 7) % 7;
  startAt.setDate(startAt.getDate() + deltaDays);
  startAt.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

  const endAt = new Date(startAt);
  endAt.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
  if (endAt.getTime() <= startAt.getTime()) {
    endAt.setDate(endAt.getDate() + 1);
  }

  if (deltaDays === 0 && endAt.getTime() < now.getTime()) {
    startAt.setDate(startAt.getDate() + 7);
    endAt.setDate(endAt.getDate() + 7);
  }

  return { startAt, endAt };
}

function findNextStudentSlot(
  courses: any[],
  studentIdentityValue: string,
): NextCourseSlot | null {
  const now = new Date();

  const candidates = (courses ?? [])
    .flatMap((course: any) => {
      const schedule = getStudentScheduleForCourse(course, studentIdentityValue);
      if (!schedule) {
        return [];
      }

      const window = getNextWeeklyWindow(
        schedule?.dayOfWeek,
        schedule?.startTime,
        schedule?.endTime,
        now,
      );
      if (!window) {
        return [];
      }

      return [
        {
          course,
          sectionName: getStudentSectionNameForCourse(course, studentIdentityValue),
          startAt: window.startAt,
          endAt: window.endAt,
        } satisfies NextCourseSlot,
      ];
    })
    .sort((left, right) => left.startAt.getTime() - right.startAt.getTime());

  return candidates[0] ?? null;
}

function formatClock(value: Date): string {
  return new Intl.DateTimeFormat([], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function formatDayLabel(value: Date): string {
  return new Intl.DateTimeFormat([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(value);
}

export function StudentCourses() {
  const { courseId, labClassId, sheetId, announcementId } = useParams<{
    courseId: string;
    labClassId: string;
    sheetId: string;
    announcementId: string;
  }>();

  return (
    <AppShell>
      {sheetId ? (
        <CourseMaterialDetail role="student" />
      ) : announcementId ? (
        <CourseAnnouncementDetail role="student" />
      ) : labClassId ? (
        <StudentLabClassWorkspace />
      ) : courseId ? (
        <StudentCourseDetail />
      ) : (
        <StudentCoursesOverview />
      )}
    </AppShell>
  );
}

function StudentCoursesOverview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const studentIdentityValue = getStudentIdentityValue(
    user,
    (user?.profile as Record<string, unknown> | undefined) ?? undefined,
  );
  const view = searchParams.get('view') === 'old' ? 'old' : 'current';

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['student-courses-overview'],
    queryFn: () => api.get('/courses/my').then((response) => response.data),
  });

  const { current, old } = useMemo(
    () => splitTeacherCourses(courses as any[]),
    [courses],
  );
  const visibleCourses = view === 'old' ? old : current;
  const nextCourseSlot = useMemo(
    () => findNextStudentSlot(current, studentIdentityValue),
    [current, studentIdentityValue],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              Course Directory
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Courses</h1>
          </div>

          <div className="flex flex-wrap gap-2 rounded-full border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                view === 'current'
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Current
            </button>
            <button
              type="button"
              onClick={() => setSearchParams({ view: 'old' }, { replace: true })}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                view === 'old'
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Old
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OverviewCard
            icon={<Layers3 size={18} />}
            label="Current courses"
            value={String(current.length)}
          />
          <OverviewCard
            icon={<FolderArchive size={18} />}
            label="Old courses"
            value={String(old.length)}
          />
          <OverviewCard
            icon={<CalendarClock size={18} />}
            label="Next class"
            value={
              nextCourseSlot
                ? `${formatClock(nextCourseSlot.startAt)} - ${formatClock(nextCourseSlot.endAt)}`
                : 'No upcoming slot'
            }
            hint={
              nextCourseSlot
                ? `${courseCode(nextCourseSlot.course)} · ${nextCourseSlot.sectionName} · ${formatDayLabel(nextCourseSlot.startAt)}`
                : 'Your next scheduled class will appear here'
            }
          />
        </div>
      </section>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-52 animate-pulse rounded-[26px] border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : visibleCourses.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleCourses.map((course: any) => (
            <TeacherCourseCard
              key={course.id}
              course={course}
              href={`/student/courses/${course.id}`}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[26px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          {view === 'old' ? 'No old courses' : 'No current courses'}
        </div>
      )}
    </div>
  );
}

function OverviewCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
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
      {hint ? <p className="mt-2 text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}
