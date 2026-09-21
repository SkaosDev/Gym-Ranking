import './ProgressBar.css';

/** Position within the current division, 0 to 100. */
export default function ProgressBar({ value, color, gradient, label, caption }) {
  const clamped = Math.min(100, Math.max(0, value ?? 0));
  const style = {
    '--progress-fill': gradient ?? color ?? 'var(--accent)',
    '--progress-value': `${clamped}%`,
  };

  return (
    <div className="progress" style={style}>
      <div
        className="progress__track"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="progress__fill" />
      </div>
      {caption && <p className="progress__caption">{caption}</p>}
    </div>
  );
}
