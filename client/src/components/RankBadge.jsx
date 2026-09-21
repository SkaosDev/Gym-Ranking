import './RankBadge.css';

/**
 * Rank, division and colour in one chip. The colour comes from the API so a
 * badge, a progress bar and a chart threshold line always agree.
 */
export default function RankBadge({ rank, size = 'md', showIndex = false }) {
  if (!rank) {
    return <span className="rank-badge rank-badge--unranked">Not ranked yet</span>;
  }

  const style = {
    '--rank-color': rank.color,
    '--rank-fill': rank.gradient ?? rank.color,
  };

  return (
    <span className={`rank-badge rank-badge--${size}`} style={style}>
      <span className="rank-badge__bar" aria-hidden="true" />
      <span className="rank-badge__name">{rank.rank}</span>
      <span className="rank-badge__division">{rank.division}</span>
      {showIndex && <span className="rank-badge__index tabular">{Math.round(rank.index)}</span>}
    </span>
  );
}
