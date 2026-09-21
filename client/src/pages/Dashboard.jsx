import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import AsyncView from '../components/AsyncView.jsx';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import RankBadge from '../components/RankBadge.jsx';
import { exerciseIcon } from '../components/icons.js';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { formatDate, formatKg } from '../lib/format.js';

/**
 * Until the ranks endpoint lands, the dashboard shows what is already true:
 * the profile the ranks are calibrated against, and the most recent sets with
 * the rank each one earned.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const [recent, setRecent] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/performances?per_page=5&sort=date_desc')
      .then((data) => {
        if (cancelled) return;
        setRecent(data.items);
        setStatus('ready');
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError.message);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Welcome back, {user.username}</h1>
          <p>
            Your ranks are calibrated to your sex, bodyweight and age, so the same lift means
            different things for different people.
          </p>
        </div>
      </div>

      <div className="grid stack-bottom">
        <Card title="Bodyweight" icon="bodyweight">
          <p className="stat tabular">{formatKg(user.current_weight_kg)}</p>
          <p className="muted stat-note">Weighed {formatDate(user.weighed_at)}</p>
        </Card>

        <Card title="Age coefficient" icon="info">
          <p className="stat tabular">&times;{user.age_coefficient}</p>
          <p className="muted stat-note">
            Applied at age {user.age}.{' '}
            {user.age_coefficient === 1
              ? 'Between 24 and 39 no adjustment applies.'
              : 'Published tables compensate for age.'}
          </p>
        </Card>

        <Card title="Height" icon="profile">
          <p className="stat tabular">{user.height_cm} cm</p>
          <p className="muted stat-note">
            <Link to="/profile">See your profile</Link>
          </p>
        </Card>
      </div>

      <Card
        title="Recent sets"
        icon="performances"
        actions={
          <Link to="/performances" className="card__link">
            All performances
          </Link>
        }
      >
        <AsyncView
          status={status}
          error={error}
          loadingLabel="Loading your recent sets"
          isEmpty={status === 'ready' && recent.length === 0}
          empty={
            <EmptyState
              icon="record"
              title="Nothing logged yet"
              action={
                <Link to="/performances" className="button--primary button-link">
                  <Icon name="add" />
                  Log your first set
                </Link>
              }
            >
              One set is enough to get a rank. The first ranks come quickly; the top is meant to
              stay out of reach.
            </EmptyState>
          }
        >
          <ul className="recent-list">
            {recent.map((row) => (
              <li key={row.id}>
                <span className="cell-with-icon">
                  <Icon icon={exerciseIcon(row.exercise_code)} fixedWidth />
                  <span>
                    <strong>{row.exercise_label}</strong>
                    <span className="muted"> &middot; {formatDate(row.performed_at)}</span>
                  </span>
                </span>
                <RankBadge rank={row.rank} size="sm" />
              </li>
            ))}
          </ul>
        </AsyncView>
      </Card>
    </>
  );
}
