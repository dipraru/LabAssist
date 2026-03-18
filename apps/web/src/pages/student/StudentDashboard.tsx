import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { useAuthStore } from '../../store/auth.store';
import { BookOpen, ClipboardList, Bell } from 'lucide-react';

function courseCode(course: any): string {
  return course?.courseCode ?? course?.code ?? 'N/A';
}

function courseTitle(course: any): string {
  return course?.title ?? course?.name ?? 'Untitled Course';
}

export function StudentDashboard() {
  const { user } = useAuthStore();

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['student-courses'],
    queryFn: () => api.get('/courses/my').then(r => r.data),
  });

  const { data: notifications = [], isLoading: notificationsLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
  });

  const { data: pendingAssignments = 0 } = useQuery({
    queryKey: ['student-pending-assignments', (courses as any[]).map((c: any) => c.id).join(',')],
    enabled: (courses as any[]).length > 0,
    queryFn: async () => {
      const assignmentLists = await Promise.all(
        (courses as any[]).map((c: any) =>
          api.get(`/assignments/course/${c.id}`).then((r) => r.data).catch(() => []),
        ),
      );

      const seen = new Set<string>();
      let pending = 0;

      for (const list of assignmentLists as any[][]) {
        for (const assignment of list ?? []) {
          if (!assignment?.id || seen.has(assignment.id)) continue;
          seen.add(assignment.id);

          if (assignment.mySubmission) continue;

          const deadlineMs = assignment.deadline ? new Date(assignment.deadline).getTime() : null;
          const isExpired = deadlineMs != null && Number.isFinite(deadlineMs) && deadlineMs < Date.now();
          if (isExpired && !assignment.allowLateSubmission) continue;

          pending += 1;
        }
      }

      return pending;
    },
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

        {coursesLoading || notificationsLoading ? (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((k) => (
              <div key={k} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 animate-pulse">
                <div className="w-10 h-10 bg-slate-100 rounded-xl mb-3" />
                <div className="h-6 w-16 bg-slate-100 rounded mb-2" />
                <div className="h-4 w-28 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard icon={<BookOpen className="text-indigo-500" size={22} />} label="Enrolled Courses" value={(courses as any[]).length} />
            <Link to="/student/notifications">
              <StatCard icon={<Bell className="text-amber-500" size={22} />} label="Unread Notifications" value={unread.length} />
            </Link>
            <Link to="/student/assignments">
              <StatCard icon={<ClipboardList className="text-green-500" size={22} />} label="Pending Assignments" value={pendingAssignments} />
            </Link>
          </div>
        )}

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
        {coursesLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((k) => (
              <div key={k} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 animate-pulse">
                <div className="h-4 w-40 bg-slate-100 rounded mb-2" />
                <div className="h-3 w-28 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : (courses as any[]).length === 0 ? (
          <p className="text-slate-400 text-sm">Not enrolled in any courses yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {(courses as any[]).map((c: any) => (
              <div key={c.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <p className="font-semibold text-slate-800">{courseTitle(c)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{courseCode(c)} · {c.semester?.name?.replace('_', ' ')}</p>
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
