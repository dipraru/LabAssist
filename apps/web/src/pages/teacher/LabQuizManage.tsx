import { AppShell } from '../../components/AppShell';
import { TeacherLabQuizManager } from './TeacherLabQuizManager';

export function LabQuizManage() {
  const params = new URLSearchParams(window.location.search);
  const courseId = params.get('courseId') ?? '';

  return (
    <AppShell>
      <div className="mx-auto max-w-[1560px]">
        {courseId ? (
          <TeacherLabQuizManager
            fixedCourseId={courseId}
            heading={{
              eyebrow: 'Teacher Workspace',
              title: 'Lab Quiz',
              description: 'Create, run, grade, and export lab quiz results.',
            }}
          />
        ) : (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            Open Lab Quiz from a course workspace.
          </div>
        )}
      </div>
    </AppShell>
  );
}
