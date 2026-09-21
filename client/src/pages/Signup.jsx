import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY = {
  email: '',
  username: '',
  password: '',
  sex: 'M',
  birth_date: '',
  height_cm: '',
  weight_kg: '',
};

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await signup({
        ...form,
        height_cm: Number(form.height_cm),
        weight_kg: Number(form.weight_kg),
      });
      navigate('/dashboard', { replace: true });
    } catch (submitError) {
      setError(submitError.message);
      setFieldErrors(submitError.fields ?? {});
    } finally {
      setSubmitting(false);
    }
  }

  /** Server-side validation is authoritative; this only shows it per field. */
  const fieldError = (name) => fieldErrors[name] && <span role="alert"> {fieldErrors[name]}</span>;

  return (
    <section>
      <h1>Create your account</h1>
      <p>
        Your sex, date of birth and bodyweight are needed to calibrate your ranks. They stay
        private: friends only ever see ranks.
      </p>

      {error && <p role="alert">{error}</p>}

      <form onSubmit={handleSubmit}>
        <p>
          <label htmlFor="email">Email</label>
          {fieldError('email')}
          <br />
          <input id="email" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
        </p>
        <p>
          <label htmlFor="username">Username</label>
          {fieldError('username')}
          <br />
          <input
            id="username"
            type="text"
            autoComplete="username"
            required
            minLength={3}
            maxLength={20}
            value={form.username}
            onChange={update('username')}
          />
          <br />
          <small>3 to 20 characters: lowercase letters, digits, underscore or hyphen.</small>
        </p>
        <p>
          <label htmlFor="password">Password</label>
          {fieldError('password')}
          <br />
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={update('password')}
          />
          <br />
          <small>At least 8 characters.</small>
        </p>
        <p>
          <label htmlFor="sex">Sex</label>
          {fieldError('sex')}
          <br />
          <select id="sex" value={form.sex} onChange={update('sex')}>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
          <br />
          <small>Selects which DOTS coefficients and strength standards apply.</small>
        </p>
        <p>
          <label htmlFor="birth_date">Date of birth</label>
          {fieldError('birth_date')}
          <br />
          <input
            id="birth_date"
            type="date"
            required
            max={TODAY}
            value={form.birth_date}
            onChange={update('birth_date')}
          />
          <br />
          <small>You must be at least 14.</small>
        </p>
        <p>
          <label htmlFor="height_cm">Height (cm)</label>
          {fieldError('height_cm')}
          <br />
          <input
            id="height_cm"
            type="number"
            required
            min={100}
            max={250}
            step="0.5"
            value={form.height_cm}
            onChange={update('height_cm')}
          />
        </p>
        <p>
          <label htmlFor="weight_kg">Bodyweight (kg)</label>
          {fieldError('weight_kg')}
          <br />
          <input
            id="weight_kg"
            type="number"
            required
            min={30}
            max={250}
            step="0.1"
            value={form.weight_kg}
            onChange={update('weight_kg')}
          />
        </p>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating your account...' : 'Create account'}
        </button>
      </form>

      <p>
        Already have an account? <Link to="/login">Log in</Link>.
      </p>
    </section>
  );
}
