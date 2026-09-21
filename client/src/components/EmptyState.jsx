import Icon from './Icon.jsx';
import './EmptyState.css';

/**
 * Shown whenever there is nothing yet. A fresh account hits these during the
 * demo, so they say what to do next rather than apologising for being empty.
 */
export default function EmptyState({ icon = 'info', faIcon, title, children, action }) {
  return (
    <div className="empty-state">
      <Icon name={icon} icon={faIcon} className="empty-state__icon" />
      <h3 className="empty-state__title">{title}</h3>
      {children && <p className="empty-state__body">{children}</p>}
      {action}
    </div>
  );
}
