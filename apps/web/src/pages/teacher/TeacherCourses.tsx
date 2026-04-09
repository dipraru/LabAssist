import { AppShell } from '../../components/AppShell';
import { CourseWorkspace } from '../../components/CourseWorkspace';

export function TeacherCourses() {
  return (
    <AppShell>
      <CourseWorkspace role="teacher" />
    </AppShell>
  );
}
