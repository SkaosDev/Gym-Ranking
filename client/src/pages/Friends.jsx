import EmptyState from '../components/EmptyState.jsx';

export default function Friends() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Friends</h1>
          <p>Follow a friend&rsquo;s ranks and progress. No leaderboard, no sorting by rank.</p>
        </div>
      </div>
      <EmptyState icon="friends" title="Friends are on their way">
        Send and accept requests by username, then open a friend&rsquo;s profile to see their ranks.
        Your bodyweight, loads and notes are never shared.
      </EmptyState>
    </>
  );
}
