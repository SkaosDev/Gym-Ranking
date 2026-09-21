import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';

/** Keeps a signed-in user away from the login and signup forms. */
export default function GuestRoute() {
  const { user, loading } = useAuth();

  if (loading) return <p>Checking your session...</p>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
