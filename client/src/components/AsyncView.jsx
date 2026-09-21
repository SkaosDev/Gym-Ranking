import EmptyState from './EmptyState.jsx';
import Icon from './Icon.jsx';
import Spinner from './Spinner.jsx';

/**
 * Loading, error and empty in one place, so no page can forget one of them
 * and render a blank rectangle on a projector while a request is in flight.
 */
export default function AsyncView({
  status,
  error,
  isEmpty = false,
  empty,
  loadingLabel = 'Loading',
  onRetry,
  children,
}) {
  if (status === 'loading') {
    return (
      <p className="row muted">
        <Spinner label={loadingLabel} />
        <span>{loadingLabel}...</span>
      </p>
    );
  }

  if (status === 'error') {
    return (
      <div className="notice notice--error" role="alert">
        <Icon name="warning" />
        <span>
          {error ?? 'Something went wrong.'}
          {onRetry && (
            <>
              {' '}
              <button type="button" className="button--quiet button--small" onClick={onRetry}>
                Try again
              </button>
            </>
          )}
        </span>
      </div>
    );
  }

  if (isEmpty) return empty ?? <EmptyState title="Nothing here yet" />;

  return children;
}
