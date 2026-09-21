import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import Card from '../components/Card.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(form);
      navigate(location.state?.from ?? '/dashboard', { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <p className="auth-brand">
        <Icon name="brand" /> GymRank
      </p>

      <Card title="Log in">
        {error && (
          <div className="notice notice--error" role="alert">
            <Icon name="warning" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={update('email')}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={update('password')}
            />
          </div>

          <button type="submit" className="button--primary" disabled={submitting}>
            {submitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>
      </Card>

      <p className="auth-alt muted">
        No account yet? <Link to="/signup">Create one</Link>.
      </p>
    </>
  );
}
