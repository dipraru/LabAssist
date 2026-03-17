import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { Eye, EyeOff, FlaskConical, ShieldCheck } from 'lucide-react';

const schema = z.object({
  username: z.string().min(1, 'Username required'),
  password: z.string().min(1, 'Password required'),
});
type FormData = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const credentialsSupported = useMemo(
    () => typeof window !== 'undefined' && 'credentials' in navigator,
    [],
  );

  // Sync email field with username for password manager recognition
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const handleInput = (e: Event) => {
      const usernameInput = form.querySelector('input[name="username"]') as HTMLInputElement;
      if (usernameInput && emailInputRef.current) {
        emailInputRef.current.value = usernameInput.value;
      }
    };

    form.addEventListener('input', handleInput);
    return () => form.removeEventListener('input', handleInput);
  }, []);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const parseAuthError = (err: any): string => {
    const payloadMessage = err?.response?.data?.message;
    if (Array.isArray(payloadMessage) && payloadMessage.length > 0) {
      return String(payloadMessage[0]);
    }
    if (typeof payloadMessage === 'string' && payloadMessage.trim()) {
      return payloadMessage;
    }
    if (err?.response?.status === 401) {
      return 'Authentication failed. Please verify your username and password.';
    }
    return 'Unable to sign in right now. Please try again.';
  };

  const maybeStoreCredential = async (username: string, password: string) => {
    if (!credentialsSupported) return;

    try {
      const PasswordCredentialCtor = (window as any).PasswordCredential;
      if (!PasswordCredentialCtor || !navigator.credentials?.store) return;

      if (formRef.current) {
        const credentialFromForm = new PasswordCredentialCtor(formRef.current);
        if (credentialFromForm) {
          await navigator.credentials.store(credentialFromForm);
          return;
        }
      }

      const credential = new PasswordCredentialCtor({ id: username, password, name: username });
      await navigator.credentials.store(credential);
    } catch {
      return;
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      setAuthError(null);
      const res = await api.post('/auth/login', data);
      const { accessToken, user } = res.data;

      if (user.role !== 'temp_judge' && user.role !== 'temp_participant') {
        toast.error('Only temporary judges/participants can access KUETOJ');
        return;
      }

      await maybeStoreCredential(data.username, data.password);

      login(accessToken, user);

      // Role-based redirect
      const roleMap: Record<string, string> = {
        temp_judge: '/judge',
        temp_participant: '/contest',
      };
      navigate(roleMap[user.role] ?? '/');
    } catch (err: any) {
      const message = parseAuthError(err);
      setAuthError(message);
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_50%),radial-gradient(circle_at_bottom,_rgba(99,102,241,0.2),_transparent_45%)]" />
      <div className="relative min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/95 text-slate-900 shadow-2xl backdrop-blur p-8">
          <div className="flex flex-col items-center mb-7">
            <div className="bg-indigo-100 rounded-full p-3 mb-3">
              <FlaskConical size={30} className="text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold">KUETOJ</h1>
            <p className="text-slate-500 text-sm mt-1">Judge & Participant Secure Login</p>
          </div>

          <form
            ref={formRef}
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            autoComplete="on"
            method="post"
            action="/login"
            name="login"
          >
            <input
              ref={emailInputRef}
              type="email"
              name="email"
              autoComplete="email"
              className="absolute opacity-0 w-0 h-0 -z-10"
              tabIndex={-1}
              aria-hidden="true"
            />

            {authError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {authError}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">Username or Email</label>
              <input
                id="username"
                {...register('username')}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter your username or email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="text"
                autoCorrect="off"
                aria-label="Username or Email"
                name="username"
              />
              {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  id="password"
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  className="w-full px-3 py-2.5 pr-11 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  aria-label="Password"
                  name="password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-200 p-3">
            <ShieldCheck size={16} className="text-indigo-600 mt-0.5" />
            <p className="text-xs text-slate-600">
              Use temporary credentials from office. Your browser can securely save this login.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
