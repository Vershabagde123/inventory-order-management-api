import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
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
import { ConfirmDialog, Modal } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { fieldErrors, formatAmount, formatDate, formatNumber } from '../utils/format.js';

const EMPTY_FORM = { name: '', sku: '', price: '', stock: '' };

/** Light client-side checks for instant feedback; the backend remains the validator. */
function validate(values) {
  const errors = {};
  if (!values.name.trim()) errors.name = 'Product name is required.';
  if (!values.sku.trim()) errors.sku = 'SKU is required.';
  else if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(values.sku.trim()))
    errors.sku = 'Use letters, digits, "-" or "_" (must start with a letter or digit).';
  const price = String(values.price).trim();
  if (!price) errors.price = 'Price is required.';
  else if (!/^\d+(\.\d{1,2})?$/.test(price) || Number(price) <= 0)
    errors.price = 'Enter an amount greater than 0 with up to 2 decimals.';
  const stock = String(values.stock).trim();
  if (stock === '') errors.stock = 'Stock is required.';
  else if (!/^\d+$/.test(stock)) errors.stock = 'Stock must be a whole number of 0 or more.';
  return errors;
}

/** Keep the user's input as typed; the backend validates it again. */
function toPayload(form) {
  const stock = String(form.stock).trim();
  return {
    name: form.name.trim(),
    sku: form.sku.trim(),
    price: String(form.price).trim(),
    stock: stock === '' ? undefined : Number(stock),
  };
}

