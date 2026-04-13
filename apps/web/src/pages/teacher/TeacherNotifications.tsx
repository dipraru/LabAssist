import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { api } from '../../lib/api';

function resolveNotificationHref(notification: any): string {
  if (notification?.targetPath) {
    return notification.targetPath;
  }
  if (notification?.type === 'system') {
    return '/teacher/courses';
  }
  return '/teacher/notifications';
}

function formatNotificationTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function TeacherNotifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', 'page'],
    queryFn: () => api.get('/notifications').then((response) => response.data),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/mark-all-read'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      toast.success('All notifications marked as read');
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message ?? 'Failed to mark all as read'),
  });

  const markReadMutation = useMutation({
    mutationFn: (ids: string[]) => api.patch('/notifications/mark-read', { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  const unreadCount = (notifications as any[]).filter((item: any) => !item.isRead).length;
  const visibleNotifications = useMemo(
    () =>
      filter === 'unread'
        ? (notifications as any[]).filter((item: any) => !item.isRead)
        : (notifications as any[]),
    [filter, notifications],
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                Notifications
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">Inbox</h1>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex gap-2 rounded-full border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    filter === 'all'
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('unread')}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    filter === 'unread'
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Unread
                </button>
              </div>

              <button
                type="button"
                onClick={() => markAllReadMutation.mutate()}
                disabled={!unreadCount || markAllReadMutation.isPending}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck size={16} />
                Mark all read
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Unread" value={unreadCount} />
            <StatCard label="Total" value={(notifications as any[]).length} />
            <StatCard
              label={filter === 'unread' ? 'Showing unread' : 'Showing all'}
              value={visibleNotifications.length}
            />
          </div>
        </section>

        <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.3)]">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((item) => (
                <div
                  key={item}
                  className="h-24 animate-pulse rounded-[24px] bg-slate-100"
                />
              ))}
            </div>
          ) : visibleNotifications.length ? (
            <div className="space-y-3">
              {visibleNotifications.map((notification: any) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => {
                    if (!notification.isRead) {
                      markReadMutation.mutate([notification.id]);
                    }
                    navigate(resolveNotificationHref(notification));
                  }}
                  className={`flex w-full items-start gap-4 rounded-[24px] border p-4 text-left transition hover:border-slate-300 hover:bg-slate-50 ${
                    notification.isRead
                      ? 'border-slate-200 bg-white'
                      : 'border-sky-200 bg-sky-50/70'
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <Bell size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm font-semibold text-slate-900">
                        {notification.title}
                      </p>
                      <div className="flex items-center gap-2">
                        {!notification.isRead && (
                          <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                        )}
                        <span className="text-xs font-medium text-slate-400">
                          {formatNotificationTime(notification.createdAt)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{notification.body}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
              <Bell className="mx-auto text-slate-300" size={22} />
              <p className="mt-3 text-sm font-medium text-slate-700">No notifications</p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
