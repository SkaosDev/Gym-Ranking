import { useCallback, useEffect, useState } from 'react';

import AsyncView from '../components/AsyncView.jsx';
import Card from '../components/Card.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import RankBadge from '../components/RankBadge.jsx';
import { useToast } from '../components/Toast.jsx';
import { exerciseIcon } from '../components/icons.js';
import { api } from '../lib/api.js';
import { formatDate, formatKg, formatNumber } from '../lib/format.js';
import PerformanceForm from './PerformanceForm.jsx';

function describeSet(row) {
  if (row.exercise_type === 'bodyweight' && row.weight_kg === 0) {
    return `bodyweight × ${row.reps}`;
  }
  if (row.exercise_type === 'bodyweight' && row.weight_kg < 0) {
    return `${row.weight_kg} kg assist × ${row.reps}`;
  }
  return `${row.weight_kg} kg × ${row.reps}`;
}

export default function Performances() {
  const toast = useToast();

  const [exercises, setExercises] = useState([]);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState(null); // null | 'new' | a performance
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), sort, per_page: '20' });
      if (filter) query.set('exercise', filter);
      setData(await api.get(`/performances?${query}`));
      setStatus('ready');
    } catch (loadError) {
      setError(loadError.message);
      setStatus('error');
    }
  }, [filter, sort, page]);

  useEffect(() => {
    api
      .get('/exercises')
      .then((response) => setExercises(response.items))
      .catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function afterChange(message) {
    setEditing(null);
    setPendingDelete(null);
    toast.show(message);
    await load();
  }

  async function handleDelete() {
    const target = pendingDelete;
    try {
      await api.delete(`/performances/${target.id}`);
      await afterChange('Performance deleted.');
    } catch (deleteError) {
      setPendingDelete(null);
      toast.show(deleteError.message, { tone: 'error' });
    }
  }

  async function handleConfirm(row) {
    try {
      await api.post(`/performances/${row.id}/confirm`);
      await afterChange('Performance confirmed. It counts toward your rank now.');
    } catch (confirmError) {
      toast.show(confirmError.message, { tone: 'error' });
    }
  }

  const addButton = (
    <button
      type="button"
      className="button--primary"
      onClick={() => setEditing('new')}
      disabled={exercises.length === 0}
    >
      <Icon name="add" />
      Log a performance
    </button>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Performances</h1>
          <p>Every set you have logged, with the whole calculation behind its rank.</p>
        </div>
        {!editing && addButton}
      </div>

      {editing && (
        <Card
          title={editing === 'new' ? 'Log a performance' : 'Edit performance'}
          icon={editing === 'new' ? 'add' : 'edit'}
          className="stack-bottom"
        >
          <PerformanceForm
            exercises={exercises}
            performance={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() =>
              afterChange(editing === 'new' ? 'Performance logged.' : 'Performance updated.')
            }
          />
        </Card>
      )}

      <div className="filters">
        <div className="field">
          <label htmlFor="filter">Exercise</label>
          <select
            id="filter"
            value={filter}
            onChange={(event) => {
              setPage(1);
              setFilter(event.target.value);
            }}
          >
            <option value="">All exercises</option>
            {exercises.map((exercise) => (
              <option key={exercise.id} value={exercise.code}>
                {exercise.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="sort">Sort by date</label>
          <select
            id="sort"
            value={sort}
            onChange={(event) => {
              setPage(1);
              setSort(event.target.value);
            }}
          >
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
          </select>
        </div>
      </div>

      <AsyncView
        status={status}
        error={error}
        onRetry={load}
        loadingLabel="Loading your performances"
        isEmpty={status === 'ready' && data.items.length === 0}
        empty={
          <EmptyState
            icon="performances"
            title={filter ? 'Nothing logged for this exercise' : 'No performances yet'}
            action={addButton}
          >
            Log a set and GymRank works out your estimated one-rep max, your bodyweight-adjusted
            score and the rank it earns.
          </EmptyState>
        }
      >
        {status === 'ready' && data.items.length > 0 && (
          <>
            <div className="table-wrap">
              <table>
                <caption>
                  {data.total} performance{data.total === 1 ? '' : 's'}
                  {filter ? ' for this exercise' : ''}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Exercise</th>
                    <th scope="col">Set</th>
                    <th scope="col" className="numeric">
                      Est. 1RM
                    </th>
                    <th scope="col" className="numeric">
                      DOTS
                    </th>
                    <th scope="col" className="numeric">
                      Index
                    </th>
                    <th scope="col">Rank</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.performed_at)}</td>
                      <td>
                        <span className="cell-with-icon">
                          <Icon icon={exerciseIcon(row.exercise_code)} fixedWidth />
                          {row.exercise_label}
                        </span>
                      </td>
                      <td>{describeSet(row)}</td>
                      <td className="numeric">{formatKg(row.e1rm_kg)}</td>
                      <td className="numeric">{formatNumber(row.dots_points)}</td>
                      <td className="numeric">{formatNumber(row.strength_index, 0)}</td>
                      <td>
                        <RankBadge rank={row.rank} size="sm" />
                        {!row.counts_toward_rank && row.flags.length > 0 && (
                          <span className="flag-note" title={row.flags[0].message}>
                            <Icon name="warning" />
                            <span className="visually-hidden">{row.flags[0].message}</span>
                            <span aria-hidden="true">not counted</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {row.needs_confirmation && (
                            <button
                              type="button"
                              className="button--small"
                              onClick={() => handleConfirm(row)}
                            >
                              <Icon name="confirm" />
                              Confirm
                            </button>
                          )}
                          <button
                            type="button"
                            className="button--quiet button--icon button--small"
                            onClick={() => setEditing(row)}
                          >
                            <Icon name="edit" />
                            <span className="visually-hidden">
                              Edit {row.exercise_label} on {formatDate(row.performed_at)}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="button--quiet button--icon button--small"
                            onClick={() => setPendingDelete(row)}
                          >
                            <Icon name="delete" />
                            <span className="visually-hidden">
                              Delete {row.exercise_label} on {formatDate(row.performed_at)}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.total_pages > 1 && (
              <nav className="pagination" aria-label="Pages">
                <button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>
                  Previous
                </button>
                <span className="muted tabular">
                  Page {data.page} of {data.total_pages}
                </span>
                <button
                  type="button"
                  disabled={data.page >= data.total_pages}
                  onClick={() => setPage(data.page + 1)}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </AsyncView>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this performance?"
          tone="danger"
          confirmLabel="Delete"
          cancelLabel="Keep it"
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleDelete}
        >
          {pendingDelete.exercise_label}, {describeSet(pendingDelete)} on{' '}
          {formatDate(pendingDelete.performed_at)}. This cannot be undone, and your ranks will be
          recalculated without it.
        </ConfirmDialog>
      )}
    </>
  );
}
