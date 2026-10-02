import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import AsyncView from '../components/AsyncView.jsx';
import Card from '../components/Card.jsx';
import Icon from '../components/Icon.jsx';
import { useLogSet } from '../components/LogSet.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import RankBadge from '../components/RankBadge.jsx';
import { exerciseIcon } from '../components/icons.js';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { formatIndex, formatKg, formatNumber } from '../lib/format.js';
import { onPerformancesChanged } from '../lib/performanceEvents.js';

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

function LogButton({ code, label = 'Log', variant = 'quiet', iconOnly = false }) {
  const { openLogSet } = useLogSet();
  return (
    <button
      type="button"
      className={`button--small button--${variant} ${iconOnly ? 'button--icon' : ''}`}
      title={iconOnly ? 'Log a set' : undefined}
      onClick={() => openLogSet(code)}
    >
      <Icon name="add" />
      {iconOnly ? <span className="visually-hidden">Log a set</span> : label}
    </button>
  );
}

function ExerciseCard({ entry }) {
  const { exercise, rank } = entry;

  if (!entry.has_data) {
    return (
      <Card
        title={exercise.label}
        faIcon={exerciseIcon(exercise.code)}
        className="exercise-card exercise-card--empty"
      >
        <div className="row exercise-card__top">
          <RankBadge rank={null} />
          <LogButton code={exercise.code} label="Log a set" variant="soft" />
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={exercise.label}
      faIcon={exerciseIcon(exercise.code)}
      accent={rank.color}
      className="exercise-card"
      actions={<LogButton code={exercise.code} iconOnly />}
    >
      <div className="row exercise-card__top">
        <RankBadge rank={rank} />
        <span className="tabular exercise-card__index">
          {formatIndex(entry.effective_index)}
          <span className="muted"> / 1000</span>
        </span>
      </div>

      <ProgressBar
        value={rank.within_division_pct}
        color={rank.color}
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
  useEffect(() => onPerformancesChanged(load), [load]);

  const overall = ranks?.overall;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Hi, {user.username}</h1>
          <p>
            Your strength ranks. <Link to="/rank-explained">How ranks work &rarr;</Link>
          </p>
        </div>
      </div>

      <AsyncView status={status} error={error} onRetry={load} loadingLabel="Working out your ranks">
        {status === 'ready' && (
          <>
            {overall.complete ? (
              <section
                className="hero"
                style={{ '--hero-color': overall.rank.color }}
                aria-labelledby="overall-title"
              >
                <div className="hero__main">
                  <p className="hero__eyebrow" id="overall-title">
                    Overall rank
                  </p>
                  <RankBadge rank={overall.rank} size="lg" />
                  <p className="hero__meaning">{overall.rank.meaning}</p>
                </div>
                <div className="hero__score">
                  <span className="hero__number tabular">{formatIndex(overall.index)}</span>
                  <span className="hero__max">/ 1000</span>
                </div>
                <div className="hero__progress">
                  <ProgressBar
                    value={overall.rank.within_division_pct}
                    color={overall.rank.color}
                    label={`Progress through ${overall.rank.label}`}
                    caption={
                      overall.rank.next_division ? (
                        <>
                          <strong className="tabular">
                            {formatNumber(overall.rank.next_division.index_needed, 0)} pts
                          </strong>{' '}
                          to {overall.rank.next_division.label}
                        </>
                      ) : (
                        'You are at the top of the scale.'
                      )
                    }
                  />
                </div>
              </section>
            ) : (
              <section className="hero hero--setup" aria-labelledby="setup-title">
                <div className="hero__main">
                  <p className="hero__eyebrow">Overall rank</p>
                  <h2 id="setup-title" className="hero__title">
                    Log {overall.required_exercises - overall.exercises_with_data} more exercise
                    {overall.required_exercises - overall.exercises_with_data === 1 ? '' : 's'} to
                    unlock it
                  </h2>
                  <ProgressBar
                    value={(overall.exercises_with_data / overall.required_exercises) * 100}
                    label="Exercises logged"
                    caption={`${overall.exercises_with_data} of ${overall.required_exercises} done`}
                  />
                </div>
                <ul className="checklist">
                  {ranks.exercises
                    .filter((entry) => entry.exercise.global_weight > 0)
                    .map((entry) => (
                      <li
                        key={entry.exercise.code}
                        className={`checklist__item ${entry.has_data ? 'is-done' : ''}`}
                      >
                        <span className="checklist__mark" aria-hidden="true">
                          {entry.has_data && <Icon name="confirm" />}
                        </span>
                        <span className="checklist__label">
                          {entry.exercise.label}
                          <span className="visually-hidden">
                            {entry.has_data ? ' (done)' : ' (to do)'}
                          </span>
                        </span>
                        {!entry.has_data && <LogButton code={entry.exercise.code} variant="soft" />}
                      </li>
                    ))}
                </ul>
              </section>
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
