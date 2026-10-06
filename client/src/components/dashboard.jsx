/**
 * Blocks shared by the dashboard, the friends page and a friend's profile.
 */
import { Link } from 'react-router-dom';

import { formatDate, formatKg } from '../lib/format.js';
import Card from './Card.jsx';
import EmptyState from './EmptyState.jsx';
import Icon from './Icon.jsx';
import ProgressBar from './ProgressBar.jsx';
import RankBadge from './RankBadge.jsx';
import { exerciseIcon } from './icons.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The sentence that makes the app engaging is this one, not the badge. */
function NextDivisionLine({ entry }) {
  const next = entry.next_division;
  if (!next) {
    return <p className="next-line next-line--max">Nothing left above this. That is the ceiling.</p>;
  }
  // Push-ups and friends read better as a rep target than as kilograms.
  if (entry.exercise.type === 'bodyweight' && next.bodyweight_reps) {
    return (
      <p className="next-line">
        <strong className="tabular">{next.bodyweight_reps} reps</strong> in one set for {next.label}
      </p>
    );
  }
  return (
    <p className="next-line">
      <strong className="tabular">+{formatKg(next.kg_needed)}</strong> on your best for {next.label}
    </p>
  );
}

/** A row of figure tiles: [{ label, value, hint? }]. */
export function Tiles({ tiles }) {
  return (
    <ul className="tiles stack-bottom">
      {tiles.map((tile) => (
        <li key={tile.label} className="tile">
          <span className="tile__label">{tile.label}</span>
          <span className="tile__value tabular">{tile.value}</span>
          {tile.hint && <span className="tile__hint">{tile.hint}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Attendance figures from /stats/activity, as four tiles. */
export function SummaryTiles({ activity }) {
  const daysSince =
    activity.last_session === null
      ? null
      : Math.round(
          (Date.parse(`${activity.to}T00:00:00Z`) - Date.parse(`${activity.last_session}T00:00:00Z`)) /
            MS_PER_DAY,
        );

  return (
    <Tiles
      tiles={[
        { label: 'Sessions, last 30 days', value: activity.sessions_last_30_days },
        {
          label: 'Week streak',
          value: activity.streak_weeks,
          hint: activity.streak_weeks === 1 ? 'week in a row' : 'weeks in a row',
        },
        { label: 'Sets, last 30 days', value: activity.sets_last_30_days },
        {
          label: 'Last session',
          value: daysSince === null ? '—' : daysSince === 0 ? 'Today' : `${daysSince}d ago`,
          hint: activity.last_session ? formatDate(activity.last_session) : 'Nothing logged yet',
        },
      ]}
    />
  );
}

/**
 * You and your friends, best first. The index orders the list and is never
 * shown: the badge says everything a reader needs.
 */
export function Leaderboard({ me, myOverall, friends, showFriendsLink = true }) {
  const entries = [
    {
      username: me.username,
      isSelf: true,
      rank: myOverall.complete ? myOverall.rank : null,
      index: myOverall.complete ? myOverall.index : null,
    },
    ...friends.map((friend) => ({
      username: friend.username,
      isSelf: false,
      rank: friend.overall?.rank ?? null,
      index: friend.overall?.index ?? null,
      hidden: !friend.ranks_visible,
    })),
  ];
  const ranked = entries.filter((e) => e.index !== null).sort((a, b) => b.index - a.index);
  const unranked = entries.filter((e) => e.index === null);

  return (
    <Card
      title="Leaderboard"
      icon="friends"
      subtitle="You and your friends, by overall rank."
      actions={
        showFriendsLink && (
          <Link to="/friends" className="card__link">
            Friends &rarr;
          </Link>
        )
      }
    >
      {friends.length === 0 ? (
        <EmptyState icon="friends" title="Nobody to compare with yet">
          Add a friend to see how you stack up.
        </EmptyState>
      ) : (
        <ol className="leaderboard">
          {ranked.map((entry, position) => (
            <li key={entry.username} className={`leaderboard__row ${entry.isSelf ? 'is-self' : ''}`}>
              <span className={`leaderboard__pos leaderboard__pos--${position + 1}`}>{position + 1}</span>
              <span className="avatar" aria-hidden="true">
                {entry.username.slice(0, 1).toUpperCase()}
              </span>
              <span className="leaderboard__name">
                {entry.isSelf ? (
                  <>
                    {entry.username} <span className="muted">(you)</span>
                  </>
                ) : (
                  <Link to={`/u/${entry.username}`}>{entry.username}</Link>
                )}
              </span>
              <RankBadge rank={entry.rank} size="sm" />
            </li>
          ))}
          {unranked.map((entry) => (
            <li key={entry.username} className={`leaderboard__row is-unranked ${entry.isSelf ? 'is-self' : ''}`}>
              <span className="leaderboard__pos">&ndash;</span>
              <span className="avatar" aria-hidden="true">
                {entry.username.slice(0, 1).toUpperCase()}
              </span>
              <span className="leaderboard__name">
                {entry.isSelf ? `${entry.username} (you)` : <Link to={`/u/${entry.username}`}>{entry.username}</Link>}
              </span>
              <span className="tag">{entry.hidden ? 'Ranks hidden' : 'No overall rank yet'}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/**
 * Rank per lift, in the /ranks shape ({ exercise, rank, has_data, ... }).
 * `showNext` adds the progress bar and what the next division takes; a
 * friend's profile leaves both out.
 */
export function ExerciseList({ exercises, showNext = true, subtitle }) {
  return (
    <Card
      title="By exercise"
      icon="record"
      subtitle={subtitle ?? 'Your rank on each lift and what the next division takes.'}
    >
      <ul className="lift-list">
        {exercises.map((entry) => (
          <li key={entry.exercise.code} className={`lift ${entry.has_data ? '' : 'lift--empty'}`}>
            <span className="lift__name">
              <Icon icon={exerciseIcon(entry.exercise.code)} fixedWidth />
              {entry.exercise.label}
            </span>
            <span className="lift__rank">
              <RankBadge rank={entry.rank} size="sm" />
            </span>
            {showNext && entry.has_data && (
              <div className="lift__progress">
                <ProgressBar
                  value={entry.rank.within_division_pct}
                  color={entry.rank.color}
                  label={`Progress through ${entry.rank.label}`}
                />
                <NextDivisionLine entry={entry} />
                {entry.decayed && (
                  <p className="decay-note">
                    <Icon name="warning" />
                    <span>
                      Best is {entry.days_since_best} days old: counts for{' '}
                      {Math.round(entry.decay_factor * 100)}% until you train it again.
                    </span>
                  </p>
                )}
              </div>
            )}
            {showNext && !entry.has_data && <p className="lift__progress muted">Log a set to get a rank.</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
