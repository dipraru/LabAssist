import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'office' | 'teacher' | 'student' | 'temp_judge' | 'temp_participant';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  isFirstLogin: boolean;
  profile?: Record<string, unknown>;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  setUser: (user: AuthUser) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => {
        localStorage.setItem('labassist_token', token);
        set({ token, user });
      },
      logout: () => {
        localStorage.removeItem('labassist_token');
        localStorage.removeItem('labassist_user');
        set({ token: null, user: null });
      },
      setUser: (user) => set({ user }),
    }),
    {
      name: 'labassist_user',
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
);
