import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import Icon from './Icon.jsx';
import './Toast.css';

const ToastContext = createContext(null);

const DISMISS_AFTER_MS = 4500;

/**
 * Transient confirmations. An action keeps its name through the whole flow,
 * so "Delete" produces "Performance deleted".
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message, { tone = 'info' } = {}) => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((current) => [...current, { id, message, tone }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.tone}`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <Icon name={toast.tone === 'error' ? 'warning' : 'confirm'} className="toast__icon" />
            <span>{toast.message}</span>
            <button
              type="button"
              className="button--quiet button--icon button--small"
              onClick={() => dismiss(toast.id)}
            >
              <Icon name="close" />
              <span className="visually-hidden">Dismiss</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}
