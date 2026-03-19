import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import type { UserRole } from '../store/auth.store';

const LABASSIST_WEB_URL = import.meta.env.VITE_LABASSIST_WEB_URL ?? 'http://localhost:5173';

interface Props {
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: Props) {
  const { token, user } = useAuthStore();

  if (!token || !user) {
    const base = LABASSIST_WEB_URL.replace(/\/$/, '');
    sessionStorage.setItem('labassist_forced_logout', '1');
    window.location.replace(`${base}/login?logout=1`);
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
