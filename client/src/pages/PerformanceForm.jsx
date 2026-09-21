import { useState } from 'react';

import { api } from '../lib/api.js';

const TODAY = new Date().toISOString().slice(0, 10);

function initialState(exercises, performance) {
  if (performance) {
    return {
      exercise_id: String(performance.exercise_id),
      weight_kg: String(performance.weight_kg),
      reps: String(performance.reps),
      performed_at: performance.performed_at,
      notes: performance.notes ?? '',
    };
  }
  return {
    exercise_id: String(exercises[0]?.id ?? ''),
    weight_kg: '',
    reps: '',
    performed_at: TODAY,
    notes: '',
  };
}

/** Add or edit. The same fields either way; only the verb changes. */
export default function PerformanceForm({ exercises, performance, onSaved, onCancel }) {
  const [form, setForm] = useState(() => initialState(exercises, performance));
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });
  const selected = exercises.find((e) => String(e.id) === form.exercise_id);
  const isBodyweight = selected?.type === 'bodyweight';

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaving(true);

    const payload = {
      exercise_id: Number(form.exercise_id),
      weight_kg: Number(form.weight_kg),
      reps: Number(form.reps),
      performed_at: form.performed_at,
      notes: form.notes.trim() === '' ? null : form.notes.trim(),
    };

    try {
      const saved = performance
        ? await api.patch(`/performances/${performance.id}`, payload)
        : await api.post('/performances', payload);
      onSaved(saved);
    } catch (submitError) {
      setError(submitError.message);
      setFieldErrors(submitError.fields ?? {});
    } finally {
      setSaving(false);
    }
  }

  const fieldError = (name) => fieldErrors[name] && <span role="alert"> {fieldErrors[name]}</span>;

  return (
    <form onSubmit={handleSubmit}>
      <h2>{performance ? 'Edit performance' : 'Log a performance'}</h2>
      {error && <p role="alert">{error}</p>}

      <p>
        <label htmlFor="exercise_id">Exercise</label>
        {fieldError('exercise_id')}
        <br />
        <select id="exercise_id" value={form.exercise_id} onChange={update('exercise_id')}>
          {exercises.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.label}
            </option>
          ))}
        </select>
      </p>

      <p>
        <label htmlFor="weight_kg">{isBodyweight ? 'Added load (kg)' : 'Load (kg)'}</label>
        {fieldError('weight_kg')}
        <br />
        <input
          id="weight_kg"
          type="number"
          required
          step="0.5"
          min={isBodyweight ? -200 : 0}
          max={500}
          value={form.weight_kg}
          onChange={update('weight_kg')}
        />
        <br />
        <small>
          {isBodyweight
            ? 'Your bodyweight is counted automatically. Use 0 for a strict rep, or a negative number for band assistance.'
            : 'The load on the bar.'}
        </small>
      </p>

      <p>
        <label htmlFor="reps">Reps</label>
        {fieldError('reps')}
        <br />
        <input
          id="reps"
          type="number"
          required
          min={1}
          max={100}
          value={form.reps}
          onChange={update('reps')}
        />
        <br />
        <small>Above 12 reps the set is kept but does not count toward your rank.</small>
      </p>

      <p>
        <label htmlFor="performed_at">Date</label>
        {fieldError('performed_at')}
        <br />
        <input
          id="performed_at"
          type="date"
          required
          max={TODAY}
          value={form.performed_at}
          onChange={update('performed_at')}
        />
      </p>

      <p>
        <label htmlFor="notes">Notes</label>
        {fieldError('notes')}
        <br />
        <input
          id="notes"
          type="text"
          maxLength={500}
          value={form.notes}
          onChange={update('notes')}
          placeholder="Optional"
        />
      </p>

      <button type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save'}
      </button>{' '}
      <button type="button" onClick={onCancel} disabled={saving}>
        Cancel
      </button>
    </form>
  );
}
