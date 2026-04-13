import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderArchive, Layers3 } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { api } from '../../lib/api';
import { TeacherCourseDetail } from './TeacherCourseDetail';
import { TeacherLabClassWorkspace } from './TeacherLabClassWorkspace';
import { TeacherCourseCard, splitTeacherCourses } from './teacher.shared';

export function TeacherCourses() {
  const { courseId, labClassId } = useParams<{
    courseId: string;
    labClassId: string;
  }>();

  return (
    <AppShell>
      {labClassId ? (
        <TeacherLabClassWorkspace />
      ) : courseId ? (
        <TeacherCourseDetail />
      ) : (
        <TeacherCoursesOverview />
      )}
    </AppShell>
  );
}

function TeacherCoursesOverview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'old' ? 'old' : 'current';

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => api.get('/courses/my').then((response) => response.data),
  });

  const { current, old } = useMemo(
    () => splitTeacherCourses(courses as any[]),
    [courses],
  );
  const visibleCourses = view === 'old' ? old : current;

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
            icon={<Layers3 size={18} />}
            label={view === 'old' ? 'Showing old' : 'Showing current'}
            value={String(visibleCourses.length)}
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
              href={`/teacher/courses/${course.id}`}
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
