import axios from 'axios';
import uz from './lib/uz.js';

export const TOKEN_KEY = 'localsystem_token';
export const SESSION_EXPIRED_KEY = 'localsystem_session_expired';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  // Unwrap the { success, data, error } envelope.
  (res) => res.data.data,
  (err) => {
    const isLogin = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLogin) {
      const hadSession = Boolean(localStorage.getItem(TOKEN_KEY));
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') {
        // The login page shows the "session expired" toast after the redirect.
        if (hadSession) sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/login?next=${next}`);
        // Keep the request pending so nothing renders (and consumes the flag) before the reload.
        return new Promise(() => {});
      }
    }
    return Promise.reject(err);
  }
);

export function errorMessage(err, fallback = uz.error_generic) {
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.code === 'ERR_NETWORK') return uz.error_network;
  return fallback;
}

export default api;
