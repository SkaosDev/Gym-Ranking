import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Card from '../components/Card.jsx';
import Icon from '../components/Icon.jsx';
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

  /** The server decides; this only shows what it said, next to the field. */
  const errorFor = (name) =>
    fieldErrors[name] ? (
      <span className="field-error" role="alert">
        {fieldErrors[name]}
      </span>
    ) : null;

  const invalid = (name) => (fieldErrors[name] ? 'true' : undefined);

  return (
    <>
      <p className="auth-brand">
        <Icon name="brand" /> GymRank
      </p>

      <Card
        title="Create your account"
        subtitle="Sex, date of birth and bodyweight calibrate your ranks. They stay private: friends only ever see ranks."
      >
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
              aria-invalid={invalid('email')}
              value={form.email}
              onChange={update('email')}
            />
            {errorFor('email')}
          </div>

          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              minLength={3}
              maxLength={20}
              aria-invalid={invalid('username')}
              value={form.username}
              onChange={update('username')}
            />
            <span className="field-hint">
              3 to 20 characters: lowercase letters, digits, underscore or hyphen.
            </span>
            {errorFor('username')}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              aria-invalid={invalid('password')}
              value={form.password}
              onChange={update('password')}
            />
            <span className="field-hint">At least 8 characters.</span>
            {errorFor('password')}
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="sex">Sex</label>
              <select id="sex" value={form.sex} onChange={update('sex')}>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
              <span className="field-hint">Selects which standards apply.</span>
              {errorFor('sex')}
            </div>

            <div className="field">
              <label htmlFor="birth_date">Date of birth</label>
              <input
                id="birth_date"
                type="date"
                required
                max={TODAY}
                aria-invalid={invalid('birth_date')}
                value={form.birth_date}
                onChange={update('birth_date')}
              />
              <span className="field-hint">You must be at least 14.</span>
              {errorFor('birth_date')}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="height_cm">Height (cm)</label>
              <input
                id="height_cm"
                type="number"
                required
                min={100}
                max={250}
                step="0.5"
                aria-invalid={invalid('height_cm')}
                value={form.height_cm}
                onChange={update('height_cm')}
              />
              {errorFor('height_cm')}
            </div>

            <div className="field">
              <label htmlFor="weight_kg">Bodyweight (kg)</label>
              <input
                id="weight_kg"
                type="number"
                required
                min={30}
                max={250}
                step="0.1"
                aria-invalid={invalid('weight_kg')}
                value={form.weight_kg}
                onChange={update('weight_kg')}
              />
              {errorFor('weight_kg')}
            </div>
          </div>

          <button type="submit" className="button--primary" disabled={submitting}>
            {submitting ? 'Creating your account...' : 'Create account'}
          </button>
        </form>
      </Card>

      <p className="auth-alt muted">
        Already have an account? <Link to="/login">Log in</Link>.
      </p>
    </>
  );
}
