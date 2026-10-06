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

// ---------------------------------------------------------------------------
// Rank axis: the index drives the line, but the reader only ever sees ranks.
// ---------------------------------------------------------------------------

const DIVISIONS = ['IV', 'III', 'II', 'I'];
const MAX_INDEX = 1000;

/**
 * Every division as { start, end, label, color }, built from the API's rank
 * thresholds (each rank's lower bound, Iron excluded since it starts at 0).
 */
export function divisionBands(thresholds) {
  const ranks = [
    { name: 'Iron', start: 0, color: '#6b7280' },
    ...thresholds.map((t) => ({ name: t.abbreviation, start: t.index, color: t.color })),
  ];
  return ranks.flatMap((rank, i) => {
    const end = ranks[i + 1]?.start ?? MAX_INDEX + 1;
    const span = (end - rank.start) / DIVISIONS.length;
    return DIVISIONS.map((division, slot) => ({
      start: rank.start + slot * span,
      end: rank.start + (slot + 1) * span,
      label: `${rank.name} ${division}`,
      rank: rank.name,
      firstOfRank: slot === 0,
      color: rank.color,
    }));
  });
}

/** "Gold II" for an index, or an em dash for nothing. */
export function divisionLabel(bands, value) {
  if (value === null || value === undefined) return '—';
  const band = bands.find((b) => value < b.end) ?? bands.at(-1);
  return band.label;
}

/** Above this many divisions, ticks mark whole ranks instead. */
const MAX_DIVISION_TICKS = 10;

/**
 * <YAxis /> props that zoom on the divisions the data actually crosses and
 * label each tick with the division starting there, or with the rank when
 * the data spans too many divisions to label them all.
 */
export function rankAxisProps(bands, values) {
  const present = values.filter((v) => v !== null && v !== undefined);
  const lo = present.length ? Math.min(...present) : 0;
  const hi = present.length ? Math.max(...present) : MAX_INDEX;
  const first = bands.findIndex((b) => lo < b.end);
  const last = bands.findIndex((b) => hi < b.end);
  const shown = bands.slice(Math.max(0, first), (last === -1 ? bands.length - 1 : last) + 1);
  const domainTop = Math.min(MAX_INDEX, shown.at(-1).end);
  const coarse = shown.length > MAX_DIVISION_TICKS;
  const ticked = coarse ? shown.filter((b) => b.firstOfRank) : shown;

  return {
    ...AXIS_BASE,
    width: 96,
    type: 'number',
    domain: [shown[0].start, domainTop],
    ticks: ticked.map((b) => b.start),
    interval: 0,
    tickFormatter: (value) => {
      const band = bands.find((b) => value < b.end) ?? bands.at(-1);
      return coarse ? band.rank : band.label;
    },
  };
}
