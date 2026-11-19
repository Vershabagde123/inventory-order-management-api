import { useEffect, useId, useRef } from 'react';
import Icon from './Icon.jsx';

/** Accessible dialog: Esc / backdrop closes, focus moves inside and returns afterwards. */
export function Modal({ open, title, description, onClose, children, footer, size = 'md', busy }) {
  const titleId = useId();
  const panelRef = useRef(null);
  // Latest handlers in refs so the effect below runs only when the dialog opens/closes
  // (pages pass inline callbacks; re-running would steal focus on every keystroke).
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  onCloseRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const panel = panelRef.current;
    const first = panel?.querySelector('input, select, textarea, button:not(.modal-close)');
    (first ?? panel)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && !busyRef.current) onCloseRef.current();
      if (e.key === 'Tab' && panel) {
        const focusables = [
          ...panel.querySelectorAll('button, input, select, textarea, a[href]'),
        ].filter((el) => !el.disabled);
        if (focusables.length === 0) return;
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        ref={panelRef}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p className="muted">{description}</p>}
          </div>
          <button
            type="button"
            className="icon-btn modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation step before destructive actions. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  busy,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      size="sm"
      busy={busy}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-body">
        <span className="confirm-icon">
          <Icon name="warning" size={20} />
        </span>
        <p>{message}</p>
      </div>
    </Modal>
  );
}
