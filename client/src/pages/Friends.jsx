import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import AsyncView from '../components/AsyncView.jsx';
import Card from '../components/Card.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import RankBadge from '../components/RankBadge.jsx';
import RankLineChart from '../components/RankLineChart.jsx';
import Spinner from '../components/Spinner.jsx';
import { useToast } from '../components/Toast.jsx';
import { SERIES_COLORS } from '../components/charts.jsx';
import { Leaderboard } from '../components/dashboard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ApiError, api } from '../lib/api.js';
import { announceFriendsChanged } from '../lib/friendEvents.js';
import { formatDate } from '../lib/format.js';

const SEARCH_MIN = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PERIODS = [
  { months: 3, label: '3 months' },
  { months: 6, label: '6 months' },
  { months: 12, label: '1 year' },
];

/** Everyone's overall rank over the chosen period, on one rank scale. */
function Comparison({ progress }) {
  const [months, setMonths] = useState(6);

  const { rows, lines } = useMemo(() => {
    const cutoff = new Date(Date.now() - months * 30.44 * MS_PER_DAY).toISOString().slice(0, 10);
    const people = progress.people.filter((person) => person.points.some((p) => p.date >= cutoff));

    const byDate = new Map();
    for (const person of people) {
      for (const point of person.points) {
        if (point.date < cutoff) continue;
        if (!byDate.has(point.date)) byDate.set(point.date, { date: point.date });
        byDate.get(point.date)[person.username] = point.overall_index;
      }
    }

    return {
      rows: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
      lines: people.map((person, i) => ({
        dataKey: person.username,
        name: person.is_self ? `${person.username} (you)` : person.username,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      })),
    };
  }, [progress, months]);

  return (
    <Card
      title="Progress compared"
      icon="progress"
      subtitle="Overall rank over time, for you and your friends."
      className="card--fill"
      actions={
        <div className="segmented" role="group" aria-label="Period">
          {PERIODS.map((period) => (
            <button
              key={period.months}
              type="button"
              className={`segmented__option ${months === period.months ? 'is-active' : ''}`}
              aria-pressed={months === period.months}
              onClick={() => setMonths(period.months)}
            >
              {period.label}
            </button>
          ))}
        </div>
      }
    >
      {rows.length > 1 ? (
        <div className="chart-fill">
          <RankLineChart rows={rows} lines={lines} thresholds={progress.thresholds} height="100%" />
        </div>
      ) : (
        <p className="muted">Nothing to compare over this period yet.</p>
      )}
    </Card>
  );
}

function PersonRow({ username, children, meta }) {
  return (
    <li className="person-row">
      <span className="person-row__who">
        <span className="avatar" aria-hidden="true">
          {username.slice(0, 1).toUpperCase()}
        </span>
        <span className="person-row__text">
          <Link to={`/u/${username}`}>{username}</Link>
          {meta && <span className="muted person-row__meta">{meta}</span>}
        </span>
      </span>
      <span className="row">{children}</span>
    </li>
  );
}

