import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import ActivityGrid from '../components/ActivityGrid.jsx';
import AsyncView from '../components/AsyncView.jsx';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import RankBadge from '../components/RankBadge.jsx';
import RankLineChart from '../components/RankLineChart.jsx';
import { useToast } from '../components/Toast.jsx';
import { ExerciseList, SummaryTiles, Tiles } from '../components/dashboard.jsx';
import { api } from '../lib/api.js';
import { announceFriendsChanged } from '../lib/friendEvents.js';
import { formatDate, formatKg, formatNumber } from '../lib/format.js';

/** Age, sex, height and current weight, which friends share. */
function DetailTiles({ details }) {
  return (
    <Tiles
      tiles={[
        { label: 'Age', value: details.age, hint: 'years' },
        { label: 'Sex', value: details.sex === 'F' ? 'Female' : 'Male' },
        { label: 'Height', value: `${formatNumber(details.height_cm, 0)} cm` },
        { label: 'Weight', value: details.weight_kg === null ? '\u2014' : formatKg(details.weight_kg) },
      ]}
    />
  );
}

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
            {profile.visibility !== 'self' && profile.friendship.status !== 'accepted' && (
              <Card title="Friendship" icon="friends" className="stack-bottom">

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

            {profile.details && <DetailTiles details={profile.details} />}

            {profile.visibility === 'ranks_hidden' && (
              <EmptyState icon="info" title="Ranks are private">
                {username} has chosen not to share ranks with friends.
              </EmptyState>
            )}

            {profile.visibility === 'stranger' && (
              <EmptyState icon="info" title="Nothing shared yet">
                Ranks and stats are only visible between friends. Loads and notes are never shared
                with anyone.
              </EmptyState>
            )}

            {(profile.visibility === 'full' || profile.visibility === 'self') && (
              <>
                {profile.overall ? (
                  <section className="hero" style={{ '--hero-color': profile.overall.rank.color }}>
                    <RankBadge rank={profile.overall.rank} size="lg" layout="stack" />
                    <div className="hero__main">
                      <p className="hero__eyebrow">Overall rank</p>
                      <p className="hero__meaning">{profile.overall.rank.meaning}</p>
                    </div>
                  </section>
                ) : (
                  <Card title="Overall rank" icon="record" className="stack-bottom">
                    <p className="muted">Not enough exercises logged yet for an overall rank.</p>
                  </Card>
                )}

                <SummaryTiles activity={profile.activity} />

                <div className="grid grid--2 dashboard-split stack-bottom">
                  <ExerciseList
                    exercises={profile.exercises.map((entry) => ({
                      exercise: { code: entry.code, label: entry.label },
                      rank: entry.rank,
                      has_data: true,
                    }))}
                    showNext={false}
                    subtitle={`${username}'s rank on each lift.`}
                  />

                  <div className="dashboard-side">
                    <Card
                      title="Progression"
                      icon="progress"
                      subtitle="Overall rank over time."
                      className="card--fill"
                    >
                      {profile.overall_series.length > 1 ? (
                        <div className="chart-fill">
                          <RankLineChart
                            rows={profile.overall_series}
                            dataKey="overall_index"
                            thresholds={profile.thresholds}
                            name="Overall rank"
                            height="100%"
                          />
                        </div>
                      ) : (
                        <p className="muted">No overall rank to chart yet.</p>
                      )}
                    </Card>
                  </div>
                </div>

                <Card
                  title="Attendance"
                  icon="dashboard"
                  subtitle={`${profile.activity.days.length} training day${profile.activity.days.length === 1 ? '' : 's'} in the last year.`}
                >
                  <ActivityGrid days={profile.activity.days} to={profile.activity.to} />
                </Card>
              </>
            )}
          </>
        )}
      </AsyncView>
    </>
  );
}
