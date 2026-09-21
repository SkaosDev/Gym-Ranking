import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';

/** Placeholder until the ranks phase fills this page with rank cards. */
export default function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <section>
      <h1>Welcome, {user.username}</h1>
      <p>
        You are {user.age}, {user.current_weight_kg} kg, {user.height_cm} cm. Your current age
        coefficient is x{user.age_coefficient}.
      </p>
      <p>
        <Link to="/performances">Your performances</Link>
      </p>
      <p>Rank cards and progress charts arrive in the next phases.</p>
      <button type="button" onClick={logout}>
        Log out
      </button>
    </section>
  );
}
