import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import Spinner from './Spinner.jsx';

/** Keeps a signed-in user away from the login and signup forms. */
export default function GuestRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <p className="page row muted">
        <Spinner label="Checking your session" />
        <span>Checking your session...</span>
      </p>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
