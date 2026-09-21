import { useCallback, useEffect, useState } from 'react';

import { api } from '../lib/api.js';
import { formatDate, formatKg, formatNumber } from '../lib/format.js';
import PerformanceForm from './PerformanceForm.jsx';

export default function Performances() {
  const [exercises, setExercises] = useState([]);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

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
    setNotice(message);
    await load();
  }

  async function handleDelete(performance) {
    try {
      await api.delete(`/performances/${performance.id}`);
      await afterChange('Performance deleted.');
    } catch (deleteError) {
      setError(deleteError.message);
      setPendingDelete(null);
    }
  }

  async function handleConfirm(performance) {
    try {
      await api.post(`/performances/${performance.id}/confirm`);
      await afterChange('Performance confirmed; it now counts toward your rank.');
    } catch (confirmError) {
      setError(confirmError.message);
    }
  }

  return (
    <section>
      <h1>Performances</h1>

      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}

      {editing ? (
        <PerformanceForm
          exercises={exercises}
          performance={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => afterChange(editing === 'new' ? 'Performance logged.' : 'Performance updated.')}
        />
      ) : (
        <p>
          <button type="button" onClick={() => setEditing('new')} disabled={exercises.length === 0}>
            Log a performance
          </button>
        </p>
      )}

      <div>
        <label htmlFor="filter">Exercise</label>{' '}
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
        </select>{' '}
        <label htmlFor="sort">Sort</label>{' '}
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

      {status === 'loading' && <p>Loading your performances...</p>}

      {status === 'ready' && data.items.length === 0 && (
        <p>
          Nothing logged yet{filter ? ' for this exercise' : ''}. Log your first set and your rank
          appears straight away.
        </p>
      )}

      {status === 'ready' && data.items.length > 0 && (
        <>
          <table>
            <caption>
              {data.total} performance{data.total === 1 ? '' : 's'}
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Exercise</th>
                <th scope="col">Set</th>
                <th scope="col">Est. 1RM</th>
                <th scope="col">DOTS</th>
                <th scope="col">Index</th>
                <th scope="col">Rank</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.performed_at)}</td>
                  <td>{row.exercise_label}</td>
                  <td>
                    {row.exercise_type === 'bodyweight' && row.weight_kg === 0
                      ? `bodyweight × ${row.reps}`
                      : `${row.weight_kg} kg × ${row.reps}`}
                  </td>
                  <td>{formatKg(row.e1rm_kg)}</td>
                  <td>{formatNumber(row.dots_points)}</td>
                  <td>{formatNumber(row.strength_index, 0)}</td>
                  <td style={row.rank ? { color: row.rank.color } : undefined}>
                    {row.rank ? row.rank.label : '—'}
                    {!row.counts_toward_rank && row.flags.length > 0 && (
                      <>
                        <br />
                        <small>{row.flags[0].message}</small>
                      </>
                    )}
                  </td>
                  <td>
                    {row.needs_confirmation && (
                      <>
                        <button type="button" onClick={() => handleConfirm(row)}>
                          Confirm
                        </button>{' '}
                      </>
                    )}
                    <button type="button" onClick={() => setEditing(row)}>
                      Edit
                    </button>{' '}
                    {pendingDelete === row.id ? (
                      <>
                        <span>Delete?</span>{' '}
                        <button type="button" onClick={() => handleDelete(row)}>
                          Yes, delete
                        </button>{' '}
                        <button type="button" onClick={() => setPendingDelete(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setPendingDelete(row.id)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.total_pages > 1 && (
            <p>
              <button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>
                Previous
              </button>{' '}
              Page {data.page} of {data.total_pages}{' '}
              <button
                type="button"
                disabled={data.page >= data.total_pages}
                onClick={() => setPage(data.page + 1)}
              >
                Next
              </button>
            </p>
          )}
        </>
      )}
    </section>
  );
}
