import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { navFor, ROLE_TITLES } from '../auth/permissions.js';
import { initials } from '../utils/format.js';
import { RoleBadge } from './Feedback.jsx';
import Icon from './Icon.jsx';

const NAV_ICONS = {
  '/': 'dashboard',
  '/products': 'package',
  '/inventory': 'layers',
  '/staff': 'users',
  '/orders': 'cart',
  '/reports': 'chart',
};

const SECTION_LABELS = {
  products: 'Products',
  inventory: 'Inventory',
  staff: 'Staff Management',
  orders: 'Orders',
  reports: 'Reports',
};

function breadcrumbsFor(pathname, role) {
  const [section, id] = pathname.split('/').filter(Boolean);
  const crumbs = [{ label: ROLE_TITLES[role] ?? 'Dashboard', to: '/' }];
  if (section) crumbs.push({ label: SECTION_LABELS[section] ?? section, to: `/${section}` });
  if (section === 'orders' && id) crumbs.push({ label: `Order #${id}` });
  return crumbs;
}

function readCollapsed() {
  try {
    return localStorage.getItem('iom.sidebar') === 'collapsed';
  } catch {
    return false;
  }
}

export default function Layout() {
  const { user, role, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => setDrawerOpen(false), [location.pathname]);
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem('iom.sidebar', c ? 'expanded' : 'collapsed');
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  }

  const crumbs = breadcrumbsFor(location.pathname, role);

  return (
    <div className={`app ${collapsed ? 'is-collapsed' : ''} ${drawerOpen ? 'drawer-open' : ''}`}>
      <aside className="sidebar" aria-label="Sidebar">
        <div className="sidebar-brand">
          <span className="logo" aria-hidden="true">
            <Icon name="package" size={18} />
          </span>
          <span className="brand-text">
            <strong>Inventory Hub</strong>
            <small>{role === 'ADMIN' ? 'Admin console' : 'Staff workspace'}</small>
          </span>
          <button
            type="button"
            className="icon-btn drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            <Icon name="x" />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <span className="nav-section">Menu</span>
          {navFor(role).map(({ path, label }) => (
            <NavLink key={path} to={path} end={path === '/'} title={collapsed ? label : undefined}>
              <Icon name={NAV_ICONS[path]} />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="avatar" aria-hidden="true">
              {initials(user?.name)}
            </span>
            <span className="sidebar-user-text">
              <strong>{user?.name}</strong>
              <small>{user?.email}</small>
            </span>
          </div>
          <button
            type="button"
            className="nav-button"
            onClick={() => logout('You have been signed out.')}
            title={collapsed ? 'Sign out' : undefined}
          >
            <Icon name="logout" />
            <span className="nav-label">Sign out</span>
          </button>
          <button
            type="button"
            className="nav-button collapse-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
          >
            <Icon name="sidebar" />
            <span className="nav-label">Collapse</span>
          </button>
        </div>
      </aside>
      <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-toggle"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            <Icon name="menu" />
          </button>
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <ol>
              {crumbs.map((c, i) => (
                <li key={i}>
                  {i > 0 && <Icon name="chevronRight" size={14} className="crumb-sep" />}
                  {c.to && i < crumbs.length - 1 ? (
                    <Link to={c.to}>{c.label}</Link>
                  ) : (
                    <span aria-current="page">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <form
            className="topbar-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const q = query.trim();
              navigate(q ? `/products?search=${encodeURIComponent(q)}` : '/products');
              setQuery('');
            }}
          >
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Search products by name or SKU…"
              aria-label="Search products"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <UserMenu user={user} role={role} onLogout={() => logout('You have been signed out.')} />
        </header>

        <main className="content" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function UserMenu({ user, role, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-menu-button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user?.name}`}
      >
        <span className="avatar avatar-sm" aria-hidden="true">
          {initials(user?.name)}
        </span>
        <span className="user-menu-text">
          <strong>{user?.name}</strong>
          <small>{role === 'ADMIN' ? 'Administrator' : 'Staff'}</small>
        </span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-head">
            <strong>{user?.name}</strong>
            <small>{user?.email}</small>
            <RoleBadge role={role} />
          </div>
          <div className="user-menu-meta muted">API: {API_BASE_URL}</div>
          <button type="button" role="menuitem" className="user-menu-item" onClick={onLogout}>
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
