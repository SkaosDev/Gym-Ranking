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
  ResponsiveContainer,
  Legend,
} from 'recharts';

import AsyncView from '../components/AsyncView.jsx';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import RankLineChart from '../components/RankLineChart.jsx';
import {
  BRAND,
  GRID_STROKE,
  SERIES_COLORS,
  colorForExercise,
  dateAxisProps,
  divisionBands,
  divisionLabel,
  mergeSeries,
  tooltipProps,
  valueAxisProps,
} from '../components/charts.jsx';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { onPerformancesChanged } from '../lib/performanceEvents.js';

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
  useEffect(() => onPerformancesChanged(load), [load]);

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

  /** Same filter as the 1RM chart, and the same colour per exercise. */
  const indexShown = useMemo(() => {
    if (!data) return [];
    return selected === 'all' ? data.index.series : data.index.series.filter((s) => s.code === selected);
  }, [data, selected]);

  const indexRows = useMemo(() => mergeSeries(indexShown, 'strength_index'), [indexShown]);

  const indexLines = indexShown.map((series) => ({
    dataKey: series.code,
    name: series.label,
    color: colorForExercise(series.code, codes),
  }));

  /** First and last ranked set, for the one-exercise summary line. */
  const single = indexShown.length === 1 ? indexShown[0].points : null;

  const radarRows = useMemo(
    () =>
      (data?.radar.items ?? []).map((item) => ({
        label: item.label,
        index: item.index,
        rank: item.rank,
      })),
    [data],
  );

  const bands = useMemo(() => (data ? divisionBands(data.index.thresholds) : []), [data]);

  const bodyweightRows = useMemo(() => data?.bodyweight.points ?? [], [data]);
  const hasOverall = bodyweightRows.some((point) => point.overall_index !== null);
  const nothingLogged = data && data.e1rm.series.length === 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Stats</h1>
          <p>How your lifts have moved over time.</p>
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
            Log a few sets in <Link to="/performances">History</Link> and your progress appears
            here.
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
              subtitle="Best set of each day, as the max weight you could lift once."
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

            {/* 2. Rank over time -------------------------------------- */}
            <Card
              title="Rank over time"
              icon="record"
              subtitle="Best set of each day on the rank scale. Dashed lines mark a new rank."
              className="stack-bottom"
            >
              {indexRows.length === 0 ? (
                <p className="muted">No counted sets for this exercise yet.</p>
              ) : (
                <>
                  <RankLineChart
                    rows={indexRows}
                    lines={indexLines}
                    thresholds={data.index.thresholds}
                    height={CHART_HEIGHT + 60}
                  />
                  {single && (
                    <p className="muted stat-note">
                      From {divisionLabel(bands, single[0].strength_index)} to{' '}
                      {divisionLabel(bands, single.at(-1).strength_index)} between{' '}
                      {formatDate(single[0].performed_at)} and {formatDate(single.at(-1).performed_at)}.
                    </p>
                  )}
                </>
              )}
            </Card>

            {/* 3. Radar of current index -------------------------------- */}
            <Card
              title="Where you are strong"
              icon="record"
              subtitle="Current rank per exercise. A dent means a weak spot."
              className="stack-bottom"
            >
              <ResponsiveContainer width="100%" height={CHART_HEIGHT + 40}>
                <RadarChart data={radarRows} outerRadius="72%">
                  <PolarGrid stroke={GRID_STROKE} />
                  <PolarAngleAxis dataKey="label" tick={{ fill: '#5b6470', fontSize: 12 }} />
                  <PolarRadiusAxis domain={[0, 1000]} tick={false} axisLine={false} />
                  <Tooltip
                    {...tooltipProps}
                    labelFormatter={(label) => label}
                    formatter={(value, name, item) => [item.payload.rank ?? 'Not ranked yet', 'Rank']}
                  />
                  <Radar
                    name="Rank"
                    dataKey="index"
                    stroke={BRAND}
                    fill={BRAND}
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </Card>

            {/* 4. Bodyweight and overall index --------------------------- */}
            <Card
              title="Bodyweight and overall rank"
              icon="bodyweight"
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

              <h3 className="chart-subtitle">Overall rank</h3>
              {hasOverall ? (
                <RankLineChart
                  rows={bodyweightRows}
                  dataKey="overall_index"
                  thresholds={data.index.thresholds}
                  name="Overall rank"
                  height={200}
                />
              ) : (
                <p className="muted">
                  Log three of the five main exercises to get an overall rank.
                </p>
              )}

              <p className="muted stat-note">
                Ranks are relative to bodyweight: gaining weight can hold your rank back.
              </p>
            </Card>
          </>
        )}
      </AsyncView>
    </>
  );
}
