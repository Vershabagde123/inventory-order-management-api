import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { canOpen } from '../auth/permissions.js';
import { Callout, ErrorBox, Field } from '../components/Feedback.jsx';
import Icon from '../components/Icon.jsx';

export default function LoginPage() {
  const { user, login, sessionMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const loggedIn = await login(email, password);
      // Return to the requested page only if this role may open it; otherwise its dashboard.
      const from = location.state?.from;
      navigate(from && canOpen(loggedIn.role, from) ? from : '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand" aria-hidden="true">
        <div className="login-brand-top">
          <span className="logo logo-lg">
            <Icon name="package" size={22} />
          </span>
          <strong>Inventory Hub</strong>
        </div>
        <div>
          <h2>Inventory and orders, in one place.</h2>
          <ul className="login-points">
            <li>
              <Icon name="package" size={16} /> Product catalogue with live stock levels
            </li>
            <li>
              <Icon name="cart" size={16} /> Transaction-safe order processing
            </li>
            <li>
              <Icon name="shield" size={16} /> Role-based access for admins and staff
            </li>
          </ul>
        </div>
        <small>Connected to {API_BASE_URL}</small>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={onSubmit} noValidate>
          <div className="login-form-head">
            <span className="logo logo-lg login-mobile-logo" aria-hidden="true">
              <Icon name="package" size={22} />
            </span>
            <h1>Sign in</h1>
            <p className="muted">Use your administrator or staff account.</p>
          </div>

          {sessionMessage && <Callout tone="info">{sessionMessage}</Callout>}
          <ErrorBox error={error} />

          <Field id="login-email" label="Email address">
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              required
              autoFocus
            />
          </Field>
          <Field id="login-password" label="Password">
            <div className="input-with-action">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                <Icon name="eye" size={16} />
              </button>
            </div>
          </Field>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy || !email || !password}
          >
            {busy && <span className="spinner spinner-light" aria-hidden="true" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </div>
  );
}
