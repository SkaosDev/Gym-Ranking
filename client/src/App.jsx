import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';

import GuestRoute from './components/GuestRoute.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';

const DISCLAIMER =
  'Estimates are for information only, based on population-level statistical formulas. ' +
  'This is not medical advice and not a training program.';

/** Shared shell. The navbar and the design system arrive in the design pass. */
function Layout() {
  return (
    <div className="app-shell">
      <main>
        <Outlet />
      </main>
      <footer>
        <small>{DISCLAIMER}</small>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>That page does not exist.</p>
    </section>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
