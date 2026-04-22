export function courseCode(course: any): string {
  return course?.courseCode ?? course?.code ?? 'N/A';
}

export function courseTitle(course: any): string {
  return course?.title ?? course?.name ?? 'Untitled Course';
}

export function semesterLabel(course: any): string {
  const raw = course?.semester?.name;
  if (!raw || typeof raw !== 'string') {
    return 'Semester N/A';
  }
  return raw.replace(/_/g, ' ');
}

export function studentDisplayName(studentLike: any): string {
  return (
    studentLike?.fullName ??
    studentLike?.user?.fullName ??
    studentLike?.user?.username ??
    studentLike?.student?.fullName ??
    studentLike?.student?.user?.fullName ??
    studentLike?.student?.user?.username ??
    studentLike?.student?.studentId ??
    studentLike?.studentId ??
    'Unknown Student'
  );
}
