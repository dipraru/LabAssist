import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  CalendarRange,
  CheckCheck,
  ChevronDown,
  FileStack,
  FlaskConical,
  GraduationCap,
  KeyRound,
  Layers3,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldUser,
  User,
  UserCircle2,
} from 'lucide-react';
import { api } from '../lib/api';
import { resolveNotificationHref } from '../lib/notification-links';
import { disconnectSocket, getSocket } from '../lib/socket';
import { useAuthStore } from '../store/auth.store';

const roleNavItems: Record<string, { label: string; href: string; icon: ReactNode }[]> = {
  office: [
    { label: 'Dashboard', href: '/office', icon: <LayoutDashboard size={18} /> },
    { label: 'Teachers', href: '/office/teachers', icon: <GraduationCap size={18} /> },
    { label: 'Students', href: '/office/students', icon: <User size={18} /> },
    { label: 'Batches', href: '/office/batches', icon: <Layers3 size={18} /> },
    { label: 'Courses', href: '/office/courses', icon: <BookOpen size={18} /> },
    { label: 'Semesters', href: '/office/semesters', icon: <CalendarRange size={18} /> },
    { label: 'Temp Judges', href: '/office/temp-judges', icon: <ShieldUser size={18} /> },
    { label: 'Application', href: '/office/application', icon: <FileStack size={18} /> },
  ],
  teacher: [
    { label: 'Dashboard', href: '/teacher', icon: <LayoutDashboard size={18} /> },
    { label: 'Courses', href: '/teacher/courses', icon: <BookOpen size={18} /> },
    { label: 'Lab Tests', href: '/teacher/lab-tests', icon: <FlaskConical size={18} /> },
  ],
  student: [
    { label: 'Dashboard', href: '/student', icon: <LayoutDashboard size={18} /> },
    { label: 'Notifications', href: '/student/notifications', icon: <Bell size={18} /> },
    { label: 'Profile', href: '/student/profile', icon: <UserCircle2 size={18} /> },
    { label: 'Courses', href: '/student/courses', icon: <BookOpen size={18} /> },
    { label: 'Assignments', href: '/student/assignments', icon: <BookOpen size={18} /> },
    { label: 'Lab Tests', href: '/student/lab-tests', icon: <FlaskConical size={18} /> },
  ],
};

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function isActivePath(currentPath: string, itemHref: string): boolean {
  const isDashboardItem =
    itemHref === '/office' || itemHref === '/teacher' || itemHref === '/student';
  if (isDashboardItem) {
    return currentPath === itemHref;
  }
  return currentPath === itemHref || currentPath.startsWith(`${itemHref}/`);
}

function formatNotificationTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getTeacherHeaderLabel(pathname: string): string {
  if (pathname === '/teacher') return 'Dashboard';
  if (pathname.startsWith('/teacher/courses/') && pathname.includes('/lab-classes/')) {
    return 'Lab Class';
  }
  if (pathname.startsWith('/teacher/courses/')) return 'Course Workspace';
  if (pathname.startsWith('/teacher/courses')) return 'Courses';
  if (pathname.startsWith('/teacher/lab-tests')) return 'Lab Tests';
  if (pathname.startsWith('/teacher/notifications')) return 'Notifications';
  if (pathname.startsWith('/teacher/profile')) return 'Profile';
  if (pathname.startsWith('/teacher/change-password')) return 'Account';
  return 'Teacher Workspace';
}

function getStudentHeaderLabel(pathname: string): string {
  if (pathname === '/student') return 'Dashboard';
  if (pathname.startsWith('/student/courses/')) return 'Course Workspace';
  if (pathname.startsWith('/student/courses')) return 'Courses';
  if (pathname.startsWith('/student/assignments')) return 'Assignments';
  if (pathname.startsWith('/student/lab-tests')) return 'Lab Tests';
  if (pathname.startsWith('/student/notifications')) return 'Notifications';
  if (pathname.startsWith('/student/profile')) return 'Profile';
  if (pathname.startsWith('/student/change-password')) return 'Account';
  return 'Student Workspace';
}

