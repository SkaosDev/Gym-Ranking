import './Spinner.css';

export default function Spinner({ label = 'Loading' }) {
  return (
    <span className="spinner">
      <span className="spinner__disc" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
