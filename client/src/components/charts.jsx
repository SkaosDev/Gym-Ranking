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
 *    why the strength-index curve is drawn in the ink colour: the coloured
 *    lines behind it are rank thresholds, not other series;
 *  - series colours come from a fixed categorical order, never cycled, and
 *    read on the white chart surface (all above 3:1).
 */
import { formatDateShort } from '../lib/format.js';

export const SERIES_COLORS = [
  '#2f5bff', // blue
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

export const GRID_STROKE = '#e3e6ea';
export const ACCENT = '#14171a';
export const BRAND = '#2f5bff';

const AXIS_BASE = {
  stroke: '#cfd4da',
  tick: { fill: '#5b6470', fontSize: 12 },
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
export const valueAxisProps = { ...AXIS_BASE, width: 60 };

/** Spread onto <Tooltip />. */
export const tooltipProps = {
  contentStyle: {
    background: '#14171a',
    border: 0,
    borderRadius: '8px',
    fontSize: '13px',
    color: '#ffffff',
  },
  labelStyle: { color: '#c4cad1', marginBottom: 4 },
  itemStyle: { color: '#ffffff' },
  cursor: { stroke: '#cfd4da', strokeWidth: 1 },
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
