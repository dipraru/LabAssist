import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { CourseMaterialDetail } from '../../components/CourseMaterialDetail';
import { CourseWorkspace } from '../../components/CourseWorkspace';
import { StudentLabClassWorkspace } from './StudentLabClassWorkspace';

export function StudentCourses() {
  const { labClassId, sheetId } = useParams<{ labClassId: string; sheetId: string }>();

  return (
    <AppShell>
      {sheetId ? (
        <CourseMaterialDetail role="student" />
      ) : labClassId ? (
        <StudentLabClassWorkspace />
      ) : (
        <CourseWorkspace role="student" />
      )}
    </AppShell>
  );
}
