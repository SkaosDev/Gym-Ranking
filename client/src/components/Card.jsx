import Icon from './Icon.jsx';
import './Card.css';

/** A panel. `icon` may be a name from the icon map or a Font Awesome icon. */
export default function Card({ title, subtitle, icon, faIcon, actions, accent, children, className = '' }) {
  const style = accent ? { '--card-accent': accent } : undefined;

  return (
    <section className={`card ${accent ? 'card--accented' : ''} ${className}`.trim()} style={style}>
      {(title || actions) && (
        <header className="card__header">
          <div className="card__heading">
            {(icon || faIcon) && <Icon name={icon} icon={faIcon} className="card__icon" fixedWidth />}
            <div>
              <h2 className="card__title">{title}</h2>
              {subtitle && <p className="card__subtitle">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}
