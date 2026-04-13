import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Layers3,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  courseCode,
  courseTitle,
  semesterLabel,
  studentDisplayName,
} from '../../lib/display';

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return startOfDay(next);
}

export function startOfWeek(date: Date): Date {
  const current = startOfDay(date);
  return addDays(current, -current.getDay());
}

export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatDateOnly(value: string | Date | null | undefined): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatTimeLabel(value: string | null | undefined): string {
  if (!value) return 'TBD';
  const [hoursText = '0', minutesText = '00'] = String(value).split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const date = new Date();
  date.setHours(
    Number.isFinite(hours) ? hours : 0,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0,
  );
  return new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatTimeLabel(startTime)} - ${formatTimeLabel(endTime)}`;
}

export function nextOccurrence(dayName: string, fromDate: Date): Date {
  const days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const targetDay = days.findIndex((day) => day === dayName);
  if (targetDay < 0) return startOfDay(fromDate);
  const base = startOfDay(fromDate);
  const offset = (targetDay - base.getDay() + 7) % 7;
  return addDays(base, offset);
}

export function compareSectionNames(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const formatter = new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
  });

  if (sameMonth) {
    return `${new Intl.DateTimeFormat([], { month: 'short' }).format(weekStart)} ${weekStart.getDate()}-${weekEnd.getDate()}`;
  }

  return `${formatter.format(weekStart)} - ${formatter.format(weekEnd)}`;
}

export function isCourseArchived(course: any): boolean {
  if (course?.semester?.isCurrent) {
    return false;
  }

  if (!course?.semester?.endDate) {
    return false;
  }

  const endDate = new Date(course.semester.endDate);
  const endDay = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
  );

  return endDay < startOfDay(new Date());
}

export function splitTeacherCourses(courses: any[]) {
  const current: any[] = [];
  const old: any[] = [];

  (courses ?? []).forEach((course) => {
    if (isCourseArchived(course)) {
      old.push(course);
      return;
    }
    current.push(course);
  });

  const sortByRecency = (left: any, right: any) =>
    String(right?.semester?.endDate ?? right?.updatedAt ?? '').localeCompare(
      String(left?.semester?.endDate ?? left?.updatedAt ?? ''),
    );

  return {
    current: [...current].sort(sortByRecency),
    old: [...old].sort(sortByRecency),
  };
}

export function getCourseTeachers(course: any): any[] {
  return Array.isArray(course?.teachers) ? course.teachers : [];
}

export function getCourseSectionNames(course: any): string[] {
  const fromSchedule = Array.isArray(course?.schedules)
    ? course.schedules
        .map((schedule: any) => schedule?.sectionName || 'All Students')
        .filter(Boolean)
    : [];

  const fromBatchSections = Array.isArray(course?.batchSections)
    ? course.batchSections
        .map((section: any) => section?.name)
        .filter(Boolean)
    : [];

  const values = [...fromSchedule, ...fromBatchSections];
  return Array.from(new Set(values.length ? values : ['All Students'])).sort(
    compareSectionNames,
  );
}

function studentIdFallsInsideRange(
  studentId: string,
  fromStudentId: string,
  toStudentId: string,
) {
  const current = Number(studentId);
  const from = Number(fromStudentId);
  const to = Number(toStudentId);

  if (
    !Number.isFinite(current) ||
    !Number.isFinite(from) ||
    !Number.isFinite(to)
  ) {
    return false;
  }

  return current >= Math.min(from, to) && current <= Math.max(from, to);
}

export function resolveStudentSection(course: any, studentLike: any): string {
  const student = studentLike?.student ?? studentLike;
  const batchSections = Array.isArray(course?.batchSections) ? course.batchSections : [];
  const studentId = String(student?.studentId ?? '');

  if (!batchSections.length || !studentId) {
    return 'All Students';
  }

  const matched = batchSections.find((section: any) =>
    studentIdFallsInsideRange(
      studentId,
      String(section?.fromStudentId ?? ''),
      String(section?.toStudentId ?? ''),
    ),
  );

  return matched?.name ?? 'All Students';
}

export function getCourseStudents(course: any): any[] {
  return (Array.isArray(course?.enrollments) ? course.enrollments : [])
    .filter((enrollment: any) => enrollment?.isActive !== false)
    .map((enrollment: any) => enrollment?.student)
    .filter(Boolean)
    .sort((left: any, right: any) =>
      String(left?.studentId ?? '').localeCompare(String(right?.studentId ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    );
}

export function getStudentsForSection(course: any, sectionName: string): any[] {
  const allStudents = getCourseStudents(course);
  if (sectionName === 'All Students') {
    return allStudents;
  }

  return allStudents.filter(
    (student) => resolveStudentSection(course, student) === sectionName,
  );
}

function combineDateTime(dateValue: string | Date | null | undefined, timeValue: string | null | undefined) {
  if (!dateValue || !timeValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  const [hoursText = '0', minutesText = '0'] = String(timeValue).split(':');
  date.setHours(Number(hoursText), Number(minutesText), 0, 0);
  return date;
}

function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hoursText = '0', minutesText = '0'] = String(value).split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function weekdayName(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
}

export function getCourseScheduleForSection(course: any, sectionName: string) {
  const normalized = sectionName || 'All Students';

  return (Array.isArray(course?.schedules) ? course.schedules : []).find(
    (schedule: any) => (schedule?.sectionName || 'All Students') === normalized,
  ) ?? null;
}

export function getEffectiveLabSectionSchedule(course: any, section: any) {
  const baseSchedule = getCourseScheduleForSection(course, section?.sectionName);
  const overrideDate = section?.scheduledDate ? new Date(section.scheduledDate) : null;
  const overrideWeekday =
    overrideDate && !Number.isNaN(overrideDate.getTime()) ? weekdayName(overrideDate) : null;
  const hasOverride =
    Boolean(section?.scheduledDate && section?.scheduledStartTime && section?.scheduledEndTime) &&
    (
      !baseSchedule ||
      overrideWeekday !== baseSchedule.dayOfWeek ||
      section?.scheduledStartTime !== baseSchedule.startTime ||
      section?.scheduledEndTime !== baseSchedule.endTime ||
      (section?.roomNumber ?? null) !== (baseSchedule?.roomNumber ?? null)
    );

  if (hasOverride) {
    return {
      kind: 'override' as const,
      date: overrideDate,
      dayOfWeek: overrideWeekday,
      startTime: section?.scheduledStartTime ?? null,
      endTime: section?.scheduledEndTime ?? null,
      roomNumber: section?.roomNumber ?? null,
    };
  }

  if (baseSchedule) {
    return {
      kind: 'course' as const,
      date: null,
      dayOfWeek: baseSchedule.dayOfWeek,
      startTime: baseSchedule.startTime,
      endTime: baseSchedule.endTime,
      roomNumber: baseSchedule.roomNumber ?? null,
    };
  }

  if (section?.scheduledDate && section?.scheduledStartTime && section?.scheduledEndTime) {
    return {
      kind: 'override' as const,
      date: overrideDate,
      dayOfWeek: overrideWeekday,
      startTime: section?.scheduledStartTime ?? null,
      endTime: section?.scheduledEndTime ?? null,
      roomNumber: section?.roomNumber ?? null,
    };
  }

  return {
    kind: 'none' as const,
    date: null,
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    roomNumber: null,
  };
}

export function isLabSectionScheduledNow(
  section: any,
  course?: any,
  now = new Date(),
): boolean {
  const effective = getEffectiveLabSectionSchedule(course, section);

  if (effective.kind === 'override') {
    const start = combineDateTime(effective.date, effective.startTime);
    const end = combineDateTime(effective.date, effective.endTime);
    if (!start || !end) return false;
    return now >= start && now <= end;
  }

  if (effective.kind === 'course') {
    if (weekdayName(now) !== effective.dayOfWeek) {
      return false;
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = timeToMinutes(effective.startTime);
    const endMinutes = timeToMinutes(effective.endTime);
    if (startMinutes === null || endMinutes === null) {
      return false;
    }

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  return false;
}

export function isLabSectionScheduledInWeek(section: any, weekStart: Date): boolean {
  const sectionDate = section?.scheduledDate ? startOfDay(new Date(section.scheduledDate)) : null;
  if (!sectionDate) return false;
  const weekEnd = addDays(weekStart, 6);
  return sectionDate >= weekStart && sectionDate <= weekEnd;
}

export function sortLabSections(sections: any[]): any[] {
  return [...(sections ?? [])].sort((left, right) =>
    compareSectionNames(
      String(left?.sectionName ?? ''),
      String(right?.sectionName ?? ''),
    ),
  );
}

export function getDefaultLabSection(course: any, sections: any[]): any | null {
  const sortedSections = sortLabSections(sections);
  return (
    sortedSections.find((section) => isLabSectionScheduledNow(section, course)) ??
    sortedSections[0] ??
    null
  );
}

export function getScheduleItemsForDate(courses: any[], date: Date) {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
  return (courses ?? [])
    .flatMap((course) =>
      (Array.isArray(course?.schedules) ? course.schedules : [])
        .filter((schedule: any) => schedule?.dayOfWeek === weekday)
        .map((schedule: any) => ({
          course,
          schedule,
          date,
          archived: isCourseArchived(course),
        })),
    )
    .sort((left, right) =>
      String(left.schedule?.startTime ?? '').localeCompare(
        String(right.schedule?.startTime ?? ''),
      ),
    );
}

export function getWeeklyScheduleItems(courses: any[], weekStart: Date) {
  const dates = getWeekDates(weekStart);
  return dates.flatMap((date) =>
    getScheduleItemsForDate(courses, date).map((item: any) => ({
      ...item,
      date,
    })),
  );
}

export function findScheduleOverlaps(items: any[]) {
  const byDay = new Map<string, any[]>();
  items.forEach((item) => {
    const key = startOfDay(new Date(item.date)).toISOString();
    const current = byDay.get(key) ?? [];
    current.push(item);
    byDay.set(key, current);
  });

  const warnings: { date: Date; items: any[] }[] = [];

  byDay.forEach((dayItems, key) => {
    const sorted = [...dayItems].sort((left, right) =>
      String(left.schedule?.startTime ?? '').localeCompare(
        String(right.schedule?.startTime ?? ''),
      ),
    );
    const overlaps: any[] = [];

    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index];
      const currentEnd = String(current.schedule?.endTime ?? '');

      for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex += 1) {
        const next = sorted[nextIndex];
        const nextStart = String(next.schedule?.startTime ?? '');
        if (nextStart >= currentEnd) break;

        overlaps.push(current, next);
      }
    }

    if (overlaps.length) {
      const uniqueItems = Array.from(new Map(
        overlaps.map((item) => [`${item.course?.id}-${item.schedule?.id}`, item]),
      ).values());
      warnings.push({
        date: new Date(key),
        items: uniqueItems,
      });
    }
  });

  return warnings.sort((left, right) => left.date.getTime() - right.date.getTime());
}

export function getStudentRollLabel(student: any): string {
  return String(student?.rollNumber ?? student?.studentId ?? '') || 'N/A';
}

export function TeacherAvatar({
  teacher,
  size = 'md',
}: {
  teacher?: any;
  size?: 'sm' | 'md' | 'lg';
}) {
  const classes =
    size === 'sm'
      ? 'h-9 w-9 text-xs rounded-xl'
      : size === 'lg'
        ? 'h-16 w-16 text-lg rounded-2xl'
        : 'h-11 w-11 text-sm rounded-xl';
  const name = String(teacher?.fullName ?? teacher?.teacherId ?? 'Teacher');

  return (
    <div
      className={`flex ${classes} items-center justify-center overflow-hidden bg-slate-900 font-semibold text-white shadow-sm`}
    >
      {teacher?.profilePhoto ? (
        <img src={teacher.profilePhoto} alt={name} className="h-full w-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

export function StudentAvatar({
  student,
  size = 'md',
}: {
  student?: any;
  size?: 'sm' | 'md';
}) {
  const classes =
    size === 'sm'
      ? 'h-9 w-9 text-xs rounded-xl'
      : 'h-12 w-12 text-sm rounded-2xl';
  const name = studentDisplayName(student);
  const profilePhoto =
    student?.profilePhoto ??
    student?.student?.profilePhoto ??
    student?.student?.user?.profilePhoto ??
    null;

  return (
    <div
      className={`flex ${classes} items-center justify-center overflow-hidden bg-slate-900 font-semibold text-white shadow-sm`}
    >
      {profilePhoto ? (
        <img src={profilePhoto} alt={name} className="h-full w-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

export function TeacherAvatarStack({ teachers }: { teachers: any[] }) {
  const visibleTeachers = teachers.slice(0, 3);
  return (
    <div className="flex items-center">
      {visibleTeachers.map((teacher, index) => (
        <div
          key={teacher?.id ?? `${teacher?.teacherId}-${index}`}
          className={index === 0 ? '' : '-ml-3'}
        >
          <TeacherAvatar teacher={teacher} size="sm" />
        </div>
      ))}
      {teachers.length > visibleTeachers.length && (
        <div className="-ml-3 flex h-9 w-9 items-center justify-center rounded-xl border border-white bg-slate-200 text-xs font-semibold text-slate-700">
          +{teachers.length - visibleTeachers.length}
        </div>
      )}
    </div>
  );
}

export function TeacherCourseCard({
  course,
  href,
}: {
  course: any;
  href: string;
}) {
  const teachers = getCourseTeachers(course);
  const sections = getCourseSectionNames(course);
  const archived = isCourseArchived(course);

  return (
    <Link
      to={href}
      className="group rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.3)] transition hover:-translate-y-0.5 hover:border-slate-300"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            {courseCode(course)}
          </p>
          <h3 className="mt-2 line-clamp-2 text-lg font-semibold text-slate-900">
            {courseTitle(course)}
          </h3>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            archived
              ? 'bg-slate-100 text-slate-600'
              : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {archived ? 'Old' : 'Current'}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {sections.slice(0, 4).map((section) => (
            <span
              key={section}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              {section}
            </span>
          ))}
          {sections.length > 4 && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              +{sections.length - 4}
            </span>
          )}
        </div>
        {teachers.length ? <TeacherAvatarStack teachers={teachers} /> : null}
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-500 sm:grid-cols-3">
        <span className="inline-flex items-center gap-2">
          <CalendarDays size={15} className="text-slate-400" />
          {semesterLabel(course)}
        </span>
        <span className="inline-flex items-center gap-2">
          <Layers3 size={15} className="text-slate-400" />
          {sections.length} section{sections.length === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-2">
          <Clock3 size={15} className="text-slate-400" />
          {(course?.schedules?.length ?? 0) || 0} slot{(course?.schedules?.length ?? 0) === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-2 text-slate-500">
          <Users size={15} className="text-slate-400" />
          {teachers.length
            ? teachers.map((teacher) => teacher?.fullName ?? teacher?.teacherId).join(', ')
            : 'Teacher pending'}
        </span>
        <span className="inline-flex items-center gap-1 font-medium text-slate-900">
          Open
          <ChevronRight size={16} className="transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