export default function Friends() {
  const toast = useToast();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [pendingRemove, setPendingRemove] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [friends, ranks, progress] = await Promise.all([
        api.get('/friends'),
        api.get('/ranks'),
        api.get('/friends/progress'),
      ]);
      setData({ ...friends, overall: ranks.overall, progress });
      setStatus('ready');
    } catch (loadError) {
      setError(loadError.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Search as you type, once there is enough to search with.
  useEffect(() => {
    const term = query.trim();
    if (term.length < SEARCH_MIN) {
      setResults(null);
      setSearchError(null);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await api.get(`/friends/search?q=${encodeURIComponent(term)}`);
        if (!cancelled) {
          setResults(found.items);
          setSearchError(null);
        }
      } catch (lookupError) {
        if (!cancelled) {
          setResults([]);
          setSearchError(
            lookupError instanceof ApiError ? lookupError.message : 'Search failed.',
          );
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function act(promise, message) {
    try {
      await promise;
      toast.show(message);
      setQuery('');
      setResults(null);
      await load();
      announceFriendsChanged();
    } catch (actionError) {
      toast.show(actionError.message, { tone: 'error' });
    }
  }

  const sendRequest = (username) =>
    act(api.post('/friends/requests', { username }), `Request sent to ${username}.`);

  const accept = (request) =>
    act(api.post(`/friends/requests/${request.id}/accept`), `You and ${request.username} are now friends.`);

  const decline = (request) =>
    act(api.post(`/friends/requests/${request.id}/decline`), `Request from ${request.username} declined.`);

  const cancel = (request) =>
    act(api.delete(`/friends/${request.id}`), `Request to ${request.username} cancelled.`);

  const remove = () =>
    act(api.delete(`/friends/${pendingRemove.id}`), `${pendingRemove.username} removed.`).then(() =>
      setPendingRemove(null),
    );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Friends</h1>
          <p>How you stack up against your friends, and how everyone is progressing.</p>
        </div>
      </div>

      {status === 'ready' && (
        <div className="grid grid--2 dashboard-split stack-bottom">
          <Leaderboard me={user} myOverall={data.overall} friends={data.friends} showFriendsLink={false} />
          <div className="dashboard-side">
            <Comparison progress={data.progress} />
          </div>
        </div>
      )}

      <Card title="Find someone" icon="friends" className="stack-bottom">
        <div className="field">
          <label htmlFor="friend-search">Username</label>
          <input
            id="friend-search"
            type="search"
            value={query}
            autoComplete="off"
            placeholder="Start typing a username"
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="field-hint">Type at least {SEARCH_MIN} characters.</span>
        </div>

        {searchError && (
          <div className="notice notice--error" role="alert">
            <Icon name="warning" />
            <span>{searchError}</span>
          </div>
        )}

        {searching && (
          <p className="row muted">
            <Spinner label="Searching" />
            <span>Searching...</span>
          </p>
        )}

        {results && results.length === 0 && !searching && !searchError && (
          <p className="muted">Nobody found with that username.</p>
        )}

        {results && results.length > 0 && (
          <ul className="person-list">
            {results.map((person) => (
              <PersonRow key={person.username} username={person.username}>
                {person.friendship.status === 'accepted' && <span className="tag tag--positive">Friends</span>}
                {person.friendship.status === 'pending' && (
                  <span className="tag">
                    {person.friendship.direction === 'outgoing' ? 'Request sent' : 'Asked you'}
                  </span>
                )}
                {(person.friendship.status === 'none' || person.friendship.status === 'declined') && (
                  <button type="button" className="button--primary button--small" onClick={() => sendRequest(person.username)}>
                    <Icon name="add" />
                    Add
                  </button>
                )}
              </PersonRow>
            ))}
          </ul>
        )}
      </Card>

      <AsyncView status={status} error={error} onRetry={load} loadingLabel="Loading your friends">
        {status === 'ready' && (
          <>
            {(data.incoming.length > 0 || data.outgoing.length > 0) && (
              <Card title="Requests" icon="friends" className="stack-bottom">
                {data.incoming.length > 0 && (
                  <>
                    <h3 className="list-heading">For you ({data.incoming.length})</h3>
                    <ul className="person-list">
                      {data.incoming.map((request) => (
                        <PersonRow
                          key={request.id}
                          username={request.username}
                          meta={`asked on ${formatDate(request.requested_at)}`}
                        >
                          <button type="button" className="button--primary button--small" onClick={() => accept(request)}>
                            <Icon name="confirm" />
                            Accept
                          </button>
                          <button type="button" className="button--small" onClick={() => decline(request)}>
                            Decline
                          </button>
                        </PersonRow>
                      ))}
                    </ul>
                  </>
                )}
                {data.outgoing.length > 0 && (
                  <>
                    <h3 className="list-heading">Sent, waiting for a reply ({data.outgoing.length})</h3>
                    <ul className="person-list">
                      {data.outgoing.map((request) => (
                        <PersonRow
                          key={request.id}
                          username={request.username}
                          meta={`sent on ${formatDate(request.requested_at)}`}
                        >
                          <button type="button" className="button--quiet button--small" onClick={() => cancel(request)}>
                            Cancel
                          </button>
                        </PersonRow>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
            )}

            <Card title={`Friends (${data.friends.length})`} icon="friends">
              {data.friends.length === 0 ? (
                <EmptyState icon="friends" title="No friends yet">
                  Search for a username above to send your first request.
                </EmptyState>
              ) : (
                <ul className="person-list">
                  {data.friends.map((friend) => (
                    <PersonRow
                      key={friend.id}
                      username={friend.username}
                      meta={`friends since ${formatDate(friend.friends_since)}`}
                    >
                      {friend.overall ? (
                        <RankBadge rank={friend.overall.rank} size="sm" />
                      ) : (
                        <span className="tag">
                          {friend.ranks_visible ? 'No overall rank yet' : 'Ranks hidden'}
                        </span>
                      )}
                      <button
                        type="button"
                        className="button--quiet button--icon button--small row-delete"
                        title={`Remove ${friend.username}`}
                        onClick={() => setPendingRemove(friend)}
                      >
                        <Icon name="delete" />
                        <span className="visually-hidden">Remove {friend.username}</span>
                      </button>
                    </PersonRow>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </AsyncView>

      {pendingRemove && (
        <ConfirmDialog
          title={`Remove ${pendingRemove.username}?`}
          tone="danger"
          confirmLabel="Remove"
          cancelLabel="Keep"
          onCancel={() => setPendingRemove(null)}
          onConfirm={remove}
        >
          You will stop seeing each other&rsquo;s ranks. Either of you can send a new request later.
        </ConfirmDialog>
      )}
    </>
  );
}
