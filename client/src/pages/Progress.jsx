import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import AsyncView from '../components/AsyncView.jsx';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import {
  ACCENT,
  GRID_STROKE,
  SERIES_COLORS,
  colorForExercise,
  dateAxisProps,
  mergeSeries,
  tooltipProps,
  valueAxisProps,
} from '../components/charts.jsx';
import { api } from '../lib/api.js';
import { formatDate, formatNumber } from '../lib/format.js';

const CHART_HEIGHT = 260;

export default function Progress() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState('all');

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [e1rm, index, radar, bodyweight] = await Promise.all([
        api.get('/stats/e1rm'),
        api.get('/stats/index'),
        api.get('/stats/radar'),
        api.get('/stats/bodyweight'),
      ]);
      setData({ e1rm, index, radar, bodyweight });
      setStatus('ready');
    } catch (loadError) {
      setError(loadError.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const codes = useMemo(() => data?.e1rm.series.map((s) => s.code) ?? [], [data]);

  const e1rmRows = useMemo(() => {
    if (!data) return [];
    const series =
      selected === 'all' ? data.e1rm.series : data.e1rm.series.filter((s) => s.code === selected);
    return mergeSeries(series, 'e1rm_kg');
  }, [data, selected]);

  const e1rmShown = useMemo(() => {
    if (!data) return [];
    return selected === 'all' ? data.e1rm.series : data.e1rm.series.filter((s) => s.code === selected);
  }, [data, selected]);

  /** The index chart shows one exercise: seven curves behind seven coloured
   *  threshold lines would be unreadable. */
  const indexSeries = useMemo(() => {
    if (!data || data.index.series.length === 0) return null;
    if (selected !== 'all') {
      return data.index.series.find((s) => s.code === selected) ?? null;
    }
    return data.index.series.reduce((a, b) => (b.points.length > a.points.length ? b : a));
  }, [data, selected]);

  const indexRows = useMemo(
    () =>
      (indexSeries?.points ?? []).map((point) => ({
        date: point.performed_at,
        strength_index: point.strength_index,
      })),
    [indexSeries],
  );

  const radarRows = useMemo(
    () =>
      (data?.radar.items ?? []).map((item) => ({
        label: item.label,
        index: item.index,
      })),
    [data],
  );

  const bodyweightRows = useMemo(() => data?.bodyweight.points ?? [], [data]);
  const hasOverall = bodyweightRows.some((point) => point.overall_index !== null);
  const nothingLogged = data && data.e1rm.series.length === 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Progress</h1>
          <p>How your estimated maxes and your strength index have moved over time.</p>
        </div>
      </div>

      <AsyncView
        status={status}
        error={error}
        onRetry={load}
        loadingLabel="Drawing your charts"
        isEmpty={Boolean(nothingLogged)}
        empty={
          <EmptyState icon="progress" title="No history to chart yet">
            Charts need a few sets to say anything. <Link to="/performances">Log some training</Link>{' '}
            and your progress appears here.
          </EmptyState>
        }
      >
        {status === 'ready' && !nothingLogged && (
          <>
            <div className="filters">
              <div className="field">
                <label htmlFor="exercise-filter">Exercise</label>
                <select
                  id="exercise-filter"
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  <option value="all">All exercises</option>
                  {data.e1rm.series.map((series) => (
                    <option key={series.code} value={series.code}>
                      {series.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 1. Estimated 1RM over time ------------------------------- */}
            <Card
              title="Estimated one-rep max"
              icon="progress"
              subtitle="The best set of each training day, converted to a one-rep max."
              className="stack-bottom"
            >
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart data={e1rmRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  <XAxis {...dateAxisProps} />
                  <YAxis {...valueAxisProps} unit=" kg" />
                  <Tooltip {...tooltipProps} />
                  {e1rmShown.length > 1 && <Legend wrapperStyle={{ fontSize: 13 }} />}
                  {e1rmShown.map((series) => (
                    <Line
                      key={series.code}
                      type="monotone"
                      dataKey={series.code}
                      name={series.label}
                      stroke={colorForExercise(series.code, codes)}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* 2. Strength index against the rank thresholds ------------- */}
            <Card
              title={`Strength index — ${indexSeries?.label ?? ''}`}
              icon="record"
              subtitle={
                selected === 'all'
                  ? 'Showing the exercise with the most history. Pick one above to change it.'
                  : 'Coloured lines are the rank thresholds.'
              }
              className="stack-bottom"
            >
              {indexRows.length === 0 ? (
                <p className="muted">No counted sets for this exercise yet.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={CHART_HEIGHT + 40}>
                    <LineChart data={indexRows} margin={{ top: 8, right: 56, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                      <XAxis {...dateAxisProps} />
                      <YAxis {...valueAxisProps} domain={[0, 1000]} ticks={[0, 250, 500, 750, 1000]} />
                      <Tooltip {...tooltipProps} />
                      {data.index.thresholds.map((threshold) => (
                        <ReferenceLine
                          key={threshold.rank}
                          y={threshold.index}
                          stroke={threshold.color}
                          strokeDasharray="4 4"
                          strokeOpacity={0.65}
                          label={{
                            value: threshold.abbreviation,
                            position: 'right',
                            fill: threshold.color,
                            fontSize: 11,
                          }}
                        />
                      ))}
                      {/* Neutral on purpose: the colours here mean ranks. */}
                      <Line
                        type="monotone"
                        dataKey="strength_index"
                        name="Strength index"
                        stroke={ACCENT}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="muted stat-note">
                    From {formatNumber(indexRows[0].strength_index, 0)} to{' '}
                    {formatNumber(indexRows.at(-1).strength_index, 0)} between{' '}
                    {formatDate(indexRows[0].date)} and {formatDate(indexRows.at(-1).date)}.
                  </p>
                </>
              )}
            </Card>

            {/* 3. Radar of current index -------------------------------- */}
            <Card
              title="Where you are strong"
              icon="record"
              subtitle="Current index per exercise, so an imbalance shows at a glance."
              className="stack-bottom"
            >
              <ResponsiveContainer width="100%" height={CHART_HEIGHT + 40}>
                <RadarChart data={radarRows} outerRadius="72%">
                  <PolarGrid stroke={GRID_STROKE} />
                  <PolarAngleAxis dataKey="label" tick={{ fill: '#96a0ac', fontSize: 12 }} />
                  <PolarRadiusAxis
                    domain={[0, 1000]}
                    tickCount={5}
                    tick={{ fill: '#6b7682', fontSize: 11 }}
                    axisLine={false}
                  />
                  <Tooltip {...tooltipProps} labelFormatter={(label) => label} />
                  <Radar
                    name="Strength index"
                    dataKey="index"
                    stroke={ACCENT}
                    fill={ACCENT}
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </Card>

            {/* 4. Bodyweight and overall index --------------------------- */}
            <Card
              title="Bodyweight and overall index"
              icon="bodyweight"
              subtitle="Two panels on one timeline rather than two scales on one axis, so nothing appears to cross that did not."
            >
              <h3 className="chart-subtitle">Bodyweight</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={bodyweightRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  <XAxis {...dateAxisProps} />
                  <YAxis {...valueAxisProps} unit=" kg" domain={['dataMin - 2', 'dataMax + 2']} />
                  <Tooltip {...tooltipProps} />
                  <Line
                    type="monotone"
                    dataKey="weight_kg"
                    name="Bodyweight"
                    stroke={SERIES_COLORS[0]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>

              <h3 className="chart-subtitle">Overall index</h3>
              {hasOverall ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={bodyweightRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis {...dateAxisProps} />
                    <YAxis {...valueAxisProps} domain={[0, 1000]} ticks={[0, 250, 500, 750, 1000]} />
                    <Tooltip {...tooltipProps} />
                    <Line
                      type="monotone"
                      dataKey="overall_index"
                      name="Overall index"
                      stroke={ACCENT}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="muted">
                  An overall index needs three of the five weighted exercises logged.
                </p>
              )}

              <p className="muted stat-note">
                Scores are relative to bodyweight, so gaining weight can hold the index back even
                while the bar gets heavier.
              </p>
            </Card>
          </>
        )}
      </AsyncView>
    </>
  );
}
