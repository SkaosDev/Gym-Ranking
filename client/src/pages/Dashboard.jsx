import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import ActivityGrid from '../components/ActivityGrid.jsx';
import AsyncView from '../components/AsyncView.jsx';
import Card from '../components/Card.jsx';
import Icon from '../components/Icon.jsx';
import { useLogSet } from '../components/LogSet.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import RankBadge from '../components/RankBadge.jsx';
import RankLineChart from '../components/RankLineChart.jsx';
import { ExerciseList, Leaderboard, SummaryTiles } from '../components/dashboard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { formatKg } from '../lib/format.js';
import { onPerformancesChanged } from '../lib/performanceEvents.js';

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

/**
 * The weighted barbell lift closest to its own next division, in kilograms.
 * It moves that lift up a division; the overall follows from the lifts.
 * Bodyweight lifts are left out: their target reads as reps, not a plate.
 */
function quickestStep(exercises) {
  return exercises
    .filter(
      (entry) =>
        entry.exercise.global_weight > 0 &&
        entry.exercise.type === 'external' &&
        entry.next_division?.kg_needed > 0,
    )
    .reduce((best, entry) => (!best || entry.next_division.kg_needed < best.next_division.kg_needed ? entry : best), null);
}

function OverallHero({ ranks }) {
  const { overall } = ranks;
  const next = overall.rank.next_division;
  const step = quickestStep(ranks.exercises);

  return (
    <section className="hero" style={{ '--hero-color': overall.rank.color }} aria-labelledby="overall-title">
      <RankBadge rank={overall.rank} size="lg" layout="stack" />
      <div className="hero__main">
        <p className="hero__eyebrow" id="overall-title">
          Overall rank
        </p>
        <p className="hero__meaning">{overall.rank.meaning}</p>
        <div className="hero__progress">
          <ProgressBar
            value={overall.rank.within_division_pct}
            color={overall.rank.color}
            label={`Progress through ${overall.rank.label}`}
            caption={
              next ? (
                <>
                  <strong className="tabular">{Math.floor(overall.rank.within_division_pct)}%</strong> of the way
                  to <strong>{next.label}</strong>
                </>
              ) : (
                'You are at the top of the scale.'
              )
            }
          />
        </div>
        {step && (
          <p className="hero__step">
            <Icon name="record" />
            <span>
              Closest step: <strong className="tabular">+{formatKg(step.next_division.kg_needed)}</strong> on your{' '}
              {step.exercise.label} takes it to {step.next_division.label}.
            </span>
          </p>
        )}
      </div>
    </section>
  );
}

function SetupHero({ ranks }) {
  const { overall } = ranks;
  const missing = overall.required_exercises - overall.exercises_with_data;
  return (
    <section className="hero hero--setup" aria-labelledby="setup-title">
      <div className="hero__main">
        <p className="hero__eyebrow">Overall rank</p>
        <h2 id="setup-title" className="hero__title">
          Log {missing} more exercise{missing === 1 ? '' : 's'} to unlock it
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
            <li key={entry.exercise.code} className={`checklist__item ${entry.has_data ? 'is-done' : ''}`}>
              <span className="checklist__mark" aria-hidden="true">
                {entry.has_data && <Icon name="confirm" />}
              </span>
              <span className="checklist__label">
                {entry.exercise.label}
                <span className="visually-hidden">{entry.has_data ? ' (done)' : ' (to do)'}</span>
              </span>
              {!entry.has_data && <LogButton code={entry.exercise.code} variant="soft" />}
            </li>
          ))}
      </ul>
    </section>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [ranks, friends, activity, timeline] = await Promise.all([
        api.get('/ranks'),
        api.get('/friends'),
        api.get('/stats/activity'),
        api.get('/stats/bodyweight'),
      ]);
      setData({ ranks, friends: friends.friends, activity, timeline });
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

  const timelineRows = useMemo(
    () => (data?.timeline.points ?? []).filter((point) => point.overall_index !== null),
    [data],
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Hi, {user.username}</h1>
          <p>
            Your training at a glance. <Link to="/rank-explained">How ranks work &rarr;</Link>
          </p>
        </div>
      </div>

      <AsyncView status={status} error={error} onRetry={load} loadingLabel="Working out your ranks">
        {status === 'ready' && (
          <>
            {data.ranks.overall.complete ? <OverallHero ranks={data.ranks} /> : <SetupHero ranks={data.ranks} />}

            <SummaryTiles activity={data.activity} />

            {/* The lifts are the core of the app, so they come first, with the
                social and the trend beside them rather than after. */}
            <div className="grid grid--2 dashboard-split stack-bottom">
              <ExerciseList exercises={data.ranks.exercises} />

              <div className="dashboard-side">
                <Leaderboard me={user} myOverall={data.ranks.overall} friends={data.friends} />

                <Card
                  title="Progression"
                  icon="progress"
                  subtitle="Your overall rank over time."
                  className="card--fill"
                  actions={
                    <Link to="/progress" className="card__link">
                      Stats &rarr;
                    </Link>
                  }
                >
                  {timelineRows.length > 1 ? (
                    <div className="chart-fill">
                      <RankLineChart
                        rows={timelineRows}
                        dataKey="overall_index"
                        thresholds={data.timeline.thresholds}
                        name="Overall rank"
                        height="100%"
                      />
                    </div>
                  ) : (
                    <p className="muted">Your progression appears here once you have an overall rank.</p>
                  )}
                </Card>
              </div>
            </div>

            <Card
              title="Attendance"
              icon="dashboard"
              subtitle={`${data.activity.days.length} training day${data.activity.days.length === 1 ? '' : 's'} in the last year.`}
              className="stack-bottom"
            >
              <ActivityGrid days={data.activity.days} to={data.activity.to} />
            </Card>
          </>
        )}
      </AsyncView>
    </>
  );
}
