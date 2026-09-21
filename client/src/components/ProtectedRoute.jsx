import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import Spinner from './Spinner.jsx';

/** Guards the signed-in area. The server authorises too; this is only routing. */
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <p className="page row muted">
        <Spinner label="Checking your session" />
        <span>Checking your session...</span>
      </p>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
