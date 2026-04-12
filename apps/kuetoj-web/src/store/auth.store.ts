import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'temp_judge' | 'temp_participant';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  isFirstLogin: boolean;
  profile?: {
    fullName?: string | null;
    participantId?: string | null;
    judgeId?: string | null;
    [key: string]: unknown;
  } | null;
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
        localStorage.setItem('kuetoj_token', token);
        set({ token, user });
      },
      logout: () => {
        localStorage.removeItem('kuetoj_token');
        localStorage.removeItem('kuetoj_user');
        set({ token: null, user: null });
      },
      setUser: (user) => set({ user }),
    }),
    {
      name: 'kuetoj_user',
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
);
