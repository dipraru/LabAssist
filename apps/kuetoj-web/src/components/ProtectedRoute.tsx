import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import type { UserRole } from '../store/auth.store';

interface Props {
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: Props) {
  const { token, user } = useAuthStore();

  if (!token || !user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
