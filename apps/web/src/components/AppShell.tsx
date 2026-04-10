import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import {
  LayoutDashboard,
  BookOpen,
  FlaskConical,
  Bell,
  LogOut,
  Layers3,
  FileStack,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  GraduationCap,
  BriefcaseBusiness,
  ShieldUser,
  CalendarRange,
  UserCircle2,
  User,
} from 'lucide-react';
import { useState } from 'react';

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
    { label: 'Notifications', href: '/teacher/notifications', icon: <Bell size={18} /> },
    { label: 'Courses', href: '/teacher/courses', icon: <BookOpen size={18} /> },
    { label: 'Assignments', href: '/teacher/assignments', icon: <BookOpen size={18} /> },
    { label: 'Lab Tests', href: '/teacher/lab-tests', icon: <FlaskConical size={18} /> },
    { label: 'Lecture Sheets', href: '/teacher/lecture-sheets', icon: <BookOpen size={18} /> },
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

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = user ? (roleNavItems[user.role] ?? []) : [];
  const notificationsHref = user?.role === 'student'
    ? '/student/notifications'
    : user?.role === 'teacher'
      ? '/teacher/notifications'
      : '#';
  const changePasswordHref = user?.role === 'student'
    ? '/student/change-password'
    : user?.role === 'teacher'
      ? '/teacher/change-password'
      : '/office/change-password';

  const handleLogout = () => {
    logout();
    localStorage.removeItem('labassist_token');
    localStorage.removeItem('labassist_user');
    sessionStorage.setItem('labassist_forced_logout', '1');
    window.location.replace('/login?logout=1');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-60' : 'w-16'} h-screen shrink-0 transition-all duration-200 bg-slate-900 text-white flex flex-col`}
      >
        {/* Logo */}
        {sidebarOpen ? (
          <div className="flex items-center justify-between border-b border-slate-700">
            <div className="flex min-w-0 items-center gap-3 px-4 py-4">
              <FlaskConical size={20} className="text-indigo-400 shrink-0" />
              <span className="truncate font-bold text-lg tracking-tight">LabAssist</span>
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

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5 px-2">
          {navItems.map((item) => {
            const isDashboardItem = item.href === '/office' || item.href === '/teacher' || item.href === '/student';
            const active = isDashboardItem
              ? location.pathname === item.href
              : (location.pathname === item.href || location.pathname.startsWith(item.href + '/'));
            return (
              <Link
                key={item.href}
                to={item.href}
                title={!sidebarOpen ? item.label : undefined}
                className={`group relative flex items-center rounded-lg text-sm font-medium transition-colors
                  ${sidebarOpen ? 'gap-3 px-3 py-2' : 'justify-center px-0 py-2.5'}
                  ${active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
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

        {/* User footer */}
        <div className="border-t border-slate-700 p-3">
          {sidebarOpen && (
            <div className="mb-2 px-2">
              <p className="text-xs text-slate-400">Logged in as</p>
              <p className="text-sm font-medium truncate">{user?.username}</p>
              <p className="text-xs text-indigo-400">{user?.role}</p>
            </div>
          )}
          <Link
            to={changePasswordHref}
            title={!sidebarOpen ? 'Change Password' : undefined}
            className={`group relative mb-1 flex w-full items-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 hover:text-white text-sm ${
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
            onClick={handleLogout}
            title={!sidebarOpen ? 'Sign Out' : undefined}
            className={`group relative flex w-full items-center rounded-lg text-slate-300 hover:bg-red-900 hover:text-white text-sm transition-colors ${
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

      {/* Main */}
      <main className="flex-1 flex min-h-0 flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div />
          <div className="flex items-center gap-3">
            <Link to={notificationsHref}>
              <Bell size={20} className="text-slate-500 hover:text-slate-800" />
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
