import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import AsyncView from '../components/AsyncView.jsx';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import RankBadge from '../components/RankBadge.jsx';
import { exerciseIcon } from '../components/icons.js';
import { api } from '../lib/api.js';
import { formatDate, formatKg, formatNumber } from '../lib/format.js';

function Figure({ label, value, hint }) {
  return (
    <div className="figure">
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
      {hint && <p className="figure__hint">{hint}</p>}
    </div>
  );
}

function StepCard({ number, step, children }) {
  return (
    <section className="card step-card">
      <span className="step-card__number" aria-hidden="true">
        {number}
      </span>
      <div className="step-card__body">
        <h2 className="card__title">
          <span className="visually-hidden">Step {number}. </span>
          {step.title}
        </h2>
        {step.formula && <p className="formula">{step.formula}</p>}
        {step.note && <p className="muted stat-note">{step.note}</p>}
        {children}
      </div>
    </section>
  );
}

export default function RankExplained() {
  const { perfId } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setNotFound(false);
    try {
      setData(await api.get(`/ranks/explain/${perfId ?? 'latest'}`));
      setStatus('ready');
    } catch (loadError) {
      if (loadError.status === 404) {
        setNotFound(true);
        setStatus('ready');
        return;
      }
      setError(loadError.message);
      setStatus('error');
    }
  }, [perfId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>How this rank is worked out</h1>
          <p>From the weight on the bar to your badge, step by step.</p>
        </div>
      </div>

      <AsyncView status={status} error={error} onRetry={load} loadingLabel="Working through the steps">
        {status === 'ready' && notFound && (
          <EmptyState icon="performances" title="No performance to explain yet">
            Log a set first, then come back here.
          </EmptyState>
        )}

        {status === 'ready' && !notFound && data && (
          <>
            <Card
              title={data.performance.exercise_label}
              faIcon={exerciseIcon(data.performance.exercise_code)}
              subtitle={`${data.performance.weight_kg} kg × ${data.performance.reps} on ${formatDate(data.performance.performed_at)}`}
              className="stack-bottom"
              actions={<Link to="/performances" className="card__link">Pick another set</Link>}
            >
              <dl className="figure-row">
                <Figure
                  label="Bodyweight used"
                  value={formatKg(data.bodyweight.weight_kg)}
                  hint={`Weighed ${formatDate(data.bodyweight.measured_at)}`}
                />
                <Figure
                  label="Counts toward your rank"
                  value={data.counts_toward_rank ? 'Yes' : 'No'}
                />
              </dl>
            </Card>

            <div className="stack">
              {/* 1. Effective load */}
              <StepCard number={1} step={data.steps[0]}>
                <p className="working tabular">{data.steps[0].working}</p>
                <dl className="figure-row">
                  <Figure label="Effective load" value={formatKg(data.steps[0].result_kg)} />
                </dl>
              </StepCard>

              {/* 2. Estimated 1RM */}
              <StepCard number={2} step={data.steps[1]}>
                {data.steps[1].excluded ? (
                  <div className="notice notice--warning">
                    <Icon name="warning" />
                    <span>{data.steps[1].reason}</span>
                  </div>
                ) : (
                  <dl className="figure-row">
                    {data.steps[1].epley && (
                      <Figure
                        label="Epley"
                        value={formatKg(data.steps[1].epley.result_kg)}
                        hint={data.steps[1].epley.formula}
                      />
                    )}
                    {data.steps[1].brzycki && (
                      <Figure
                        label="Brzycki"
                        value={formatKg(data.steps[1].brzycki.result_kg)}
                        hint={data.steps[1].brzycki.formula}
                      />
                    )}
                    <Figure label="Estimated 1RM" value={formatKg(data.steps[1].result_kg)} />
                  </dl>
                )}
              </StepCard>

              {/* 3. Age */}
              <StepCard number={3} step={data.steps[2]}>
                <dl className="figure-row">
                  <Figure label="Age on the day" value={data.steps[2].age} hint={data.steps[2].table} />
                  <Figure label="Coefficient" value={`× ${data.steps[2].coefficient}`} />
                  <Figure label="Adjusted 1RM" value={formatKg(data.steps[2].result_kg)} />
                </dl>
              </StepCard>

              {/* 4. Standards at this bodyweight */}
              <StepCard number={4} step={data.steps[3]}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Level</th>
                        <th scope="col" className="numeric">
                          1RM needed
                        </th>
                        {data.performance.exercise_type === 'bodyweight' && (
                          <th scope="col" className="numeric">
                            or reps at bodyweight
                          </th>
                        )}
                        <th scope="col" className="numeric">
                          Score
                        </th>
                        <th scope="col">Reached</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.steps[3].anchors.map((anchor) => (
                        <tr key={anchor.level}>
                          <td>{anchor.level}</td>
                          <td className="numeric">{formatKg(anchor.kg)}</td>
                          {data.performance.exercise_type === 'bodyweight' && (
                            <td className="numeric">{anchor.bodyweight_reps}</td>
                          )}
                          <td className="numeric">{anchor.index}</td>
                          <td>
                            {anchor.reached ? (
                              <span className="reached">
                                <Icon name="confirm" />
                                <span className="visually-hidden">Reached</span>
                              </span>
                            ) : (
                              <span className="muted" aria-label="Not reached">
                                &mdash;
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </StepCard>

              {/* 5. Index */}
              <StepCard number={5} step={data.steps[4]}>
                {data.steps[4].segment && (
                  <p className="working">
                    Your adjusted 1RM of{' '}
                    <strong className="tabular">{formatKg(data.steps[2].result_kg)}</strong> sits{' '}
                    <strong className="tabular">
                      {formatNumber(data.steps[4].segment.fraction * 100, 1)}%
                    </strong>{' '}
                    of the way from {data.steps[4].segment.from.level} (
                    {formatKg(data.steps[4].segment.from.kg)}, score {data.steps[4].segment.from.index})
                    to {data.steps[4].segment.to.level} ({formatKg(data.steps[4].segment.to.kg)}, score{' '}
                    {data.steps[4].segment.to.index}).
                  </p>
                )}

                <dl className="figure-row">
                  <Figure label="Score" value={`${formatNumber(data.steps[4].result, 1)} / 1000`} />
                </dl>
              </StepCard>

              {/* 6. Rank */}
              <StepCard number={6} step={data.steps[5]}>
                {data.steps[5].result ? (
                  <>
                    <div className="overall__headline">
                      <RankBadge rank={data.steps[5].result} size="lg" />
                    </div>
                    <dl className="figure-row">
                      <Figure
                        label="Division range"
                        value={`${formatNumber(data.steps[5].result.division_min, 0)} – ${formatNumber(data.steps[5].result.division_max, 0)}`}
                      />
                      <Figure
                        label="Position in division"
                        value={`${formatNumber(data.steps[5].result.within_division_pct, 1)}%`}
                      />
                      {data.steps[5].result.next_division && (
                        <Figure
                          label="Next division"
                          value={data.steps[5].result.next_division.label}
                          hint={`from index ${formatNumber(data.steps[5].result.next_division.index, 0)}`}
                        />
                      )}
                    </dl>
                  </>
                ) : (
                  <p className="muted">This set has no rank, for the reason given in step 2.</p>
                )}
              </StepCard>
            </div>
          </>
        )}
      </AsyncView>
    </>
  );
}
