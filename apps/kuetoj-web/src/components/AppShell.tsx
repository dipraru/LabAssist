import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, FlaskConical, LogOut, Plus, Rows3, UserRound } from 'lucide-react';
import { useAuthStore } from '../store/auth.store';

const LABASSIST_WEB_URL = import.meta.env.VITE_LABASSIST_WEB_URL ?? 'http://localhost:5173';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const profileFullName =
    typeof user?.profile?.fullName === 'string' ? user.profile.fullName.trim() : '';
  const profileParticipantId =
    typeof user?.profile?.participantId === 'string' ? user.profile.participantId.trim() : '';
  const displayName = profileFullName || user?.username || 'User';
  const secondaryLabel =
    user?.role === 'temp_participant'
      ? profileParticipantId || user?.username || 'Participant'
      : user?.role === 'temp_judge'
        ? user?.username || 'Judge'
        : user?.role || '';
  const homeHref = user?.role === 'temp_judge' ? '/contests' : '/contests';

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

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!menuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to={homeHref} className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white">
              <FlaskConical size={18} />
            </span>
            <span>
              <span className="block text-sm font-extrabold leading-4 tracking-tight">KUETOJ</span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Online Judge</span>
            </span>
          </Link>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <UserRound size={16} />
              <span className="hidden max-w-40 truncate sm:inline">{displayName}</span>
              <ChevronDown size={15} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="truncate text-sm font-extrabold text-slate-900">{displayName}</p>
                  <p className="truncate text-xs font-semibold text-slate-500">{secondaryLabel}</p>
                </div>

                {user?.role === 'temp_judge' && (
                  <div className="p-2">
                    <Link
                      to="/contests/new"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Plus size={15} />
                      Create Contest
                    </Link>
                    <Link
                      to="/contests"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Rows3 size={15} />
                      Manage Contests
                    </Link>
                    <Link
                      to="/problems"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <FlaskConical size={15} />
                      My Problems
                    </Link>
                  </div>
                )}

                <div className="border-t border-slate-100 p-2">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50"
                  >
                    <LogOut size={15} />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
        {children}
      </main>
    </div>
  );
}
