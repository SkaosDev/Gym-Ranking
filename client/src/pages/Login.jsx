import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

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
    <section>
      <h1>Log in</h1>

      {error && <p role="alert">{error}</p>}

      <form onSubmit={handleSubmit}>
        <p>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={update('email')}
          />
        </p>
        <p>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={update('password')}
          />
        </p>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <p>
        No account yet? <Link to="/signup">Create one</Link>.
      </p>
    </section>
  );
}
