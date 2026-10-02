import { useEffect } from 'react';

import Icon from './Icon.jsx';
import './ConfirmDialog.css';

/** A titled dialog for forms. Escape and a click on the backdrop close it. */
export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog dialog--wide" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="dialog__head">
          <h2 className="dialog__title" id="modal-title">
            {title}
          </h2>
          <button type="button" className="button--quiet button--icon" onClick={onClose}>
            <Icon name="close" />
            <span className="visually-hidden">Close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
