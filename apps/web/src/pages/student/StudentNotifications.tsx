import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppShell } from '../../components/AppShell';
import { Bell, CheckCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export function StudentNotifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then((r) => r.data),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/mark-all-read'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All notifications marked as read');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed to mark all as read'),
  });

  const markReadMutation = useMutation({
    mutationFn: (ids: string[]) => api.patch('/notifications/mark-read', { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = (notifications as any[]).filter((n: any) => !n.isRead).length;

  const resolveNotificationHref = (n: any): string => {
    if (n?.targetPath) {
      return n.targetPath;
    }
    if (n?.type === 'assignment_posted') {
      return n?.referenceId ? `/student/assignments?assignmentId=${n.referenceId}` : '/student/assignments';
    }
    if (n?.type === 'lecture_sheet_posted') {
      return n?.referenceId ? `/student/courses?sheetId=${n.referenceId}` : '/student/courses';
    }
    if (n?.type === 'system') {
      return '/student/courses';
    }
    if (n?.type === 'contest_announcement') {
      return '/student';
    }
    return '/student/notifications';
  };

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
            <p className="text-sm text-slate-500 mt-1">
              {unreadCount ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'You are all caught up'}
            </p>
          </div>
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={!unreadCount || markAllReadMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            <CheckCheck size={16} /> Mark All Read
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading notifications...</p>
        ) : !(notifications as any[]).length ? (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center text-slate-400">
            <Bell className="mx-auto mb-2" size={22} />
            No notifications yet
          </div>
        ) : (
          <div className="space-y-3">
            {(notifications as any[]).map((n: any) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.isRead) markReadMutation.mutate([n.id]);
                  const href = resolveNotificationHref(n);
                  if (href !== '/student/notifications') {
                    navigate(href);
                  }
                }}
                className={`w-full text-left bg-white rounded-xl border shadow-sm p-4 transition-colors ${
                  n.isRead ? 'border-slate-100' : 'border-indigo-200 bg-indigo-50/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{n.title}</p>
                    <p className="text-sm text-slate-600 mt-1">{n.body}</p>
                    <p className="text-xs text-slate-400 mt-2">{n.createdAt?.slice(0, 16).replace('T', ' ')}</p>
                  </div>
                  {!n.isRead && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                      Unread
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
