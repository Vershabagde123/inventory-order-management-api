import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import { canOpen, ROLE_TITLES } from './auth/permissions.js';
import Icon from './components/Icon.jsx';
import Layout from './components/Layout.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import OrderDetailPage from './pages/OrderDetailPage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import StaffPage from './pages/StaffPage.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

/** Route-level role protection (covers direct URL navigation, not just the sidebar). */
function RequirePage({ children }) {
  const { role } = useAuth();
  const { pathname } = useLocation();
  if (canOpen(role, pathname)) return children;
  return (
    <section className="card access-denied">
      <span className="access-denied-icon">
        <Icon name="shield" size={26} />
      </span>
      <h1>Access denied</h1>
      <p className="muted">
        The <strong>{role}</strong> role cannot open <code>{pathname}</code>. This area is only
        available to administrators.
      </p>
      <Link className="btn btn-primary" to="/">
        Go to the {ROLE_TITLES[role] ?? 'dashboard'}
      </Link>
    </section>
  );
}

const guard = (element) => <RequirePage>{element}</RequirePage>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={guard(<DashboardPage />)} />
        <Route path="products" element={guard(<ProductsPage />)} />
        <Route path="inventory" element={guard(<InventoryPage />)} />
        <Route path="staff" element={guard(<StaffPage />)} />
        <Route path="orders" element={guard(<OrdersPage />)} />
        <Route path="orders/:id" element={guard(<OrderDetailPage />)} />
        <Route path="reports" element={guard(<ReportsPage />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
