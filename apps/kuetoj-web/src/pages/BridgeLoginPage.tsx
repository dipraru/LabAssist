import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

export function BridgeLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      navigate('/login', { replace: true });
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

        navigate(user.role === 'temp_judge' ? '/judge' : '/contest', { replace: true });
      } catch {
        toast.error('Bridge login failed. Please sign in again.');
        navigate('/login', { replace: true });
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
