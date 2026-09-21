import Card from '../components/Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDate, formatKg } from '../lib/format.js';

export default function Profile() {
  const { user } = useAuth();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Profile</h1>
          <p>The numbers your ranks are calibrated against.</p>
        </div>
      </div>

      <Card title="Your details" icon="profile">
        <dl className="detail-list">
          <div>
            <dt>Username</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Age</dt>
            <dd className="tabular">{user.age}</dd>
          </div>
          <div>
            <dt>Age coefficient</dt>
            <dd className="tabular">&times;{user.age_coefficient}</dd>
          </div>
          <div>
            <dt>Height</dt>
            <dd className="tabular">{user.height_cm} cm</dd>
          </div>
          <div>
            <dt>Bodyweight</dt>
            <dd className="tabular">{formatKg(user.current_weight_kg)}</dd>
          </div>
          <div>
            <dt>Last weigh-in</dt>
            <dd>{formatDate(user.weighed_at)}</dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>{formatDate(user.created_at)}</dd>
          </div>
        </dl>
        <p className="muted">
          Logging a new bodyweight and changing who can see your ranks arrive with the ranks phase.
        </p>
      </Card>
    </>
  );
}
