import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: false,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('labassist_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401 → redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('labassist_token');
      localStorage.removeItem('labassist_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);
