import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import {
  FlaskConical,
  LogOut,
} from 'lucide-react';

const LABASSIST_WEB_URL = import.meta.env.VITE_LABASSIST_WEB_URL ?? 'http://localhost:5173';

const roleNavItems: Record<string, { label: string; href: string }[]> = {
  temp_judge: [
    { label: 'Contests', href: '/contests' },
    { label: 'Problems', href: '/problems' },
  ],
  temp_participant: [],
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuthStore();
  const location = useLocation();

  const navItems = user ? (roleNavItems[user.role] ?? []) : [];
  const profileFullName =
    typeof user?.profile?.fullName === 'string' ? user.profile.fullName.trim() : '';
  const profileParticipantId =
    typeof user?.profile?.participantId === 'string'
      ? user.profile.participantId.trim()
      : '';
  const displayName = profileFullName || user?.username || 'User';
  const secondaryLabel =
    user?.role === 'temp_participant'
      ? profileParticipantId || user?.username || 'Participant'
      : user?.role === 'temp_judge'
        ? user?.username || 'Judge'
        : user?.role || '';

  const handleLogout = () => {
    logout();
    localStorage.removeItem('kuetoj_token');
    localStorage.removeItem('kuetoj_user');
    localStorage.removeItem('labassist_token');
    localStorage.removeItem('labassist_user');
    sessionStorage.setItem('labassist_forced_logout', '1');
    const base = LABASSIST_WEB_URL.replace(/\/$/, '');
    window.location.replace(`${base}/login?logout=1`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <Link to={user?.role === 'temp_judge' ? '/contests' : '/contest'} className="flex items-center gap-2">
              <FlaskConical size={20} className="text-indigo-300" />
              <span className="font-semibold tracking-wide">KUETOJ</span>
            </Link>
            <nav className="flex items-center gap-2">
              {navItems.map((item) => {
                const active = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium leading-4">{displayName}</p>
              <p className="text-xs text-slate-400">{secondaryLabel}</p>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-700 text-slate-200 hover:bg-red-900 hover:border-red-800 transition-colors text-sm"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-6 py-6">
        {children}
      </main>
    </div>
  );
}
