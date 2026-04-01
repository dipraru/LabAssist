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

function formatShortDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

  const { data: upcomingDeadlines = [], isLoading: upcomingLoading } = useQuery({
    queryKey: ['student-upcoming-deadlines', (courses as any[]).map((c: any) => c.id).join(',')],
    enabled: (courses as any[]).length > 0,
    queryFn: async () => {
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const until = now + sevenDaysMs;

      const assignmentLists = await Promise.all(
        (courses as any[]).map((c: any) =>
          api.get(`/assignments/course/${c.id}`).then((r) => r.data).catch(() => []),
        ),
      );

      const labTestLists = await Promise.all(
        (courses as any[]).map((c: any) =>
          api.get(`/lab-tests/course/${c.id}`).then((r) => r.data).catch(() => []),
        ),
      );

      const assignmentSeen = new Set<string>();
      const labSeen = new Set<string>();
      const items: {
        id: string;
        title: string;
        kind: 'assignment' | 'lab-test';
        dueAt: string;
        href: string;
        courseCode: string;
      }[] = [];

      (courses as any[]).forEach((course: any, index: number) => {
        const assignmentList = (assignmentLists[index] as any[]) ?? [];
        for (const assignment of assignmentList) {
          if (!assignment?.id || assignmentSeen.has(assignment.id)) continue;
          assignmentSeen.add(assignment.id);

          if (assignment.mySubmission) continue;
          const deadlineMs = assignment.deadline ? new Date(assignment.deadline).getTime() : Number.NaN;
          if (!Number.isFinite(deadlineMs) || deadlineMs < now || deadlineMs > until) continue;

          items.push({
            id: assignment.id,
            title: assignment.title ?? 'Untitled Assignment',
            kind: 'assignment',
            dueAt: assignment.deadline,
            href: `/student/assignments?assignmentId=${assignment.id}`,
            courseCode: courseCode(course),
          });
        }

        const labList = (labTestLists[index] as any[]) ?? [];
        for (const lab of labList) {
          if (!lab?.id || labSeen.has(lab.id)) continue;
          labSeen.add(lab.id);

          const dueAt = lab.endTime ?? lab.startTime;
          const dueMs = dueAt ? new Date(dueAt).getTime() : Number.NaN;
          if (!Number.isFinite(dueMs) || dueMs < now || dueMs > until) continue;
          if (lab.status === 'ended') continue;

          items.push({
            id: lab.id,
            title: lab.title ?? 'Untitled Lab Test',
            kind: 'lab-test',
            dueAt,
            href: '/student/lab-tests',
            courseCode: courseCode(course),
          });
        }
      });

      return items
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
        .slice(0, 8);
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

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Upcoming Deadlines (7 days)</h2>
          {upcomingLoading ? (
            <div className="space-y-2">
              {[1, 2].map((k) => (
                <div key={k} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 animate-pulse">
                  <div className="h-4 w-44 bg-slate-100 rounded mb-2" />
                  <div className="h-3 w-28 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : !(upcomingDeadlines as any[]).length ? (
            <p className="text-slate-400 text-sm">No upcoming deadlines in the next 7 days.</p>
          ) : (
            <div className="space-y-2">
              {(upcomingDeadlines as any[]).map((item: any) => (
                <Link key={`${item.kind}-${item.id}`} to={item.href}
                  className="block bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:border-indigo-300 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-800 text-sm">{item.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.kind === 'assignment' ? 'Assignment' : 'Lab Test'} · {item.courseCode}
                      </p>
                    </div>
                    <p className="text-xs text-slate-600 whitespace-nowrap">{formatShortDateTime(item.dueAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
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
