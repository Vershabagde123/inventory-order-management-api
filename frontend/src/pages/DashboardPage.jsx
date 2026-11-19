import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fetchAllProducts } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ROLE_TITLES } from '../auth/permissions.js';
import {
  EmptyState,
  ErrorBox,
  PageHeader,
  SkeletonRows,
  StockBadge,
} from '../components/Feedback.jsx';
import Icon from '../components/Icon.jsx';
import { formatAmount, formatDate, formatNumber, LOW_STOCK_THRESHOLD } from '../utils/format.js';

/** Every figure comes straight from existing endpoints the role is allowed to call. */
async function loadAdminStats() {
  const [health, products, orders, lowStock] = await Promise.all([
    api.health().catch(() => ({ status: 'down', database: 'unknown' })),
    fetchAllProducts(),
    api.listOrders({ page: 1, limit: 5 }),
    api.lowStock(LOW_STOCK_THRESHOLD),
  ]);
  return {
    health,
    cards: [
      {
        label: 'Total products',
        value: products.length,
        icon: 'package',
        tone: 'emerald',
        to: '/products',
      },
      {
        label: 'Total stock (units)',
        value: products.reduce((sum, p) => sum + p.stock, 0),
        icon: 'layers',
        tone: 'navy',
        to: '/inventory',
      },
      {
        label: 'Total orders',
        value: orders.pagination.totalRecords,
        icon: 'receipt',
        tone: 'yellow',
        to: '/orders',
      },
      {
        label: 'Low / out of stock',
        value: `${lowStock.data.filter((p) => p.stock > 0).length} / ${products.filter((p) => p.stock === 0).length}`,
        icon: 'warning',
        tone: 'orange',
        to: '/reports',
      },
    ],
    recentOrders: orders.data,
    lowStock: lowStock.data,
  };
}

async function loadStaffStats() {
  const [products, orders, lowStock] = await Promise.all([
    api.listProducts({ page: 1, limit: 1 }),
    api.listOrders({ page: 1, limit: 5 }),
    api.lowStock(LOW_STOCK_THRESHOLD),
  ]);
  return {
    cards: [
      {
        label: 'Products available',
        value: products.pagination.totalRecords,
        icon: 'package',
        tone: 'emerald',
        to: '/products',
      },
      {
        label: 'Total orders',
        value: orders.pagination.totalRecords,
        icon: 'receipt',
        tone: 'yellow',
        to: '/orders',
      },
      {
        label: 'Low-stock products',
        value: lowStock.data.length,
        icon: 'warning',
        tone: 'orange',
        to: '/products',
      },
    ],
    recentOrders: orders.data,
    lowStock: lowStock.data,
  };
}

export default function DashboardPage() {
  const { user, role, isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setError(null);
    (isAdmin ? loadAdminStats() : loadStaffStats())
      .then((s) => !cancelled && setStats(s))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [isAdmin, reloadKey]);

  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <>
      <PageHeader
        title={ROLE_TITLES[role]}
        description={
          isAdmin
            ? `Welcome back, ${firstName}. Here is an overview of your inventory and orders.`
            : `Welcome back, ${firstName}. Browse products and place orders for customers.`
        }
        actions={
          <>
            {isAdmin && stats?.health && (
              <span className={`status-pill ${stats.health.status === 'ok' ? 'is-ok' : 'is-down'}`}>
                <span className="dot" /> API{' '}
                {stats.health.status === 'ok' ? 'online' : 'unavailable'} · DB{' '}
                {stats.health.database}
              </span>
            )}
            {isAdmin && (
              <Link className="btn" to="/products?new=1">
                <Icon name="plus" size={16} /> Add product
              </Link>
            )}
            <Link className="btn btn-primary" to="/orders">
              <Icon name="cart" size={16} /> Create order
            </Link>
          </>
        }
      />

      {error && (
        <div className="error-with-action">
          <ErrorBox error={error} />
          <button type="button" className="btn" onClick={() => setReloadKey((k) => k + 1)}>
            <Icon name="refresh" size={16} /> Try again
          </button>
        </div>
      )}

      <div className={`stat-grid ${isAdmin ? 'cols-4' : 'cols-3'}`}>
        {stats
          ? stats.cards.map((c) => (
              <Link key={c.label} to={c.to} className="stat-card">
                <span className={`stat-icon tone-${c.tone}`}>
                  <Icon name={c.icon} size={18} />
                </span>
                <span className="stat-text">
                  <span className="stat-label">{c.label}</span>
                  <span className="stat-value">
                    {typeof c.value === 'number' ? formatNumber(c.value) : c.value}
                  </span>
                </span>
              </Link>
            ))
          : !error &&
            Array.from({ length: isAdmin ? 4 : 3 }, (_, i) => (
              <div key={i} className="stat-card" aria-hidden="true">
                <span className="skeleton skeleton-icon" />
                <span className="stat-text">
                  <span className="skeleton" style={{ width: '70%' }} />
                  <span className="skeleton skeleton-lg" style={{ width: '40%' }} />
                </span>
              </div>
            ))}
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Recent orders</h2>
              <p className="muted">The latest orders across the store.</p>
            </div>
            <Link to="/orders" className="link-button">
              View all <Icon name="chevronRight" size={14} />
            </Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th className="hide-sm">Placed by</th>
                  <th className="num">Items</th>
                  <th className="num">Total</th>
                  <th className="hide-sm">Date</th>
                </tr>
              </thead>
              <tbody>
                {!stats && !error && <SkeletonRows rows={4} cols={5} />}
                {stats?.recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/orders/${o.id}`} className="strong-link">
                        #{o.id}
                      </Link>
                    </td>
                    <td className="hide-sm">{o.user.name}</td>
                    <td className="num">{o.itemCount}</td>
                    <td className="num strong">{formatAmount(o.totalAmount)}</td>
                    <td className="hide-sm muted">{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats && stats.recentOrders.length === 0 && (
            <EmptyState
              icon="receipt"
              title="No orders yet"
              message="New orders will appear here."
            />
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h2>Low stock</h2>
              <p className="muted">Fewer than {LOW_STOCK_THRESHOLD} units available.</p>
            </div>
            <Link to={isAdmin ? '/reports' : '/products'} className="link-button">
              {isAdmin ? 'Full report' : 'Products'} <Icon name="chevronRight" size={14} />
            </Link>
          </div>
          {!stats && !error && (
            <ul className="mini-list" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i}>
                  <span className="skeleton" style={{ width: '60%' }} />
                </li>
              ))}
            </ul>
          )}
          {stats && stats.lowStock.length === 0 && (
            <EmptyState
              icon="checkCircle"
              title="All stocked up"
              message="No products are below the threshold."
            />
          )}
          {stats && stats.lowStock.length > 0 && (
            <ul className="mini-list">
              {stats.lowStock.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <span className="mini-list-main">
                    <strong>{p.name}</strong>
                    <small className="mono muted">{p.sku}</small>
                  </span>
                  <span className="mini-list-side">
                    <span className="qty">{formatNumber(p.stock)} left</span>
                    <StockBadge stock={p.stock} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
