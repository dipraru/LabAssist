import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { BookOpen, ExternalLink } from 'lucide-react';

export function StudentCourses() {
  const [selectedCourse, setSelectedCourse] = useState<any>(null);

  const { data: courses = [] } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/my').then(r => r.data),
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
                selectedCourse?.id === c.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-100 bg-white hover:border-slate-300'
              }`}>
              <BookOpen size={18} className="text-indigo-500 mb-2" />
              <p className="font-semibold text-slate-800 text-sm">{c.code}</p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{c.name}</p>
            </button>
          ))}
          {!(courses as any[]).length && <p className="col-span-3 text-slate-400 py-4">Not enrolled in any courses</p>}
        </div>

        {selectedCourse && (
          <div>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Lecture Sheets — {selectedCourse.name}</h2>
            {!(sheets as any[]).length ? (
              <p className="text-slate-400 text-sm">No lecture sheets yet</p>
            ) : (
              <div className="space-y-3">
                {(sheets as any[]).map((s: any) => (
                  <div key={s.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                    <p className="font-semibold text-slate-800">{s.title}</p>
                    {s.description && <p className="text-sm text-slate-500 mt-0.5">{s.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(s.links ?? []).map((l: any, i: number) => (
                        <a key={i} href={l.url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium hover:bg-indigo-100">
                          <ExternalLink size={11} /> {l.label || l.url}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
