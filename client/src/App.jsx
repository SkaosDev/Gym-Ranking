import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';

import GuestRoute from './components/GuestRoute.jsx';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Friends from './pages/Friends.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Performances from './pages/Performances.jsx';
import Profile from './pages/Profile.jsx';
import Progress from './pages/Progress.jsx';
import Signup from './pages/Signup.jsx';

const DISCLAIMER =
  'Estimates are for information only, based on population-level statistical formulas. ' +
  'This is not medical advice and not a training program.';

function Footer() {
  return (
    <footer className="app-footer">
      <p>{DISCLAIMER}</p>
    </footer>
  );
}

/** Signed in: fixed navbar above every page. */
function AppLayout() {
  return (
    <>
      <Navbar />
      <div className="app-body">
        <main className="page">
          <Outlet />
        </main>
        <Footer />
      </div>
    </>
  );
}

/** Signed out: no navigation to offer, so the form gets the whole screen. */
function PublicLayout() {
  return (
    <>
      <main className="page page--narrow">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route element={<PublicLayout />}>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/performances" element={<Performances />} />
                <Route path="/progress" element={<Progress />} />
                <Route path="/friends" element={<Friends />} />
                <Route path="/profile" element={<Profile />} />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            <Route element={<PublicLayout />}>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
