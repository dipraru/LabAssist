import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { BookOpen, Bell } from 'lucide-react';

export function TeacherDashboard() {
  const { data: courses = [] } = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => api.get('/courses/my').then(r => r.data),
  });
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
  });

  const unread = (notifications as any[]).filter((n: any) => !n.isRead).length;

  return (
    <AppShell>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Teacher Dashboard</h1>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <StatCard icon={<BookOpen className="text-indigo-500" size={22} />}
            label="My Courses" value={courses.length} />
          <StatCard icon={<Bell className="text-amber-500" size={22} />}
            label="Unread Notifications" value={unread} />
        </div>

        <h2 className="text-lg font-semibold text-slate-800 mb-3">My Courses</h2>
        {courses.length === 0 ? (
          <p className="text-slate-400">No courses assigned yet.</p>
        ) : (
          <div className="grid gap-3">
            {courses.map((c: any) => (
              <div key={c.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <BookOpen className="text-indigo-500" size={18} />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{c.name}</p>
                  <p className="text-sm text-slate-500">{c.code} · {c.semester?.name?.replace('_', ' ')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}