function NotificationMenu({
  notifications,
  unreadCount,
  loading,
  onNotificationClick,
  onMarkAllRead,
  notificationsHref,
}: {
  notifications: any[];
  unreadCount: number;
  loading: boolean;
  onNotificationClick: (notification: any) => void;
  onMarkAllRead: () => void;
  notificationsHref: string;
}) {
  return (
    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(92vw,24rem)] overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_28px_80px_-42px_rgba(15,23,42,0.45)]">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Notifications</p>
          <p className="text-xs text-slate-500">
            {unreadCount ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={!unreadCount}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCheck size={13} />
          Mark all
        </button>
      </div>

      <div className="max-h-[28rem] overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="h-20 animate-pulse rounded-2xl bg-slate-100"
              />
            ))}
          </div>
        ) : notifications.length ? (
          notifications.slice(0, 8).map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => onNotificationClick(notification)}
              className={`flex w-full items-start gap-3 rounded-[20px] px-3 py-3 text-left transition hover:bg-slate-50 ${
                notification.isRead ? '' : 'bg-sky-50/70'
              }`}
            >
              <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <Bell size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                    {notification.title}
                  </p>
                  <div className="flex items-center gap-2">
                    {!notification.isRead && (
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" />
                    )}
                    <span className="shrink-0 text-[11px] font-medium text-slate-400">
                      {formatNotificationTime(notification.createdAt)}
                    </span>
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                  {notification.body}
                </p>
              </div>
            </button>
          ))
        ) : (
          <div className="px-4 py-10 text-center">
            <Bell className="mx-auto text-slate-300" size={22} />
            <p className="mt-3 text-sm font-medium text-slate-700">No notifications yet</p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-3">
        <Link
          to={notificationsHref}
          className="block rounded-2xl bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
        >
          View all
        </Link>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);

  const notificationsHref =
    user?.role === 'student'
      ? '/student/notifications'
      : user?.role === 'teacher'
        ? '/teacher/notifications'
        : '#';
  const changePasswordHref =
    user?.role === 'student'
      ? '/student/change-password'
      : user?.role === 'teacher'
        ? '/teacher/change-password'
        : '/office/change-password';
  const profileHref =
    user?.role === 'student'
      ? '/student/profile'
      : user?.role === 'teacher'
        ? '/teacher/profile'
        : null;
  const displayName =
    String(
      (user?.profile as { fullName?: string } | undefined)?.fullName ??
        user?.username ??
        'User',
    );
  const profilePhoto =
    (user?.profile as { profilePhoto?: string } | undefined)?.profilePhoto ?? null;
  const isTeacherLayout = user?.role === 'teacher';
  const isStudentLayout = user?.role === 'student';
  const navItems = user ? roleNavItems[user.role] ?? [] : [];
  const sidebarStorageKey = user ? `labassist:${user.role}:sidebar-open` : null;
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const role = useAuthStore.getState().user?.role;
    if (!role || role === 'teacher' || role === 'student') return false;
    return localStorage.getItem(`labassist:${role}:sidebar-open`) === '1';
  });

  const { data: unreadCountData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((response) => response.data),
    enabled: Boolean(user && notificationsHref !== '#'),
    staleTime: 20_000,
  });
  const unreadCount = unreadCountData?.count ?? 0;

  const { data: notificationsData = [], isLoading: notificationsLoading } = useQuery({
    queryKey: ['notifications', 'menu'],
    queryFn: () => api.get('/notifications').then((response) => response.data),
    enabled: Boolean(user && notificationsHref !== '#'),
    staleTime: 20_000,
  });

  const notifications = useMemo(
    () => (Array.isArray(notificationsData) ? notificationsData : []),
    [notificationsData],
  );

  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/mark-all-read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (ids: string[]) => api.patch('/notifications/mark-read', { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  useEffect(() => {
    if (!sidebarStorageKey || isTeacherLayout || isStudentLayout) return;
    const storedValue = localStorage.getItem(sidebarStorageKey);
    setSidebarOpen(storedValue === '1');
  }, [isStudentLayout, isTeacherLayout, sidebarStorageKey]);

  useEffect(() => {
    if (!sidebarStorageKey || isTeacherLayout || isStudentLayout) return;
    localStorage.setItem(sidebarStorageKey, sidebarOpen ? '1' : '0');
  }, [isStudentLayout, isTeacherLayout, sidebarOpen, sidebarStorageKey]);

  useEffect(() => {
    setUserMenuOpen(false);
    setNotificationMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!userMenuOpen && !notificationMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target)) {
        setUserMenuOpen(false);
      }
      if (!notificationRef.current?.contains(target)) {
        setNotificationMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [notificationMenuOpen, userMenuOpen]);

  useEffect(() => {
    if (!user || notificationsHref === '#') return;

    const socket = getSocket();
    const handleNotification = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    };

    socket.on('notification:new', handleNotification);
    return () => {
      socket.off('notification:new', handleNotification);
    };
  }, [notificationsHref, queryClient, user]);

  const handleLogout = () => {
    disconnectSocket();
    logout();
    localStorage.removeItem('labassist_token');
    localStorage.removeItem('labassist_user');
    sessionStorage.setItem('labassist_forced_logout', '1');
    window.location.replace('/login?logout=1');
  };

  const handleNotificationClick = (notification: any) => {
    if (!notification?.isRead) {
      markReadMutation.mutate([notification.id]);
    }

    const href = resolveNotificationHref(user?.role, notification);
    setNotificationMenuOpen(false);
    navigate(href);
  };

  const notificationButton = notificationsHref !== '#' && (
    <div ref={notificationRef} className="relative">
      <button
        type="button"
        onClick={() => setNotificationMenuOpen((current) => !current)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 right-0 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {notificationMenuOpen && (
        <NotificationMenu
          notifications={notifications}
          unreadCount={unreadCount}
          loading={notificationsLoading}
          onNotificationClick={handleNotificationClick}
          onMarkAllRead={() => markAllReadMutation.mutate()}
          notificationsHref={notificationsHref}
        />
      )}
    </div>
  );

  if (isTeacherLayout || isStudentLayout) {
    const shellTitle = isTeacherLayout
      ? getTeacherHeaderLabel(location.pathname)
      : getStudentHeaderLabel(location.pathname);
    const shellSubtitle = isTeacherLayout ? 'Teacher account' : 'Student account';
    const homeHref = isTeacherLayout ? '/teacher' : '/student';
    const appSubtitle = isTeacherLayout ? 'Teacher workspace' : 'Student workspace';
    const userMenuLinks = isTeacherLayout
      ? [
          profileHref
            ? { label: 'My Profile', href: profileHref }
            : null,
          { label: 'Dashboard', href: '/teacher' },
          { label: 'Courses', href: '/teacher/courses' },
          { label: 'Change Password', href: changePasswordHref },
        ].filter(Boolean) as { label: string; href: string }[]
      : [
          { label: 'Dashboard', href: '/student' },
          { label: 'Courses', href: '/student/courses' },
          { label: 'Assignments', href: '/student/assignments' },
          { label: 'Lab Tests', href: '/student/lab-tests' },
          { label: 'Notifications', href: '/student/notifications' },
          profileHref
            ? { label: 'My Profile', href: profileHref }
            : null,
          { label: 'Change Password', href: changePasswordHref },
        ].filter(Boolean) as { label: string; href: string }[];

    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#edf4ff_42%,#f8fafc_100%)] text-slate-900">
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
          <div className="mx-auto grid max-w-[1520px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-5 py-4 sm:px-8">
            <div className="flex min-w-0 items-center gap-4 justify-self-start">
              <Link to={homeHref} className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/10">
                  <FlaskConical size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">LabAssist</p>
                  <p className="truncate text-xs text-slate-500">{appSubtitle}</p>
                </div>
              </Link>
            </div>

            <div className="hidden justify-self-center sm:block">
              <div className="rounded-full border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef5ff_100%)] px-6 py-2 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700">
                  {shellTitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 justify-self-end">
              {notificationButton}

              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((current) => !current)}
                  className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 shadow-sm transition hover:border-slate-300"
                >
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-sm font-semibold text-white">
                    {profilePhoto ? (
                      <img
                        src={profilePhoto}
                        alt={displayName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getInitials(displayName)
                    )}
                  </div>
                  <div className="hidden text-left sm:block">
                    <p className="max-w-44 truncate text-sm font-semibold text-slate-900">
                      {displayName}
                    </p>
                    <p className="text-xs text-slate-500">{shellSubtitle}</p>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform ${
                      userMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/10">
                    {userMenuLinks.map((item) => (
                      <Link
                        key={item.href}
                        to={item.href}
                        className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                      >
                        {item.label}
                      </Link>
                    ))}
                    <div className="my-2 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                    >
                      <LogOut size={15} />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1520px] px-5 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside
        className={`${sidebarOpen ? 'w-60' : 'w-16'} flex h-screen shrink-0 flex-col bg-slate-900 text-white transition-all duration-200`}
      >
        {sidebarOpen ? (
          <div className="flex items-center justify-between border-b border-slate-700">
            <div className="flex min-w-0 items-center gap-3 px-4 py-4">
              <FlaskConical size={20} className="shrink-0 text-indigo-400" />
              <span className="truncate text-lg font-bold tracking-tight">LabAssist</span>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="group flex h-14 w-14 shrink-0 items-center justify-center border-l border-slate-700 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
        ) : (
          <div className="border-b border-slate-700">
            <div className="flex items-center justify-center px-0 py-4">
              <FlaskConical size={20} className="text-indigo-400" />
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex h-12 w-full items-center justify-center border-t border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen size={18} />
            </button>
          </div>
        )}

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
          {navItems.map((item) => {
            const active = isActivePath(location.pathname, item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                title={!sidebarOpen ? item.label : undefined}
                className={`group relative flex items-center rounded-lg text-sm font-medium transition-colors
                  ${sidebarOpen ? 'gap-3 px-3 py-2' : 'justify-center px-0 py-2.5'}
                  ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
              >
                {item.icon}
                {sidebarOpen && <span>{item.label}</span>}
                {!sidebarOpen && (
                  <span className="pointer-events-none absolute left-full z-20 ml-3 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg shadow-black/20 ring-1 ring-slate-700 transition-all group-hover:opacity-100">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-700 p-3">
          {sidebarOpen && (
            <div className="mb-2 px-2">
              <p className="text-xs text-slate-400">Logged in as</p>
              <p className="truncate text-sm font-medium">{user?.username}</p>
              <p className="text-xs text-indigo-400">{user?.role}</p>
            </div>
          )}
          <Link
            to={changePasswordHref}
            title={!sidebarOpen ? 'Change Password' : undefined}
            className={`group relative mb-1 flex w-full items-center rounded-lg text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white ${
              sidebarOpen ? 'gap-2 px-3 py-2' : 'justify-center px-0 py-2.5'
            }`}
          >
            <KeyRound size={16} />
            {sidebarOpen && 'Change Password'}
            {!sidebarOpen && (
              <span className="pointer-events-none absolute left-full z-20 ml-3 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg shadow-black/20 ring-1 ring-slate-700 transition-all group-hover:opacity-100">
                Change Password
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            title={!sidebarOpen ? 'Sign Out' : undefined}
            className={`group relative flex w-full items-center rounded-lg text-sm text-slate-300 transition-colors hover:bg-red-900 hover:text-white ${
              sidebarOpen ? 'gap-2 px-3 py-2' : 'justify-center px-0 py-2.5'
            }`}
          >
            <LogOut size={16} />
            {sidebarOpen && 'Sign Out'}
            {!sidebarOpen && (
              <span className="pointer-events-none absolute left-full z-20 ml-3 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg shadow-black/20 ring-1 ring-slate-700 transition-all group-hover:opacity-100">
                Sign Out
              </span>
            )}
          </button>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div />
          <div className="flex items-center gap-3">{notificationButton}</div>
        </header>

        <div className="flex-1 overflow-auto p-6">{children}</div>
      </main>
    </div>
  );
}
