import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { BookOpen, Users } from 'lucide-react';

export function TeacherCourses() {
  const [selectedCourse, setSelectedCourse] = useState<any>(null);

  const { data: courses = [] } = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => api.get('/courses/my').then(r => r.data),
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ['course-enrollments', selectedCourse?.id],
    queryFn: () => api.get(`/courses/${selectedCourse.id}/enrollments`).then(r => r.data),
    enabled: !!selectedCourse,
  });

  const { data: sheets = [] } = useQuery({
    queryKey: ['lecture-sheets', selectedCourse?.id],
    queryFn: () => api.get(`/courses/${selectedCourse.id}/lecture-sheets`).then(r => r.data),
    enabled: !!selectedCourse,
  });

  return (
    <AppShell>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">My Courses</h1>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {(courses as any[]).map((c: any) => (
            <button key={c.id} onClick={() => setSelectedCourse(c)}
              className={`text-left p-4 rounded-xl border shadow-sm transition-all ${
                selectedCourse?.id === c.id
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-slate-100 bg-white hover:border-slate-300'
              }`}>
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center mb-2">
                <BookOpen size={15} className="text-indigo-600" />
              </div>
              <p className="font-semibold text-slate-800 text-sm">{c.code}</p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{c.name}</p>
            </button>
          ))}
          {!courses.length && <p className="col-span-3 text-slate-400">No courses assigned</p>}
        </div>

        {selectedCourse && (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Users size={16} className="text-slate-500" /> Enrolled Students
              </h2>
              {(enrollments as any[]).length === 0
                ? <p className="text-sm text-slate-400">No enrollments yet</p>
                : (
                  <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {(enrollments as any[]).map((e: any) => (
                      <div key={e.id} className="py-2 text-sm">
                        <p className="font-medium text-slate-800">{e.student?.user?.username}</p>
                        <p className="text-slate-500 text-xs">{e.student?.studentId}</p>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <h2 className="font-semibold mb-3">Lecture Sheets</h2>
              {(sheets as any[]).length === 0
                ? <p className="text-sm text-slate-400">No sheets posted</p>
                : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {(sheets as any[]).map((s: any) => (
                      <div key={s.id} className="border border-slate-100 rounded-lg p-3">
                        <p className="font-medium text-sm">{s.title}</p>
                        {s.links?.map((l: any, i: number) => (
                          <a key={i} href={l.url} target="_blank" rel="noreferrer"
                            className="text-xs text-indigo-600 hover:underline block">{l.label || l.url}</a>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
