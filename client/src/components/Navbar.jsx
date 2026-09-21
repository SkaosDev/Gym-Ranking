import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';
import './Navbar.css';

const LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/performances', label: 'Performances', icon: 'performances' },
  { to: '/progress', label: 'Progress', icon: 'progress' },
  { to: '/friends', label: 'Friends', icon: 'friends' },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);

  // Close the burger menu whenever navigation happens.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/friends')
      .then((data) => {
        if (!cancelled) setPendingRequests(data.incoming?.length ?? 0);
      })
      // The friends endpoint lands in a later phase; until then, no pill.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <Link to="/dashboard" className="navbar__brand">
          <Icon name="brand" />
          GymRank
        </Link>

        <button
          type="button"
          className="navbar__burger button--quiet button--icon"
          aria-expanded={menuOpen}
          aria-controls="navbar-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} />
          <span className="visually-hidden">{menuOpen ? 'Close menu' : 'Open menu'}</span>
        </button>

        <nav
          id="navbar-menu"
          className={`navbar__menu ${menuOpen ? 'is-open' : ''}`}
          aria-label="Main"
        >
          <ul className="navbar__links">
            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} className="navbar__link">
                  <Icon name={link.icon} fixedWidth />
                  {link.label}
                  {link.to === '/friends' && pendingRequests > 0 && (
                    <span className="navbar__pill">
                      {pendingRequests}
                      <span className="visually-hidden"> pending friend requests</span>
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          <ul className="navbar__account">
            <li>
              <NavLink to="/profile" className="navbar__link">
                <Icon name="profile" fixedWidth />
                {user.username}
              </NavLink>
            </li>
            <li>
              <button type="button" className="navbar__logout button--quiet" onClick={handleLogout}>
                <Icon name="logout" fixedWidth />
                Log out
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
