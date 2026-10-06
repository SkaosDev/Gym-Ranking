import { useId } from 'react';

import './RankBadge.css';

const SHIELD = 'M16 1.5 29.5 6.5V17c0 8.6-6 14.6-13.5 17.5C8.5 31.6 2.5 25.6 2.5 17V6.5Z';
const RIM = 'M16 4.6 27 8.7V17c0 7.1-4.8 12.2-11 14.8C9.8 29.2 5 24.1 5 17V8.7Z';

/** n chevrons stacked around the centre of the shield. */
function Chevrons({ count }) {
  const gap = 5.5;
  const top = 18 - ((count - 1) * gap) / 2 - 2;
  return Array.from({ length: count }, (_, i) => (
    <path key={i} d={`M10 ${top + i * gap}l6 4 6-4`} className="rank-emblem__mark-line" />
  ));
}

/** The mark inside the shield: a little more each rank, nothing elaborate. */
const MARKS = {
  Iron: () => <circle cx="16" cy="17.5" r="3.2" className="rank-emblem__mark-line" />,
  Bronze: () => <Chevrons count={1} />,
  Silver: () => <Chevrons count={2} />,
  Gold: () => <Chevrons count={3} />,
  Platinum: () => (
    <path
      d="m16 10.2 2.1 4.6 5 .5-3.8 3.4 1.1 4.9-4.4-2.6-4.4 2.6 1.1-4.9-3.8-3.4 5-.5Z"
      className="rank-emblem__mark-fill"
    />
  ),
  Diamond: () => (
    <>
      <path d="M11 13.5 13.5 10h5l2.5 3.5-5 9Z" className="rank-emblem__mark-fill" />
      <path d="M11 13.5h10" className="rank-emblem__mark-cut" />
    </>
  ),
  Master: () => (
    <path d="M9.5 21.5 8.5 12l4.2 3.6L16 9.8l3.3 5.8 4.2-3.6-1 9.5Z" className="rank-emblem__mark-fill" />
  ),
  'Unkillable Demon King': () => (
    <path
      d="M16 8.5c.6 3.2 4.8 5.3 4.8 9.6a4.8 4.8 0 0 1-9.6 0c0-2 1-3.4 2.2-4.3-.1 1.6.5 2.6 1.5 3 0-3.2.4-5.6 1.1-8.3Z"
      className="rank-emblem__mark-fill"
    />
  ),
};

/**
 * A shield in the rank colour with the tier's mark. The colour comes from the
 * API so a badge, a progress bar and a chart threshold line always agree.
 */
export function RankEmblem({ rank, size = 24 }) {
  const gradientId = useId();
  const Mark = rank ? MARKS[rank.rank] : null;
  const fill = rank?.gradient ? `url(#${gradientId})` : rank?.color;

  return (
    <svg
      className={`rank-emblem ${rank ? '' : 'rank-emblem--empty'}`}
      width={size}
      height={size * (36 / 32)}
      viewBox="0 0 32 36"
      aria-hidden="true"
      focusable="false"
    >
      {rank?.gradient && (
        <defs>
          {/* Same red-to-gold as the API's CSS gradient for the top rank. */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#dc2626" />
            <stop offset="1" stopColor="#d4a017" />
          </linearGradient>
        </defs>
      )}
      <path d={SHIELD} className="rank-emblem__shield" style={rank ? { fill } : undefined} />
      {rank && <path d={RIM} className="rank-emblem__rim" />}
      {Mark && <Mark />}
    </svg>
  );
}

const EMBLEM_SIZE = { sm: 16, md: 22, lg: 56 };

/**
 * Emblem and "Gold II" together. `layout="stack"` puts the label under a
 * large emblem, for the one place the rank is the headline.
 */
export default function RankBadge({ rank, size = 'md', layout = 'row' }) {
  const className = `rank-badge rank-badge--${size} rank-badge--${layout}`;

  if (!rank) {
    return (
      <span className={`${className} rank-badge--unranked`}>
        <RankEmblem rank={null} size={EMBLEM_SIZE[size]} />
        <span className="rank-badge__label">Not ranked yet</span>
      </span>
    );
  }

  return (
    <span className={className} style={{ '--rank-color': rank.color }}>
      <RankEmblem rank={rank} size={EMBLEM_SIZE[size]} />
      <span className="rank-badge__label">
        <span className="rank-badge__name">{rank.rank}</span>{' '}
        <span className="rank-badge__division">{rank.division}</span>
      </span>
    </span>
  );
}
