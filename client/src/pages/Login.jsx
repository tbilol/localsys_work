import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { errorMessage, SESSION_EXPIRED_KEY } from '../api.js';
import { homePathFor, useAuth } from '../context/AuthContext.jsx';
import uz, { t } from '../lib/uz.js';
import { fullPhone, isValidPhoneDigits } from '../constants.js';
import { PhoneInput } from '../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_EXPIRED_KEY)) {
      sessionStorage.removeItem(SESSION_EXPIRED_KEY);
      toast.error(uz.session_expired, { id: 'session-expired' });
    }
  }, []);

  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isValidPhoneDigits(phone)) return setError(uz.v_phone_invalid);
    setSubmitting(true);
    try {
      const u = await login(fullPhone(phone), password);
      toast.success(t('welcome', { name: u.fullName.split(' ')[0] }));
      const next = params.get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : homePathFor(u.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err, uz.login_failed));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={onSubmit} noValidate>
        <h1 className="login-title">{uz.login_title}</h1>

        <div className="form-grid">
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="field">
            <label htmlFor="phone">{uz.phone}</label>
            <PhoneInput id="phone" value={phone} onChange={setPhone} autoComplete="username" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="password">{uz.password}</label>
            <div className="input-icon">
              <input
                id="password"
                className="input"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="btn btn-ghost btn-icon reveal"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? uz.hide_password : uz.show_password}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button className="btn btn-primary btn-block" disabled={submitting || !phone || !password}>
            {submitting ? uz.logging_in : uz.login_button}
          </button>
        </div>
      </form>
    </div>
  );
}
