import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { describeError } from '../api/client.js';
import Icon from './Icon.jsx';

const ToastContext = createContext(null);
const ICONS = { success: 'checkCircle', error: 'alert', info: 'info' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (type, title, message) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, type, title, message }]);
      setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (title, message) => push('success', title, message),
      info: (title, message) => push('info', title, message),
      /** Accepts an API error (shows status + backend message) or plain text. */
      error: (errOrTitle, message) => {
        if (typeof errOrTitle === 'string') return push('error', errOrTitle, message);
        const d = describeError(errOrTitle);
        return push('error', d.title, [d.message, ...d.lines].join(' · '));
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            role={t.type === 'error' ? 'alert' : 'status'}
          >
            <Icon name={ICONS[t.type]} size={18} className="toast-icon" />
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              {t.message && <div className="toast-message">{t.message}</div>}
            </div>
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
