import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import {
  LayoutDashboard, BookOpen, FlaskConical, Bell,
  LogOut, User, ChevronDown, Layers3, FileStack, KeyRound,
} from 'lucide-react';
import { useState } from 'react';

const roleNavItems: Record<string, { label: string; href: string; icon: ReactNode }[]> = {
  office: [
    { label: 'Dashboard', href: '/office', icon: <LayoutDashboard size={18} /> },
    { label: 'Teachers', href: '/office/teachers', icon: <User size={18} /> },
    { label: 'Students', href: '/office/students', icon: <User size={18} /> },
    { label: 'Batches', href: '/office/batches', icon: <Layers3 size={18} /> },
    { label: 'Courses', href: '/office/courses', icon: <BookOpen size={18} /> },
    { label: 'Semesters', href: '/office/semesters', icon: <BookOpen size={18} /> },
    { label: 'Temp Judges', href: '/office/temp-judges', icon: <User size={18} /> },
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
    { label: 'Profile', href: '/student/profile', icon: <User size={18} /> },
    { label: 'Courses', href: '/student/courses', icon: <BookOpen size={18} /> },
    { label: 'Assignments', href: '/student/assignments', icon: <BookOpen size={18} /> },
    { label: 'Lab Tests', href: '/student/lab-tests', icon: <FlaskConical size={18} /> },
  ],
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
        className={`${sidebarOpen ? 'w-56' : 'w-14'} h-screen shrink-0 transition-all duration-200 bg-slate-900 text-white flex flex-col`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-slate-700">
          <FlaskConical size={22} className="text-indigo-400 shrink-0" />
          {sidebarOpen && <span className="font-bold text-lg tracking-tight">LabAssist</span>}
        </div>

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
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
              >
                {item.icon}
                {sidebarOpen && <span>{item.label}</span>}
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
            className="mb-1 flex items-center gap-2 w-full px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white text-sm transition-colors"
          >
            <KeyRound size={16} />
            {sidebarOpen && 'Change Password'}
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-slate-300 hover:bg-red-900 hover:text-white text-sm transition-colors"
          >
            <LogOut size={16} />
            {sidebarOpen && 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex min-h-0 flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ChevronDown size={20} className={`transition-transform ${sidebarOpen ? '-rotate-90' : 'rotate-90'}`} />
          </button>
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
