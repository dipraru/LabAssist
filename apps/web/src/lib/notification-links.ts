type AppRole = 'student' | 'teacher' | 'office' | string | undefined;

type NotificationLike = {
  targetPath?: string | null;
  type?: string | null;
  referenceId?: string | null;
};

export function resolveNotificationHref(
  role: AppRole,
  notification: NotificationLike,
): string {
  if (notification?.targetPath?.trim()) {
    return notification.targetPath;
  }

  const fallback =
    role === 'teacher'
      ? '/teacher/notifications'
      : role === 'student'
        ? '/student/notifications'
        : '/';

  if (notification?.type === 'assignment_posted') {
    return role === 'teacher'
      ? '/teacher/courses'
      : notification?.referenceId
        ? `/student/assignments?assignmentId=${notification.referenceId}`
        : '/student/assignments';
  }

  if (notification?.type === 'lecture_sheet_posted') {
    return role === 'teacher' ? '/teacher/courses' : '/student/courses';
  }

  if (notification?.type === 'system') {
    return role === 'teacher' ? '/teacher/courses' : '/student/courses';
  }

  if (notification?.type === 'contest_announcement') {
    return role === 'teacher' ? '/teacher' : '/student';
  }

  return fallback;
}
