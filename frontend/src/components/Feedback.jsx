import { describeError } from '../api/client.js';
import { stockStatus } from '../utils/format.js';
import Icon from './Icon.jsx';

/** Inline error panel for any API error (400/401/403/404/409/500/network). */
export function ErrorBox({ error, onClose }) {
  if (!error) return null;
  const { title, message, lines } = describeError(error);
  return (
    <div className="callout callout-danger" role="alert">
      <Icon name="alert" className="callout-icon" />
      <div className="callout-body">
        <strong>{title}</strong>
        <div>{message}</div>
        {lines.length > 0 && (
          <ul>
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          onClick={onClose}
          aria-label="Dismiss error"
        >
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}

export function Callout({ tone = 'info', icon = 'info', children }) {
  return (
    <div className={`callout callout-${tone}`}>
      <Icon name={icon} className="callout-icon" />
      <div className="callout-body">{children}</div>
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function Loading({ text = 'Loading…' }) {
  return (
    <div className="loading">
      <Spinner label={text} /> <span>{text}</span>
    </div>
  );
}

/** Table placeholder rows while data loads. */
export function SkeletonRows({ rows = 5, cols = 5 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} className="skeleton-row" aria-hidden="true">
      {Array.from({ length: cols }, (_, c) => (
        <td key={c}>
          <span className="skeleton" style={{ width: `${45 + ((r * 7 + c * 13) % 45)}%` }} />
        </td>
      ))}
    </tr>
  ));
}

export function EmptyState({ icon = 'inbox', title, message, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      {message && <p className="muted">{message}</p>}
      {action}
    </div>
  );
}

export function StockBadge({ stock }) {
  const s = stockStatus(stock);
  return <span className={`badge badge-${s.tone}`}>{s.label}</span>;
}

export function RoleBadge({ role }) {
  return (
    <span className={`badge ${role === 'ADMIN' ? 'badge-navy' : 'badge-success'}`}>{role}</span>
  );
}

/** Labelled form field with hint and inline error (wired with aria-describedby). */
export function Field({ id, label, error, hint, children, className = '' }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id}>{label}</label>
      {typeof children === 'function'
        ? children({ id, describedBy, invalid: Boolean(error) })
        : children}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : (
        hint && (
          <p className="field-hint" id={`${id}-hint`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function Pager({ pagination, onPage }) {
  if (!pagination || pagination.totalRecords === 0) return null;
  const { page, limit, totalPages, totalRecords, hasNextPage, hasPreviousPage } = pagination;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, totalRecords);
  return (
    <div className="pager">
      <span className="muted">
        {from <= totalRecords ? `${from}–${to}` : 0} of {totalRecords}
      </span>
      <div className="pager-buttons">
        <button
          type="button"
          className="btn btn-sm"
          disabled={!hasPreviousPage}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <Icon name="chevronLeft" size={16} /> Prev
        </button>
        <span className="pager-page">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!hasNextPage}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          Next <Icon name="chevronRight" size={16} />
        </button>
      </div>
    </div>
  );
}
