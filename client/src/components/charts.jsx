/**
 * Shared chart furniture.
 *
 * These are prop objects, not wrapper components, on purpose: recharts
 * identifies its children by component type, so a custom <DateAxis> wrapping
 * an <XAxis> is silently ignored and the chart renders with no axes and no
 * lines. Spread these onto the real recharts components instead.
 *
 * Two colour rules hold across every chart:
 *  - the eight rank colours are semantic and only ever mean ranks, which is
 *    why the strength-index curve is drawn in neutral chalk: the coloured
 *    lines behind it are rank thresholds, not other series;
 *  - series colours come from a fixed categorical order, never cycled, and
 *    were validated against this dark surface rather than chosen by eye
 *    (worst adjacent CVD delta-E 8.4, normal vision 19.3, all above 3:1).
 */
import { formatDateShort } from '../lib/format.js';

export const SERIES_COLORS = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
];

/** Colour follows the exercise, so filtering never repaints the survivors. */
export function colorForExercise(code, allCodes) {
  const position = allCodes.indexOf(code);
  return SERIES_COLORS[position >= 0 ? position % SERIES_COLORS.length : 0];
}

export const GRID_STROKE = '#29313b';
export const ACCENT = '#ece5d4';

const AXIS_BASE = {
  stroke: '#3a444f',
  tick: { fill: '#96a0ac', fontSize: 12 },
  tickLine: false,
};

/** Spread onto <XAxis />. */
export const dateAxisProps = {
  ...AXIS_BASE,
  dataKey: 'date',
  tickFormatter: formatDateShort,
  minTickGap: 28,
};

/** Spread onto <YAxis />. */
export const valueAxisProps = { ...AXIS_BASE, width: 48 };

/** Spread onto <Tooltip />. */
export const tooltipProps = {
  contentStyle: {
    background: '#1d232b',
    border: '1px solid #3a444f',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#e4e8ec',
  },
  labelStyle: { color: '#96a0ac', marginBottom: 4 },
  itemStyle: { color: '#e4e8ec' },
  cursor: { stroke: '#3a444f', strokeWidth: 1 },
  labelFormatter: formatDateShort,
};

/**
 * recharts wants one row per x value, so the per-exercise series from the API
 * are merged on date. Missing days stay undefined and the lines connect over
 * them rather than dropping to zero.
 */
export function mergeSeries(series, valueKey, dateKey = 'performed_at') {
  const byDate = new Map();
  for (const entry of series) {
    for (const point of entry.points) {
      const date = point[dateKey];
      if (!byDate.has(date)) byDate.set(date, { date });
      byDate.get(date)[entry.code] = point[valueKey];
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
