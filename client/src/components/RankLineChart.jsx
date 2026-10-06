import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ACCENT,
  GRID_STROKE,
  dateAxisProps,
  divisionBands,
  divisionLabel,
  rankAxisProps,
  tooltipProps,
} from './charts.jsx';

/**
 * Lines over time on a rank scale: ticks are divisions ("Gold III"), a
 * coloured dashed line marks where a new rank begins, and the tooltip names
 * the division rather than a number.
 *
 * One line: pass `dataKey` and `name`, drawn in the neutral ink colour.
 * Several: pass `lines` as [{ dataKey, name, color }], with a legend.
 */
export default function RankLineChart({ rows, dataKey, name, lines, thresholds, height = 260 }) {
  const drawn = lines ?? [{ dataKey, name, color: ACCENT }];
  const bands = divisionBands(thresholds);
  const axis = rankAxisProps(
    bands,
    rows.flatMap((row) => drawn.map((line) => row[line.dataKey])),
  );
  const [lo, hi] = axis.domain;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis {...dateAxisProps} />
        <YAxis {...axis} />
        <Tooltip
          {...tooltipProps}
          formatter={(value, lineName) => [divisionLabel(bands, value), lineName]}
        />
        {drawn.length > 1 && <Legend wrapperStyle={{ fontSize: 13 }} />}
        {thresholds
          .filter((t) => t.index > lo && t.index < hi)
          .map((t) => (
            <ReferenceLine
              key={t.rank}
              y={t.index}
              stroke={t.color}
              strokeDasharray="4 4"
              strokeOpacity={0.8}
            />
          ))}
        {drawn.map((line) => (
          <Line
            key={line.dataKey}
            type="stepAfter"
            dataKey={line.dataKey}
            name={line.name}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
