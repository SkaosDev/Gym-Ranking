import { useState } from 'react';

import Icon from '../components/Icon.jsx';
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
  const selected = exercises.find((exercise) => String(exercise.id) === form.exercise_id);
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

  const errorFor = (name) =>
    fieldErrors[name] ? (
      <span className="field-error" role="alert">
        {fieldErrors[name]}
      </span>
    ) : null;

  const invalid = (name) => (fieldErrors[name] ? 'true' : undefined);

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="notice notice--error" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}

      <div className="field-row">
        <div className="field">
          <label htmlFor="exercise_id">Exercise</label>
          <select id="exercise_id" value={form.exercise_id} onChange={update('exercise_id')}>
            {exercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.label}
              </option>
            ))}
          </select>
          {errorFor('exercise_id')}
        </div>

        <div className="field">
          <label htmlFor="performed_at">Date</label>
          <input
            id="performed_at"
            type="date"
            required
            max={TODAY}
            aria-invalid={invalid('performed_at')}
            value={form.performed_at}
            onChange={update('performed_at')}
          />
          {errorFor('performed_at')}
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="weight_kg">{isBodyweight ? 'Added load (kg)' : 'Load (kg)'}</label>
          <input
            id="weight_kg"
            type="number"
            required
            step="0.5"
            min={isBodyweight ? -200 : 0}
            max={500}
            aria-invalid={invalid('weight_kg')}
            value={form.weight_kg}
            onChange={update('weight_kg')}
          />
          <span className="field-hint">
            {isBodyweight
              ? 'Your bodyweight counts automatically. Use 0 for a strict rep, or a negative number for band assistance.'
              : 'The load on the bar.'}
          </span>
          {errorFor('weight_kg')}
        </div>

        <div className="field">
          <label htmlFor="reps">Reps</label>
          <input
            id="reps"
            type="number"
            required
            min={1}
            max={100}
            aria-invalid={invalid('reps')}
            value={form.reps}
            onChange={update('reps')}
          />
          <span className="field-hint">Above 12 reps the set is kept but does not count.</span>
          {errorFor('reps')}
        </div>
      </div>

      <div className="field">
        <label htmlFor="notes">Notes</label>
        <input
          id="notes"
          type="text"
          maxLength={500}
          value={form.notes}
          onChange={update('notes')}
          placeholder="Optional"
        />
        {errorFor('notes')}
      </div>

      <div className="row">
        <button type="submit" className="button--primary" disabled={saving}>
          <Icon name="confirm" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
