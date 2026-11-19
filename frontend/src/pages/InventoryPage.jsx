import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fetchAllProducts } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  EmptyState,
  ErrorBox,
  PageHeader,
  SkeletonRows,
  StockBadge,
} from '../components/Feedback.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatAmount, formatNumber, stockStatus } from '../utils/format.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in', label: 'In stock' },
  { key: 'low', label: 'Low stock' },
  { key: 'out', label: 'Out of stock' },
];

export default function InventoryPage() {
  const { can } = useAuth();
  const toast = useToast();
  // Stock is changed through PUT /products/:id, which the backend allows for ADMIN only.
  const canUpdate = can('inventory.update');
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState({}); // productId -> stock input value
  const [rowErrors, setRowErrors] = useState({});
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProducts(await fetchAllProducts());
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { all: 0, in: 0, low: 0, out: 0 };
    for (const p of products ?? []) {
      c.all += 1;
      c[stockStatus(p.stock).key] += 1;
    }
    return c;
  }, [products]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter(
      (p) =>
        (filter === 'all' || stockStatus(p.stock).key === filter) &&
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)),
    );
  }, [products, filter, search]);

  async function saveStock(product) {
    if (!canUpdate) return;
    const raw = String(edits[product.id] ?? '').trim();
    if (!/^\d+$/.test(raw)) {
      setRowErrors((e) => ({ ...e, [product.id]: 'Enter a whole number of 0 or more.' }));
      return;
    }
    setSavingId(product.id);
    setRowErrors((e) => ({ ...e, [product.id]: undefined }));
    try {
      const res = await api.updateProduct(product.id, { stock: Number(raw) });
      toast.success(
        'Stock updated',
        `${res.data.sku}: ${formatNumber(product.stock)} → ${formatNumber(res.data.stock)} units`,
      );
      setEdits(({ [product.id]: _removed, ...rest }) => rest);
      setProducts((list) => list.map((p) => (p.id === res.data.id ? res.data : p)));
    } catch (err) {
      setRowErrors((e) => ({ ...e, [product.id]: err.details?.[0]?.message ?? err.message }));
      toast.error(err);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Monitor stock levels across all products and adjust quantities."
        actions={
          <button type="button" className="btn" onClick={load}>
            <Icon name="refresh" size={16} /> Refresh
          </button>
        }
      />

      <section className="card card-flush">
        <div className="table-toolbar">
          <div className="segmented" role="tablist" aria-label="Filter by stock status">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                className={filter === f.key ? 'is-active' : ''}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                <span className="segmented-count">{products ? counts[f.key] : '–'}</span>
              </button>
            ))}
          </div>
          <div className="toolbar-spacer" />
          <div className="search-input">
            <Icon name="search" size={16} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name or SKU"
              aria-label="Filter inventory"
            />
          </div>
        </div>

        {error && (
          <div className="card-inset">
            <ErrorBox error={error} />
          </div>
        )}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="hide-sm">SKU</th>
                <th className="num hide-sm">Price</th>
                <th className="num">Available</th>
                <th>Status</th>
                {canUpdate && <th className="update-col">Update stock</th>}
              </tr>
            </thead>
            <tbody>
              {!products && !error && <SkeletonRows rows={6} cols={canUpdate ? 6 : 5} />}
              {visible.map((p) => {
                const dirty = edits[p.id] !== undefined && edits[p.id] !== '';
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td className="hide-sm mono muted">{p.sku}</td>
                    <td className="num hide-sm">{formatAmount(p.price)}</td>
                    <td className="num strong">{formatNumber(p.stock)}</td>
                    <td>
                      <StockBadge stock={p.stock} />
                    </td>
                    {canUpdate && (
                      <td className="update-col">
                        <form
                          className="stock-editor"
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveStock(p);
                          }}
                        >
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className={rowErrors[p.id] ? 'is-invalid' : ''}
                            placeholder={String(p.stock)}
                            value={edits[p.id] ?? ''}
                            onChange={(e) => {
                              setEdits({ ...edits, [p.id]: e.target.value });
                              setRowErrors((er) => ({ ...er, [p.id]: undefined }));
                            }}
                            aria-label={`New stock quantity for ${p.name}`}
                          />
                          <button
                            type="submit"
                            className={`btn btn-sm ${dirty ? 'btn-primary' : ''}`}
                            disabled={!dirty || savingId === p.id}
                          >
                            {savingId === p.id ? (
                              <span className="spinner spinner-light" aria-label="Saving" />
                            ) : (
                              'Save'
                            )}
                          </button>
                        </form>
                        {rowErrors[p.id] && <p className="field-error">{rowErrors[p.id]}</p>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {products && visible.length === 0 && (
          <EmptyState
            icon="layers"
            title="No products match"
            message="Try a different status filter or search term."
            action={
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFilter('all');
                  setSearch('');
                }}
              >
                Reset filters
              </button>
            }
          />
        )}
        {products && visible.length > 0 && (
          <div className="card-footer muted">
            Showing {visible.length} of {products.length} products
          </div>
        )}
      </section>
    </>
  );
}
