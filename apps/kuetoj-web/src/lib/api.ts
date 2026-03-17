import axios from 'axios';

const LABASSIST_WEB_URL = import.meta.env.VITE_LABASSIST_WEB_URL ?? 'http://localhost:5173';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  withCredentials: false,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('kuetoj_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401 → redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const requestUrl = String(err?.config?.url ?? '');
    const isAuthLoginRequest = /\/auth\/login\/?$/.test(requestUrl);

    if (err.response?.status === 401 && !isAuthLoginRequest) {
      localStorage.removeItem('kuetoj_token');
      localStorage.removeItem('kuetoj_user');
      localStorage.removeItem('labassist_token');
      localStorage.removeItem('labassist_user');
      const base = LABASSIST_WEB_URL.replace(/\/$/, '');
      window.location.href = `${base}/login`;
    }
    return Promise.reject(err);
  },
);
