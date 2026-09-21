import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import AsyncView from '../components/AsyncView.jsx';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import RankBadge from '../components/RankBadge.jsx';
import { exerciseIcon } from '../components/icons.js';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { formatIndex, formatKg, formatNumber } from '../lib/format.js';

/** The sentence that makes the app engaging is this one, not the badge. */
function NextDivisionLine({ entry }) {
  if (!entry.next_division) {
    return <p className="next-line next-line--max">Nothing left above this. That is the ceiling.</p>;
  }
  return (
    <p className="next-line">
      <strong className="tabular">{formatKg(entry.next_division.kg_needed)}</strong> to{' '}
      {entry.next_division.label}
    </p>
  );
}

function ExerciseCard({ entry }) {
  const { exercise, rank } = entry;

  if (!entry.has_data) {
    return (
      <Card title={exercise.label} faIcon={exerciseIcon(exercise.code)}>
        <RankBadge rank={null} />
        <p className="muted stat-note">
          No set logged yet. <Link to="/performances">Log one</Link> to get a rank.
        </p>
      </Card>
    );
  }

  return (
    <Card title={exercise.label} faIcon={exerciseIcon(exercise.code)} accent={rank.color}>
      <div className="row exercise-card__top">
        <RankBadge rank={rank} />
        <span className="muted tabular exercise-card__index">
          {formatIndex(entry.effective_index)}
          <span className="muted"> / 1000</span>
        </span>
      </div>

      <ProgressBar
        value={rank.within_division_pct}
        color={rank.color}
        gradient={rank.gradient}
        label={`Progress through ${rank.label}`}
      />

      <NextDivisionLine entry={entry} />

      {entry.decayed && (
        <p className="decay-note">
          <Icon name="warning" />
          <span>
            Your best here is {entry.days_since_best} days old, so it counts for{' '}
            {Math.round(entry.decay_factor * 100)}% until you train it again.
          </span>
        </p>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [ranks, setRanks] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      setRanks(await api.get('/ranks'));
      setStatus('ready');
    } catch (loadError) {
      setError(loadError.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const overall = ranks?.overall;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Welcome back, {user.username}</h1>
          <p>
            Ranks are absolute: they depend on your sex, bodyweight and age, never on anybody
            else&rsquo;s results.
          </p>
        </div>
      </div>

      <AsyncView status={status} error={error} onRetry={load} loadingLabel="Working out your ranks">
        {status === 'ready' && (
          <>
            {overall.complete ? (
              <Card
                className="overall stack-bottom"
                accent={overall.rank.color}
                title="Overall rank"
                icon="record"
                actions={
                  <Link to="/rank-explained" className="card__link">
                    How is this worked out?
                  </Link>
                }
              >
                <div className="overall__headline">
                  <RankBadge rank={overall.rank} size="lg" />
                  <span className="overall__index tabular">
                    {formatIndex(overall.index)}
                    <span className="muted"> / 1000</span>
                  </span>
                </div>

                <ProgressBar
                  value={overall.rank.within_division_pct}
                  color={overall.rank.color}
                  gradient={overall.rank.gradient}
                  label={`Progress through ${overall.rank.label}`}
                  caption={
                    overall.rank.next_division
                      ? `${formatNumber(overall.rank.next_division.index_needed, 0)} index points to ${overall.rank.next_division.label}.`
                      : 'You are at the top of the scale.'
                  }
                />

                <p className="muted stat-note">
                  Weighted mean of {overall.contributions.map((c) => c.label).join(', ')}.
                </p>
              </Card>
            ) : (
              <Card className="stack-bottom" title="Overall rank" icon="record">
                <EmptyState
                  icon="info"
                  title={`${overall.exercises_with_data} of ${overall.required_exercises} exercises logged`}
                >
                  An overall rank needs at least {overall.required_exercises} of the{' '}
                  {overall.weighted_exercises} weighted exercises. Still to log:{' '}
                  {overall.missing.map((m) => m.label).join(', ')}.
                </EmptyState>
              </Card>
            )}

            <h2 className="section-heading">By exercise</h2>
            <div className="grid">
              {ranks.exercises.map((entry) => (
                <ExerciseCard key={entry.exercise.code} entry={entry} />
              ))}
            </div>
          </>
        )}
      </AsyncView>
    </>
  );
}
