import { formatDate } from '../lib/format.js';
import './ActivityGrid.css';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKS = 53;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

const isoOf = (time) => new Date(time).toISOString().slice(0, 10);

/** 0 for a rest day, then four steps by how many sets were logged. */
function levelFor(sets) {
  if (!sets) return 0;
  if (sets < 6) return 1;
  if (sets < 10) return 2;
  if (sets < 15) return 3;
  return 4;
}

/**
 * A year of training days, one square per day, one column per week
 * (Monday on top), like a GitHub contribution graph.
 */
export default function ActivityGrid({ days, to }) {
  const setsByDate = new Map(days.map((day) => [day.date, day.sets]));

  const end = Date.parse(`${to}T00:00:00Z`);
  const endMonday = end - ((new Date(end).getUTCDay() + 6) % 7) * MS_PER_DAY;
  const start = endMonday - (WEEKS - 1) * 7 * MS_PER_DAY;

  const weeks = [];
  for (let week = 0; week < WEEKS; week += 1) {
    const monday = start + week * 7 * MS_PER_DAY;
    const cells = [];
    for (let day = 0; day < 7; day += 1) {
      const time = monday + day * MS_PER_DAY;
      const date = isoOf(time);
      cells.push({ date, future: time > end, sets: setsByDate.get(date) ?? 0 });
    }
    // Label a column with the month whose first day falls in it.
    const firstOfMonth = cells.find((cell) => cell.date.endsWith('-01'));
    weeks.push({
      monday: isoOf(monday),
      cells,
      month: firstOfMonth && week > 0 ? MONTHS[Number(firstOfMonth.date.slice(5, 7)) - 1] : null,
    });
  }

  return (
    <div className="activity">
      <div className="activity__scroll">
        <div className="activity__grid" role="img" aria-label="Training days over the last year">
          <div className="activity__days" aria-hidden="true">
            <span />
            {DAY_LABELS.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week.monday} className="activity__week">
              <span className="activity__month" aria-hidden="true">
                {week.month}
              </span>
              {week.cells.map((cell) =>
                cell.future ? (
                  <span key={cell.date} className="activity__cell activity__cell--future" />
                ) : (
                  <span
                    key={cell.date}
                    className={`activity__cell activity__cell--${levelFor(cell.sets)}`}
                    title={
                      cell.sets
                        ? `${cell.sets} set${cell.sets === 1 ? '' : 's'} on ${formatDate(cell.date)}`
                        : `Rest day, ${formatDate(cell.date)}`
                    }
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="activity__legend" aria-hidden="true">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className={`activity__cell activity__cell--${level}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
