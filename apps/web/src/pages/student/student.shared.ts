import {
  getCourseScheduleForSection,
  resolveStudentSection,
} from '../teacher/teacher.shared';

export function getStudentIdentityValue(
  user?: { username?: string; profile?: Record<string, unknown> } | null,
  profile?: Record<string, unknown> | null,
): string {
  return String(
    profile?.studentId ??
      user?.profile?.studentId ??
      user?.username ??
      '',
  ).trim();
}

export function getStudentSectionNameForCourse(
  course: any,
  studentIdentityValue?: string | null,
): string {
  const normalizedStudentId = String(studentIdentityValue ?? '').trim();
  if (normalizedStudentId) {
    return resolveStudentSection(course, { studentId: normalizedStudentId });
  }

  const schedules = Array.isArray(course?.schedules) ? course.schedules : [];
  if (schedules.length === 1) {
    return schedules[0]?.sectionName ?? 'All Students';
  }

  return 'All Students';
}

export function getStudentScheduleForCourse(
  course: any,
  studentIdentityValue?: string | null,
) {
  const sectionName = getStudentSectionNameForCourse(course, studentIdentityValue);
  return (
    getCourseScheduleForSection(course, sectionName) ??
    getCourseScheduleForSection(course, 'All Students')
  );
}
