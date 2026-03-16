import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import type { UserRole } from '../store/auth.store';

interface Props {
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: Props) {
  const { token, user } = useAuthStore();
  const location = useLocation();

  if (!token || !user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  const studentProfileCompleted = Boolean((user.profile as any)?.profileCompleted);
  if (user.role === 'student' && !studentProfileCompleted && location.pathname !== '/student/profile') {
    return <Navigate to="/student/profile" replace />;
  }

  return <Outlet />;
}
