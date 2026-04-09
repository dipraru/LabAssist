import { AppShell } from '../../components/AppShell';
import { CourseWorkspace } from '../../components/CourseWorkspace';

export function StudentCourses() {
  return (
    <AppShell>
      <CourseWorkspace role="student" />
    </AppShell>
  );
}
