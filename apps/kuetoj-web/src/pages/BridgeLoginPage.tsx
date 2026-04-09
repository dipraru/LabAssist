import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

const LABASSIST_WEB_URL = import.meta.env.VITE_LABASSIST_WEB_URL ?? 'http://localhost:5173';

function redirectToLabassistLogout() {
  const base = LABASSIST_WEB_URL.replace(/\/$/, '');
  window.location.replace(`${base}/login?logout=1&reason=bridge_failed`);
}

export function BridgeLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      redirectToLabassistLogout();
      return;
    }

    const bootstrap = async () => {
      try {
        const me = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const user = me.data as { id: string; username: string; role: 'temp_judge' | 'temp_participant' };
        if (user.role !== 'temp_judge' && user.role !== 'temp_participant') {
          throw new Error('Only temp judge or participant can access KUETOJ');
        }

        login(token, {
          id: user.id,
          username: user.username,
          role: user.role,
          isFirstLogin: false,
        });

        navigate(user.role === 'temp_judge' ? '/contests' : '/contest', { replace: true });
      } catch {
        toast.error('Bridge login failed. Please sign in again.');
        redirectToLabassistLogout();
      }
    };

    void bootstrap();
  }, [params, navigate, login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <p className="text-sm">Signing you into KUETOJ…</p>
    </div>
  );
}
