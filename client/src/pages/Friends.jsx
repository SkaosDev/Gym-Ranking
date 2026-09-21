import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import AsyncView from '../components/AsyncView.jsx';
import Card from '../components/Card.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import RankBadge from '../components/RankBadge.jsx';
import { useToast } from '../components/Toast.jsx';
import { ApiError, api } from '../lib/api.js';
import { announceFriendsChanged } from '../lib/friendEvents.js';
import { formatDate } from '../lib/format.js';

const SEARCH_MIN = 3;

function PersonRow({ username, children, meta }) {
  return (
    <li className="person-row">
      <span className="person-row__who">
        <Icon name="profile" fixedWidth />
        <span>
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
      setData(await api.get('/friends'));
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
          <p>
            Follow a friend&rsquo;s ranks and progress. There is no leaderboard here, so friends are
            listed alphabetically and never ranked against each other.
          </p>
        </div>
      </div>

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
          <span className="field-hint">
            At least {SEARCH_MIN} characters, and usernames only. Email addresses are never
            searchable.
          </span>
        </div>

        {searchError && (
          <div className="notice notice--error" role="alert">
            <Icon name="warning" />
            <span>{searchError}</span>
          </div>
        )}

        {searching && <p className="muted">Searching...</p>}

        {results && results.length === 0 && !searching && !searchError && (
          <p className="muted">Nobody found with that username.</p>
        )}

        {results && results.length > 0 && (
          <ul className="person-list">
            {results.map((person) => (
              <PersonRow key={person.username} username={person.username}>
                {person.friendship.status === 'accepted' && <span className="muted">Friends</span>}
                {person.friendship.status === 'pending' && (
                  <span className="muted">
                    {person.friendship.direction === 'outgoing' ? 'Request sent' : 'Asked you'}
                  </span>
                )}
                {(person.friendship.status === 'none' || person.friendship.status === 'declined') && (
                  <button type="button" className="button--small" onClick={() => sendRequest(person.username)}>
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
            {data.incoming.length > 0 && (
              <Card
                title={`Requests for you (${data.incoming.length})`}
                icon="friends"
                className="stack-bottom"
              >
                <ul className="person-list">
                  {data.incoming.map((request) => (
                    <PersonRow
                      key={request.id}
                      username={request.username}
                      meta={` asked on ${formatDate(request.requested_at)}`}
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
              </Card>
            )}

            {data.outgoing.length > 0 && (
              <Card title="Waiting on a reply" icon="friends" className="stack-bottom">
                <ul className="person-list">
                  {data.outgoing.map((request) => (
                    <PersonRow
                      key={request.id}
                      username={request.username}
                      meta={` asked on ${formatDate(request.requested_at)}`}
                    >
                      <button type="button" className="button--small" onClick={() => cancel(request)}>
                        Cancel
                      </button>
                    </PersonRow>
                  ))}
                </ul>
              </Card>
            )}

            <Card title={`Friends (${data.friends.length})`} icon="friends">
              {data.friends.length === 0 ? (
                <EmptyState icon="friends" title="No friends yet">
                  Search for a username above to send the first request. Your bodyweight, loads and
                  notes are never shared &mdash; only ranks.
                </EmptyState>
              ) : (
                <ul className="person-list">
                  {data.friends.map((friend) => (
                    <PersonRow
                      key={friend.id}
                      username={friend.username}
                      meta={` since ${formatDate(friend.friends_since)}`}
                    >
                      {friend.overall ? (
                        <RankBadge rank={friend.overall.rank} size="sm" />
                      ) : (
                        <span className="muted">
                          {friend.ranks_visible ? 'No overall rank yet' : 'Ranks hidden'}
                        </span>
                      )}
                      <button
                        type="button"
                        className="button--quiet button--icon button--small"
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
