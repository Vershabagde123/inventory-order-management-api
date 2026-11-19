import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/endpoints.js';
import { ErrorBox, PageHeader, SkeletonRows } from '../components/Feedback.jsx';
import Icon from '../components/Icon.jsx';
import { formatAmount, formatDate, formatNumber } from '../utils/format.js';

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setOrder(null);
    setError(null);
    api
      .getOrder(id)
      .then((res) => setOrder(res.data))
      .catch(setError);
  }, [id]);

  const units = order?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <>
      <PageHeader
        title={`Order #${id}`}
        description={
          order ? `Placed by ${order.user.name} on ${formatDate(order.createdAt)}` : 'Order details'
        }
        actions={
          <Link to="/orders" className="btn">
            <Icon name="arrowLeft" size={16} /> Back to orders
          </Link>
        }
      />
      <ErrorBox error={error} />

      {!error && (
        <div className="stat-grid cols-4">
          {[
            ['Total amount', order && formatAmount(order.totalAmount), 'receipt', 'emerald'],
            ['Products', order && order.items.length, 'package', 'navy'],
            ['Units', order && formatNumber(units), 'layers', 'yellow'],
            ['Placed by', order && order.user.name, 'users', 'orange'],
          ].map(([label, value, icon, tone]) => (
            <div key={label} className="stat-card">
              <span className={`stat-icon tone-${tone}`}>
                <Icon name={icon} size={18} />
              </span>
              <span className="stat-text">
                <span className="stat-label">{label}</span>
                {order ? (
                  <span className="stat-value stat-value-sm">{value}</span>
                ) : (
                  <span className="skeleton skeleton-lg" style={{ width: '50%' }} />
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {!error && (
        <section className="card card-flush">
          <div className="card-header card-header-pad">
            <div>
              <h2>Items</h2>
              <p className="muted">Unit prices are the prices at the time of purchase.</p>
            </div>
            {order && <span className="muted mono">{order.user.email}</span>}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Qty</th>
                  <th className="num hide-sm">Unit price</th>
                  <th className="num">Line total</th>
                </tr>
              </thead>
              <tbody>
                {!order && <SkeletonRows rows={3} cols={4} />}
                {order?.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.productName}</strong>
                      <small className="mono muted block">{i.sku}</small>
                    </td>
                    <td className="num">{formatNumber(i.quantity)}</td>
                    <td className="num hide-sm">{formatAmount(i.unitPrice)}</td>
                    <td className="num strong">{formatAmount(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              {order && (
                <tfoot>
                  <tr>
                    <td colSpan={2} className="hide-sm" />
                    <td className="num">Total</td>
                    <td className="num total-cell">{formatAmount(order.totalAmount)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}
    </>
  );
}
