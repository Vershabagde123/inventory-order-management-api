import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fetchAllProducts } from '../api/endpoints.js';
import {
  EmptyState,
  ErrorBox,
  Field,
  PageHeader,
  Pager,
  SkeletonRows,
  StockBadge,
} from '../components/Feedback.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../components/Toast.jsx';
import { centsToAmount, formatAmount, formatDate, formatNumber, toCents } from '../utils/format.js';

const isPositiveInt = (v) => /^\d+$/.test(String(v).trim()) && Number(v) >= 1;

export default function OrdersPage() {
  const toast = useToast();

  // ---- order history ----
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState(null);
  const [listError, setListError] = useState(null);

  const loadOrders = useCallback(async () => {
    setListError(null);
    try {
      setOrders(await api.listOrders({ page, limit: 10 }));
    } catch (err) {
      setListError(err);
    }
  }, [page]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // ---- catalogue for the order builder ----
  const [products, setProducts] = useState(null);
  const loadProducts = useCallback(async () => {
    try {
      setProducts(await fetchAllProducts());
    } catch (err) {
      toast.error(err);
    }
  }, [toast]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);

  // ---- builder state ----
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [qty, setQty] = useState('1');
  const [pickErrors, setPickErrors] = useState({});
  const [cart, setCart] = useState([]); // [{ productId, quantity: string }]
  const [lineErrors, setLineErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [placed, setPlaced] = useState(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (products ?? []).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [products, filter]);

  const selected = byId.get(Number(selectedId));

  function addItem(e) {
    e.preventDefault();
    const errs = {};
    if (!selected) errs.product = 'Choose a product.';
    if (!isPositiveInt(qty)) errs.qty = 'Enter a whole number of 1 or more.';
    setPickErrors(errs);
    if (Object.keys(errs).length) return;
    setCart((items) => {
      const existing = items.find((i) => i.productId === selected.id);
      if (existing) {
        return items.map((i) =>
          i.productId === selected.id
            ? { ...i, quantity: String(Number(i.quantity || 0) + Number(qty)) }
            : i,
        );
      }
      return [...items, { productId: selected.id, quantity: String(Number(qty)) }];
    });
    setSelectedId('');
    setQty('1');
    setPlaced(null);
    setSubmitError(null);
  }

  function setLineQty(productId, value) {
    setCart((items) =>
      items.map((i) => (i.productId === productId ? { ...i, quantity: value } : i)),
    );
    setLineErrors((e) => ({ ...e, [productId]: undefined }));
  }

  function stepLine(productId, delta) {
    const current = Number(cart.find((i) => i.productId === productId)?.quantity) || 0;
    setLineQty(productId, String(Math.max(1, current + delta)));
  }

  function removeLine(productId) {
    setCart((items) => items.filter((i) => i.productId !== productId));
    setLineErrors((e) => ({ ...e, [productId]: undefined }));
  }

  // Display-only estimate from current list prices (integer cents). The backend
  // computes the authoritative total inside its transaction.
  const estimate = cart.reduce((sum, i) => {
    const p = byId.get(i.productId);
    return p && isPositiveInt(i.quantity) ? sum + toCents(p.price) * Number(i.quantity) : sum;
  }, 0);
  const units = cart.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  async function placeOrder() {
    const errs = {};
    for (const i of cart)
      if (!isPositiveInt(i.quantity)) errs[i.productId] = 'Enter a whole number of 1 or more.';
    setLineErrors(errs);
    if (Object.keys(errs).length || cart.length === 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // Exact API payload. Stock checks, totals and stock deduction happen in the backend.
      const res = await api.createOrder(
        cart.map((i) => ({ productId: i.productId, quantity: Number(i.quantity) })),
      );
      setPlaced(res.data);
      toast.success(
        `Order #${res.data.id} placed`,
        `Total ${formatAmount(res.data.totalAmount)} · ${res.data.items.length} item(s)`,
      );
      setCart([]);
      setPage(1);
      loadOrders();
      loadProducts(); // show stock after the backend deducted it
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="Orders" description="Create new orders and review order history." />

      <div className="order-builder">
        <section className="card">
          <div className="card-header">
            <div>
              <h2>New order</h2>
              <p className="muted">Find a product, choose a quantity and add it to the order.</p>
            </div>
          </div>

          <form className="picker" onSubmit={addItem} noValidate>
            <div className="search-input">
              <Icon name="search" size={16} />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter products by name or SKU"
                aria-label="Filter products"
              />
            </div>
            <div className="picker-row">
              <Field id="o-product" label="Product" error={pickErrors.product} className="grow">
                <select
                  id="o-product"
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setPickErrors((er) => ({ ...er, product: undefined }));
                  }}
                  aria-invalid={Boolean(pickErrors.product)}
                  disabled={!products}
                >
                  <option value="">
                    {products
                      ? `Select a product (${filtered.length} available)`
                      : 'Loading products…'}
                  </option>
                  {filtered.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.sku} · {formatAmount(p.price)} · {p.stock} in stock
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="o-qty" label="Quantity" error={pickErrors.qty} className="qty-field">
                <input
                  id="o-qty"
                  type="number"
                  min="1"
                  step="1"
                  value={qty}
                  onChange={(e) => {
                    setQty(e.target.value);
                    setPickErrors((er) => ({ ...er, qty: undefined }));
                  }}
                  aria-invalid={Boolean(pickErrors.qty)}
                />
              </Field>
              <button type="submit" className="btn btn-dark picker-add">
                <Icon name="plus" size={16} /> Add item
              </button>
            </div>
            {selected && (
              <div className="picker-preview">
                <span>
                  <strong>{selected.name}</strong>{' '}
                  <span className="mono muted">{selected.sku}</span>
                </span>
                <span className="picker-preview-meta">
                  {formatAmount(selected.price)} each · {formatNumber(selected.stock)} available{' '}
                  <StockBadge stock={selected.stock} />
                </span>
              </div>
            )}
          </form>
        </section>

        <section className="card order-summary" aria-labelledby="summary-title">
          <div className="card-header">
            <div>
              <h2 id="summary-title">Order summary</h2>
              <p className="muted">
                {cart.length} product(s) · {formatNumber(units)} unit(s)
              </p>
            </div>
            {cart.length > 0 && (
              <button type="button" className="link-button" onClick={() => setCart([])}>
                Clear
              </button>
            )}
          </div>

          {placed && (
            <div className="callout callout-success" role="status">
              <Icon name="checkCircle" className="callout-icon" />
              <div className="callout-body">
                <strong>Order #{placed.id} placed successfully</strong>
                <div>
                  Total {formatAmount(placed.totalAmount)} ·{' '}
                  <Link to={`/orders/${placed.id}`}>View order details</Link>
                </div>
              </div>
            </div>
          )}

          {cart.length === 0 ? (
            <EmptyState
              icon="cart"
              title="No items yet"
              message="Products you add will appear here."
            />
          ) : (
            <ul className="cart">
              {cart.map((i) => {
                const p = byId.get(i.productId);
                const q = Number(i.quantity);
                const over = p && isPositiveInt(i.quantity) && q > p.stock;
                return (
                  <li key={i.productId} className="cart-line">
                    <div className="cart-line-main">
                      <strong>{p?.name ?? `Product #${i.productId}`}</strong>
                      <small className="muted">
                        <span className="mono">{p?.sku}</span> · {formatAmount(p?.price)} each
                      </small>
                      {over && (
                        <small className="text-warn">
                          <Icon name="warning" size={13} /> Only {p.stock} available - the server
                          will reject this quantity.
                        </small>
                      )}
                      {lineErrors[i.productId] && (
                        <small className="field-error">{lineErrors[i.productId]}</small>
                      )}
                    </div>
                    <div className="stepper" role="group" aria-label={`Quantity for ${p?.name}`}>
                      <button
                        type="button"
                        onClick={() => stepLine(i.productId, -1)}
                        aria-label="Decrease quantity"
                      >
                        <Icon name="minus" size={14} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={i.quantity}
                        onChange={(e) => setLineQty(i.productId, e.target.value)}
                        aria-label={`Quantity of ${p?.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => stepLine(i.productId, 1)}
                        aria-label="Increase quantity"
                      >
                        <Icon name="plus" size={14} />
                      </button>
                    </div>
                    <span className="cart-line-total">
                      {p && isPositiveInt(i.quantity) ? centsToAmount(toCents(p.price) * q) : '—'}
                    </span>
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      onClick={() => removeLine(i.productId)}
                      aria-label={`Remove ${p?.name}`}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <ErrorBox error={submitError} onClose={() => setSubmitError(null)} />

          <div className="summary-total">
            <span>
              Estimated total
              <small className="muted">Final amount is calculated by the server.</small>
            </span>
            <strong>{centsToAmount(estimate)}</strong>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block btn-lg"
            onClick={placeOrder}
            disabled={cart.length === 0 || submitting}
          >
            {submitting && <span className="spinner spinner-light" aria-hidden="true" />}
            {submitting ? 'Placing order…' : 'Place order'}
          </button>
        </section>
      </div>

      <section className="card card-flush">
        <div className="card-header card-header-pad">
          <div>
            <h2>Order history</h2>
            <p className="muted">All orders, newest first.</p>
          </div>
        </div>
        {listError && (
          <div className="card-inset">
            <ErrorBox error={listError} />
          </div>
        )}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th className="hide-sm">Date</th>
                <th className="hide-sm">Placed by</th>
                <th className="num">Items</th>
                <th className="num">Total</th>
                <th className="actions-col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!orders && !listError && <SkeletonRows rows={5} cols={6} />}
              {orders?.data.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/orders/${o.id}`} className="strong-link">
                      #{o.id}
                    </Link>
                  </td>
                  <td className="hide-sm muted">{formatDate(o.createdAt)}</td>
                  <td className="hide-sm">{o.user.name}</td>
                  <td className="num">{o.itemCount}</td>
                  <td className="num strong">{formatAmount(o.totalAmount)}</td>
                  <td className="actions-col">
                    <Link
                      to={`/orders/${o.id}`}
                      className="btn btn-sm"
                      aria-label={`View order ${o.id}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {orders && orders.data.length === 0 && (
          <EmptyState
            icon="receipt"
            title="No orders yet"
            message="Orders you place will be listed here."
          />
        )}
        <div className="card-footer">
          <Pager pagination={orders?.pagination} onPage={setPage} />
        </div>
      </section>
    </>
  );
}
