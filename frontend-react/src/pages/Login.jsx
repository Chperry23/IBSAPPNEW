import { useState } from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!isLogin) {
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }
      if (formData.password.length < 6) {
        setError('Password must be at least 6 characters long');
        setLoading(false);
        return;
      }
    }

    try {
      const result = isLogin
        ? await login(formData.username, formData.password)
        : await register(formData);

      if (!result.success) {
        setError(result.error || 'An error occurred');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--app-bg)] px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(37, 99, 235, 0.35), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(37, 99, 235, 0.12), transparent)',
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <img
            src="/logo.svg"
            alt=""
            className="mx-auto mb-4 h-16 w-16 rounded-2xl shadow-xl shadow-blue-900/40"
            width={64}
            height={64}
          />
          <h1 className="page-title justify-center text-3xl">Cabinet PM</h1>
          <p className="mt-2 text-sm text-gray-400">ECI Industrial Solutions</p>
          <p className="mt-1 text-sm text-gray-500">
            {isLogin ? 'Sign in to continue field PM work' : 'Create an account for this tablet'}
          </p>
        </div>

        <div className="card shadow-2xl shadow-black/40">
          <div className="card-body space-y-6 p-8">
            <div className="inline-flex w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-inset)] p-0.5">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(true);
                  setError('');
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition-all ${
                  isLogin ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <LogIn className="h-4 w-4" aria-hidden />
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLogin(false);
                  setError('');
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition-all ${
                  !isLogin ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <UserPlus className="h-4 w-4" aria-hidden />
                Register
              </button>
            </div>

            {error && <div className="alert alert-error mb-0">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="username" className="form-label">
                  Username *
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={formData.username}
                  onChange={handleChange}
                  className="form-input"
                  autoComplete="username"
                  autoFocus
                />
              </div>

              {!isLogin && (
                <div>
                  <label htmlFor="email" className="form-label">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="form-input"
                    autoComplete="email"
                  />
                </div>
              )}

              <div>
                <label htmlFor="password" className="form-label">
                  Password *
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="form-input"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
              </div>

              {!isLogin && (
                <div>
                  <label htmlFor="confirmPassword" className="form-label">
                    Confirm password *
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="form-input"
                    autoComplete="new-password"
                  />
                </div>
              )}

              <button type="submit" disabled={loading} className="btn btn-primary w-full">
                {loading ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          Internal use · Cabinet preventive maintenance
        </p>
      </div>
    </div>
  );
}
