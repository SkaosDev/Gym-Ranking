import EmptyState from '../components/EmptyState.jsx';

export default function Progress() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Progress</h1>
          <p>How your estimated maxes and your strength index move over time.</p>
        </div>
      </div>
      <EmptyState icon="progress" title="Charts are on their way">
        Estimated 1RM over time, your strength index against the rank thresholds, a radar of your
        current index per exercise, and bodyweight against your overall index.
      </EmptyState>
    </>
  );
}
