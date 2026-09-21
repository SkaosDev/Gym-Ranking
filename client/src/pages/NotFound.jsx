import { Link } from 'react-router-dom';

import EmptyState from '../components/EmptyState.jsx';

export default function NotFound() {
  return (
    <EmptyState icon="warning" title="That page does not exist">
      <Link to="/dashboard">Back to your dashboard</Link>
    </EmptyState>
  );
}
