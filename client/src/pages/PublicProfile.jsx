import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import AsyncView from '../components/AsyncView.jsx';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import RankBadge from '../components/RankBadge.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  GRID_STROKE,
  colorForExercise,
  dateAxisProps,
  mergeSeries,
  tooltipProps,
  valueAxisProps,
} from '../components/charts.jsx';
import { exerciseIcon } from '../components/icons.js';
import { api } from '../lib/api.js';
import { announceFriendsChanged } from '../lib/friendEvents.js';
import { formatDate, formatIndex } from '../lib/format.js';

export default function PublicProfile() {
  const { username } = useParams();
  const toast = useToast();

  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      setProfile(await api.get(`/users/${encodeURIComponent(username)}`));
      setStatus('ready');
    } catch (loadError) {
      setError(loadError.message);
      setStatus(loadError.status === 404 ? 'missing' : 'error');
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendRequest() {
    setBusy(true);
    try {
      await api.post('/friends/requests', { username });
      toast.show(`Request sent to ${username}.`);
      await load();
      announceFriendsChanged();
    } catch (requestError) {
      toast.show(requestError.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function answer(action) {
    setBusy(true);
    try {
      await api.post(`/friends/requests/${profile.friendship.friendship_id}/${action}`);
      toast.show(action === 'accept' ? `You and ${username} are now friends.` : 'Request declined.');
      await load();
      announceFriendsChanged();
    } catch (answerError) {
      toast.show(answerError.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (status === 'missing') {
    return (
      <EmptyState icon="warning" title="No such user">
        Nobody here goes by that name. <Link to="/friends">Back to friends</Link>.
      </EmptyState>
    );
  }

  const series = profile?.index_series ?? [];
  const codes = series.map((entry) => entry.code);
  const chartRows = mergeSeries(series, 'index', 'date');

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{username}</h1>
          {profile?.created_at && (
            <p>Training here since {formatDate(profile.created_at)}.</p>
          )}
        </div>
      </div>

      <AsyncView status={status} error={error} onRetry={load} loadingLabel="Loading the profile">
        {status === 'ready' && (
          <>
            {profile.visibility !== 'self' && (
              <Card title="Friendship" icon="friends" className="stack-bottom">
                {profile.friendship.status === 'accepted' && (
                  <p className="muted">
                    <Icon name="confirm" /> You are friends, so you can see each other&rsquo;s ranks.
                  </p>
                )}

                {profile.friendship.status === 'none' && (
                  <>
                    <p className="muted">
                      You are not friends yet, so only the username is shown.
                    </p>
                    <button type="button" className="button--primary" disabled={busy} onClick={sendRequest}>
                      <Icon name="add" />
                      Send a friend request
                    </button>
                  </>
                )}

                {profile.friendship.status === 'pending' &&
                  profile.friendship.direction === 'outgoing' && (
                    <p className="muted">Your request is waiting for a reply.</p>
                  )}

                {profile.friendship.status === 'pending' &&
                  profile.friendship.direction === 'incoming' && (
                    <>
                      <p className="muted">{username} asked to be your friend.</p>
                      <div className="row">
                        <button type="button" className="button--primary" disabled={busy} onClick={() => answer('accept')}>
                          <Icon name="confirm" />
                          Accept
                        </button>
                        <button type="button" disabled={busy} onClick={() => answer('decline')}>
                          Decline
                        </button>
                      </div>
                    </>
                  )}

                {profile.friendship.status === 'declined' && (
                  <>
                    <p className="muted">There is no friendship between you at the moment.</p>
                    <button type="button" className="button--primary" disabled={busy} onClick={sendRequest}>
                      <Icon name="add" />
                      Send a friend request
                    </button>
                  </>
                )}
              </Card>
            )}

            {profile.visibility === 'ranks_hidden' && (
              <EmptyState icon="info" title="Ranks are private">
                {username} has chosen not to share ranks with friends.
              </EmptyState>
            )}

            {profile.visibility === 'stranger' && (
              <EmptyState icon="info" title="Nothing shared yet">
                Ranks are only visible between friends. Bodyweight, loads and notes are never
                shared with anyone.
              </EmptyState>
            )}

            {(profile.visibility === 'full' || profile.visibility === 'self') && (
              <>
                {profile.overall ? (
                  <Card
                    title="Overall rank"
                    icon="record"
                    accent={profile.overall.rank.color}
                    className="stack-bottom"
                  >
                    <div className="overall__headline">
                      <RankBadge rank={profile.overall.rank} size="lg" />
                      <span className="overall__index tabular">
                        {formatIndex(profile.overall.index)}
                        <span className="muted"> / 1000</span>
                      </span>
                    </div>
                    <ProgressBar
                      value={profile.overall.rank.within_division_pct}
                      color={profile.overall.rank.color}
                      gradient={profile.overall.rank.gradient}
                      label={`Progress through ${profile.overall.rank.label}`}
                    />
                  </Card>
                ) : (
                  <Card title="Overall rank" icon="record" className="stack-bottom">
                    <p className="muted">
                      Not enough exercises logged yet for an overall rank.
                    </p>
                  </Card>
                )}

                <h2 className="section-heading">By exercise</h2>
                <div className="grid stack-bottom">
                  {profile.exercises.map((entry) => (
                    <Card key={entry.code} title={entry.label} faIcon={exerciseIcon(entry.code)} accent={entry.rank.color}>
                      <div className="row exercise-card__top">
                        <RankBadge rank={entry.rank} />
                        <span className="muted tabular exercise-card__index">
                          {formatIndex(entry.index)}
                          <span className="muted"> / 1000</span>
                        </span>
                      </div>
                      <ProgressBar
                        value={entry.rank.within_division_pct}
                        color={entry.rank.color}
                        gradient={entry.rank.gradient}
                        label={`Progress through ${entry.rank.label}`}
                      />
                    </Card>
                  ))}
                </div>

                {chartRows.length > 1 && (
                  <Card
                    title="Strength index over time"
                    icon="progress"
                    subtitle="Ranks and indices are shared between friends. Kilograms and bodyweight are not."
                  >
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={chartRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis {...dateAxisProps} />
                        <YAxis {...valueAxisProps} domain={[0, 1000]} ticks={[0, 250, 500, 750, 1000]} />
                        <Tooltip {...tooltipProps} />
                        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 13 }} />}
                        {series.map((entry) => (
                          <Line
                            key={entry.code}
                            type="monotone"
                            dataKey={entry.code}
                            name={entry.label}
                            stroke={colorForExercise(entry.code, codes)}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </AsyncView>
    </>
  );
}
