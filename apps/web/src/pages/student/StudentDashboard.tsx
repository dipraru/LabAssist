import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { useAuthStore } from '../../store/auth.store';
import { BookOpen, ClipboardList, Bell, FlaskConical } from 'lucide-react';

export function StudentDashboard() {
  const { user } = useAuthStore();

  const { data: courses = [] } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/my').then(r => r.data),
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
  });

  const unread = (notifications as any[]).filter((n: any) => !n.isRead);

  const profile = user?.profile as any;

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Hello, {profile?.fullName ?? user?.username} 👋
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Here's your overview</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard icon={<BookOpen className="text-indigo-500" size={22} />} label="Enrolled Courses" value={(courses as any[]).length} />
          <StatCard icon={<Bell className="text-amber-500" size={22} />} label="Unread Notifications" value={unread.length} />
          <StatCard icon={<ClipboardList className="text-green-500" size={22} />} label="Active Contests" value={0} />
        </div>

        {/* Recent notifications */}
        {unread.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Recent Notifications</h2>
            <div className="space-y-2">
              {unread.slice(0, 5).map((n: any) => (
                <div key={n.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-start gap-3">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-slate-800 text-sm">{n.title}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{n.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 className="text-lg font-semibold text-slate-800 mb-3">My Courses</h2>
        {(courses as any[]).length === 0 ? (
          <p className="text-slate-400 text-sm">Not enrolled in any courses yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {(courses as any[]).map((c: any) => (
              <div key={c.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <p className="font-semibold text-slate-800">{c.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{c.code} · {c.semester?.name?.replace('_', ' ')}</p>
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
