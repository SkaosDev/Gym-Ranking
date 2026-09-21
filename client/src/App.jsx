import { useEffect, useState } from 'react';

const DISCLAIMER =
  'Estimates are for information only, based on population-level statistical formulas. ' +
  'This is not medical advice and not a training program.';

/**
 * Scaffold page. It probes /api/healthz, which proves end to end that the
 * client reaches the API: through the Vite proxy in development, and directly
 * from the single origin once the build is served by Express.
 */
export default function App() {
  const [health, setHealth] = useState({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch('/api/healthz')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setHealth({ state: 'ready', data });
      })
      .catch((error) => {
        if (!cancelled) setHealth({ state: 'error', message: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ maxWidth: '40rem', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>GymRank</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Gym performance tracker with ranks calibrated to your physiology.
      </p>

      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '1rem',
          marginTop: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1rem', marginTop: 0 }}>API connectivity</h2>
        {health.state === 'loading' && <p>Checking the API...</p>}
        {health.state === 'error' && (
          <p>
            Could not reach the API: <code>{health.message}</code>
          </p>
        )}
        {health.state === 'ready' && (
          <p>
            Reachable. Node <code>{health.data.node}</code>, up for{' '}
            {health.data.uptimeSeconds}s.
          </p>
        )}
      </section>

      <footer
        style={{
          marginTop: '2rem',
          fontSize: '0.8125rem',
          color: 'var(--text-muted)',
        }}
      >
        {DISCLAIMER}
      </footer>
    </main>
  );
}