export default function ProductsPage() {
  const { can } = useAuth();
  const toast = useToast();
  // POST/PUT/DELETE /products are ADMIN-only on the backend; STAFF get a read-only page.
  const canManage = can('products.manage');

  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState(search);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState(null); // { mode, id?, values }
  const [formErrors, setFormErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => setSearchInput(search), [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.listProducts({ page, limit, search }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => {
    load();
  }, [load]);

  /** Search text and page live in the URL (shareable, and used by the header search). */
  function updateParams(next) {
    const merged = { search, page: String(page), ...next };
    const clean = {};
    if (merged.search) clean.search = merged.search;
    if (merged.page && merged.page !== '1') clean.page = merged.page;
    setParams(clean);
  }

  const openCreate = useCallback(() => {
    if (!canManage) return;
    setFormErrors({});
    setFormError(null);
    setForm({ mode: 'create', values: EMPTY_FORM });
  }, [canManage]);

  // /products?new=1 (dashboard quick action) opens the create dialog for admins.
  useEffect(() => {
    if (params.get('new') === '1') {
      openCreate();
      const next = new URLSearchParams(params);
      next.delete('new');
      setParams(next, { replace: true });
    }
  }, [params, setParams, openCreate]);

  function openEdit(p) {
    if (!canManage) return;
    setDetail(null);
    setFormErrors({});
    setFormError(null);
    setForm({
      mode: 'edit',
      id: p.id,
      values: { name: p.name, sku: p.sku, price: p.price, stock: String(p.stock) },
    });
  }

  function setValue(key, value) {
    setForm((f) => ({ ...f, values: { ...f.values, [key]: value } }));
    if (formErrors[key]) setFormErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function submitForm(e) {
    e.preventDefault();
    if (!canManage) return;
    const errors = validate(form.values);
    setFormErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    setFormError(null);
    try {
      const payload = toPayload(form.values);
      const res =
        form.mode === 'create'
          ? await api.createProduct(payload)
          : await api.updateProduct(form.id, payload);
      toast.success(
        form.mode === 'create' ? 'Product created' : 'Product updated',
        `${res.data.name} (${res.data.sku})`,
      );
      setForm(null);
      load();
    } catch (err) {
      setFormErrors(fieldErrors(err));
      setFormError(err);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!canManage || !toDelete) return;
    setDeleting(true);
    try {
      await api.deleteProduct(toDelete.id);
      toast.success('Product deleted', `${toDelete.name} (${toDelete.sku})`);
      setToDelete(null);
      load();
    } catch (err) {
      toast.error(err);
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function openDetails(id) {
    try {
      setDetail((await api.getProduct(id)).data);
    } catch (err) {
      toast.error(err);
    }
  }

  const rows = result?.data ?? [];

  return (
    <>
      <PageHeader
        title="Products"
        description={
          canManage
            ? 'Manage your product catalogue, prices and stock levels.'
            : 'Browse the product catalogue with current prices and availability.'
        }
        actions={
          canManage ? (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Icon name="plus" size={16} /> Add product
            </button>
          ) : (
            <span className="badge badge-neutral">
              <Icon name="eye" size={14} /> Read-only access
            </span>
          )
        }
      />

      <section className="card card-flush">
        <form
          className="table-toolbar"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ search: searchInput.trim(), page: '1' });
          }}
        >
          <div className="search-input">
            <Icon name="search" size={16} />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by product name or SKU"
              aria-label="Search products"
            />
          </div>
          <button type="submit" className="btn">
            Search
          </button>
          {search && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => updateParams({ search: '', page: '1' })}
            >
              Clear
            </button>
          )}
          <div className="toolbar-spacer" />
          <label className="inline-select">
            <span>Rows</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                updateParams({ page: '1' });
              }}
            >
              {[5, 10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </form>

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
                <th className="num">Price</th>
                <th className="num">Stock</th>
                <th className="hide-sm">Status</th>
                <th className="actions-col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows rows={Math.min(limit, 6)} cols={5} />}
              {!loading &&
                rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="cell-product">
                        <span className="product-thumb" aria-hidden="true">
                          {p.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                          <strong>{p.name}</strong>
                          <small className="mono muted">{p.sku}</small>
                        </span>
                      </div>
                    </td>
                    <td className="num strong">{formatAmount(p.price)}</td>
                    <td className="num">{formatNumber(p.stock)}</td>
                    <td className="hide-sm">
                      <StockBadge stock={p.stock} />
                    </td>
                    <td className="actions-col">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => openDetails(p.id)}
                          aria-label={`View ${p.name}`}
                          title="View details"
                        >
                          <Icon name="eye" size={16} />
                        </button>
                        {canManage && (
                          <>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => openEdit(p)}
                              aria-label={`Edit ${p.name}`}
                              title="Edit"
                            >
                              <Icon name="pencil" size={16} />
                            </button>
                            <button
                              type="button"
                              className="icon-btn icon-btn-danger"
                              onClick={() => setToDelete(p)}
                              aria-label={`Delete ${p.name}`}
                              title="Delete"
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!loading && !error && rows.length === 0 && (
          <EmptyState
            icon="package"
            title={search ? 'No matching products' : 'No products yet'}
            message={
              search
                ? `Nothing matches "${search}". Try another name or SKU.`
                : 'Products you add will appear here.'
            }
            action={
              search ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => updateParams({ search: '', page: '1' })}
                >
                  Clear search
                </button>
              ) : (
                canManage && (
                  <button type="button" className="btn btn-primary" onClick={openCreate}>
                    <Icon name="plus" size={16} /> Add product
                  </button>
                )
              )
            }
          />
        )}

        <div className="card-footer">
          <Pager
            pagination={result?.pagination}
            onPage={(p) => updateParams({ page: String(p) })}
          />
        </div>
      </section>

      {/* Details */}
      <Modal
        open={Boolean(detail)}
        title={detail?.name}
        description={detail && <span className="mono">{detail.sku}</span>}
        onClose={() => setDetail(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setDetail(null)}>
              Close
            </button>
            {canManage && detail && (
              <button type="button" className="btn btn-primary" onClick={() => openEdit(detail)}>
                <Icon name="pencil" size={16} /> Edit product
              </button>
            )}
          </>
        }
      >
        {detail && (
          <dl className="detail-grid">
            <div>
              <dt>Price</dt>
              <dd className="strong">{formatAmount(detail.price)}</dd>
            </div>
            <div>
              <dt>Available stock</dt>
              <dd>{formatNumber(detail.stock)} units</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StockBadge stock={detail.stock} />
              </dd>
            </div>
            <div>
              <dt>Product ID</dt>
              <dd>#{detail.id}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(detail.createdAt)}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatDate(detail.updatedAt)}</dd>
            </div>
          </dl>
        )}
      </Modal>

      {/* Create / edit (ADMIN only) */}
      {canManage && (
        <Modal
          open={Boolean(form)}
          title={form?.mode === 'create' ? 'Add product' : 'Edit product'}
          description={
            form?.mode === 'create'
              ? 'Add a new item to the catalogue.'
              : `Update details for product #${form?.id}.`
          }
          onClose={() => setForm(null)}
          busy={saving}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setForm(null)} disabled={saving}>
                Cancel
              </button>
              <button
                type="submit"
                form="product-form"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving && <span className="spinner spinner-light" aria-hidden="true" />}
                {saving ? 'Saving…' : form?.mode === 'create' ? 'Create product' : 'Save changes'}
              </button>
            </>
          }
        >
          {form && (
            <form id="product-form" className="form-grid" onSubmit={submitForm} noValidate>
              {formError && !Object.keys(fieldErrors(formError)).length && (
                <div className="span-2">
                  <ErrorBox error={formError} />
                </div>
              )}
              <Field id="p-name" label="Product name" error={formErrors.name} className="span-2">
                <input
                  id="p-name"
                  value={form.values.name}
                  onChange={(e) => setValue('name', e.target.value)}
                  placeholder="e.g. Wireless Mouse"
                  aria-invalid={Boolean(formErrors.name)}
                  aria-describedby={formErrors.name ? 'p-name-error' : undefined}
                />
              </Field>
              <Field
                id="p-sku"
                label="SKU"
                error={formErrors.sku}
                hint="Unique code, stored in upper case."
                className="span-2"
              >
                <input
                  id="p-sku"
                  value={form.values.sku}
                  onChange={(e) => setValue('sku', e.target.value)}
                  placeholder="e.g. MOU-001"
                  className="mono"
                  aria-invalid={Boolean(formErrors.sku)}
                  aria-describedby={formErrors.sku ? 'p-sku-error' : 'p-sku-hint'}
                />
              </Field>
              <Field id="p-price" label="Price" error={formErrors.price}>
                <input
                  id="p-price"
                  inputMode="decimal"
                  value={form.values.price}
                  onChange={(e) => setValue('price', e.target.value)}
                  placeholder="0.00"
                  aria-invalid={Boolean(formErrors.price)}
                  aria-describedby={formErrors.price ? 'p-price-error' : undefined}
                />
              </Field>
              <Field id="p-stock" label="Stock quantity" error={formErrors.stock}>
                <input
                  id="p-stock"
                  type="number"
                  min="0"
                  step="1"
                  value={form.values.stock}
                  onChange={(e) => setValue('stock', e.target.value)}
                  placeholder="0"
                  aria-invalid={Boolean(formErrors.stock)}
                  aria-describedby={formErrors.stock ? 'p-stock-error' : undefined}
                />
              </Field>
            </form>
          )}
        </Modal>
      )}

      {canManage && (
        <ConfirmDialog
          open={Boolean(toDelete)}
          title="Delete product?"
          message={
            toDelete &&
            `"${toDelete.name}" (${toDelete.sku}) will be permanently removed. Products that appear in existing orders cannot be deleted.`
          }
          confirmLabel="Delete product"
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}
