import { useCallback, useEffect, useState } from 'react';

import AsyncView from '../components/AsyncView.jsx';
import Card from '../components/Card.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { formatDate, formatKg } from '../lib/format.js';

const TODAY = new Date().toISOString().slice(0, 10);

export default function Profile() {
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [weights, setWeights] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [weighIn, setWeighIn] = useState({ weight_kg: '', measured_at: TODAY });
  const [details, setDetails] = useState({
    height_cm: String(user.height_cm),
    sex: user.sex,
    ranks_visible_to_friends: user.ranks_visible_to_friends,
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await api.get('/me/weights');
      setWeights(data.items);
      setStatus('ready');
    } catch (loadError) {
      setError(loadError.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitWeighIn(event) {
    event.preventDefault();
    setFieldErrors({});
    setSaving(true);
    try {
      await api.post('/me/weights', {
        weight_kg: Number(weighIn.weight_kg),
        measured_at: weighIn.measured_at,
      });
      setWeighIn({ weight_kg: '', measured_at: TODAY });
      await refresh();
      await load();
      // Scores are relative to bodyweight, so this moves ranks on purpose.
      toast.show('Bodyweight saved. Your ranks have been recalculated.');
    } catch (saveError) {
      setFieldErrors(saveError.fields ?? {});
      toast.show(saveError.message, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function submitDetails(event) {
    event.preventDefault();
    setFieldErrors({});
    setSaving(true);
    try {
      await api.patch('/me/profile', {
        height_cm: Number(details.height_cm),
        sex: details.sex,
        ranks_visible_to_friends: details.ranks_visible_to_friends,
      });
      await refresh();
      toast.show('Profile updated.');
    } catch (saveError) {
      setFieldErrors(saveError.fields ?? {});
      toast.show(saveError.message, { tone: 'error' });
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

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Profile</h1>
          <p>The numbers your ranks are calibrated against.</p>
        </div>
      </div>

      <div className="grid stack-bottom">
        <Card title="Log a bodyweight" icon="bodyweight">
          <form onSubmit={submitWeighIn}>
            <div className="field">
              <label htmlFor="weight_kg">Bodyweight (kg)</label>
              <input
                id="weight_kg"
                type="number"
                required
                min={30}
                max={250}
                step="0.1"
                value={weighIn.weight_kg}
                onChange={(event) => setWeighIn({ ...weighIn, weight_kg: event.target.value })}
              />
              {errorFor('weight_kg')}
            </div>
            <div className="field">
              <label htmlFor="measured_at">Date</label>
              <input
                id="measured_at"
                type="date"
                required
                max={TODAY}
                value={weighIn.measured_at}
                onChange={(event) => setWeighIn({ ...weighIn, measured_at: event.target.value })}
              />
              <span className="field-hint">
                One reading per day. Logging again for the same day corrects it.
              </span>
              {errorFor('measured_at')}
            </div>
            <button type="submit" className="button--primary" disabled={saving}>
              <Icon name="confirm" />
              Save bodyweight
            </button>
          </form>

          <p className="muted stat-note">
            Every set is scored against the weight in force on the day you did it, so a new reading
            affects sets from that day onward.
          </p>
        </Card>

        <Card title="Your details" icon="profile">
          <form onSubmit={submitDetails}>
            <div className="field">
              <label htmlFor="height_cm">Height (cm)</label>
              <input
                id="height_cm"
                type="number"
                required
                min={100}
                max={250}
                step="0.5"
                value={details.height_cm}
                onChange={(event) => setDetails({ ...details, height_cm: event.target.value })}
              />
              {errorFor('height_cm')}
            </div>

            <div className="field">
              <label htmlFor="sex">Sex</label>
              <select
                id="sex"
                value={details.sex}
                onChange={(event) => setDetails({ ...details, sex: event.target.value })}
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
              <span className="field-hint">
                Selects which DOTS coefficients and strength standards apply.
              </span>
              {errorFor('sex')}
            </div>

            <div className="field field--checkbox">
              <input
                id="ranks_visible_to_friends"
                type="checkbox"
                checked={details.ranks_visible_to_friends}
                onChange={(event) =>
                  setDetails({ ...details, ranks_visible_to_friends: event.target.checked })
                }
              />
              <label htmlFor="ranks_visible_to_friends">Let friends see my ranks</label>
            </div>
            <span className="field-hint">
              Your bodyweight, loads and notes are never shared, whichever way this is set.
            </span>

            <p className="form-actions">
              <button type="submit" className="button--primary" disabled={saving}>
                <Icon name="confirm" />
                Save details
              </button>
            </p>
          </form>

          <dl className="detail-list">
            <div>
              <dt>Age</dt>
              <dd className="tabular">{user.age}</dd>
            </div>
            <div>
              <dt>Age coefficient</dt>
              <dd className="tabular">&times;{user.age_coefficient}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{formatDate(user.created_at)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card title="Bodyweight history" icon="bodyweight">
        <AsyncView
          status={status}
          error={error}
          onRetry={load}
          loadingLabel="Loading your weigh-ins"
          isEmpty={status === 'ready' && weights.length === 0}
        >
          <div className="table-wrap">
            <table>
              <caption>
                {weights.length} weigh-in{weights.length === 1 ? '' : 's'}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col" className="numeric">
                    Bodyweight
                  </th>
                </tr>
              </thead>
              <tbody>
                {weights.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.measured_at)}</td>
                    <td className="numeric">{formatKg(entry.weight_kg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AsyncView>
      </Card>
    </>
  );
}
