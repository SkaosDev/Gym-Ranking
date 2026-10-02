import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { api } from '../lib/api.js';
import { announcePerformancesChanged } from '../lib/performanceEvents.js';
import PerformanceForm from '../pages/PerformanceForm.jsx';
import Modal from './Modal.jsx';
import { useToast } from './Toast.jsx';

const LogSetContext = createContext(null);

/**
 * Logging a set is the main thing anyone does here, so it is one click away
 * from every page: `openLogSet()` or `openLogSet('squat')` to preselect.
 */
export function LogSetProvider({ children }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [exerciseCode, setExerciseCode] = useState(null);
  const [exercises, setExercises] = useState(null);

  const openLogSet = useCallback(
    (code = null) => {
      setExerciseCode(code);
      setOpen(true);
      if (!exercises) {
        api
          .get('/exercises')
          .then((response) => setExercises(response.items))
          .catch((error) => {
            setOpen(false);
            toast.show(error.message, { tone: 'error' });
          });
      }
    },
    [exercises, toast],
  );

  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openLogSet }), [openLogSet]);

  return (
    <LogSetContext.Provider value={value}>
      {children}
      {open && (
        <Modal title="Log a set" onClose={close}>
          {exercises ? (
            <PerformanceForm
              exercises={exercises}
              defaultCode={exerciseCode}
              onCancel={close}
              onSaved={() => {
                close();
                toast.show('Set logged. Your ranks are up to date.');
                announcePerformancesChanged();
              }}
            />
          ) : (
            <p className="muted">Loading exercises...</p>
          )}
        </Modal>
      )}
    </LogSetContext.Provider>
  );
}

export function useLogSet() {
  const context = useContext(LogSetContext);
  if (!context) throw new Error('useLogSet must be used inside a LogSetProvider');
  return context;
}
