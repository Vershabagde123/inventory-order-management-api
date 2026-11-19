import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/endpoints.js';
import { formatAmount, formatNumber, LOW_STOCK_THRESHOLD } from '../utils/format.js';
import { EmptyState, ErrorBox, SkeletonRows, StockBadge } from './Feedback.jsx';
import Icon from './Icon.jsx';

/**
 * GET /reports/low-stock?threshold=N - products with stock strictly below N.
 * `refreshKey` re-runs the report (e.g. after a stock update).
 */
export default function LowStockReport({ refreshKey = 0 }) {
  const [thresholdInput, setThresholdInput] = useState(String(LOW_STOCK_THRESHOLD));
  const [threshold, setThreshold] = useState(String(LOW_STOCK_THRESHOLD));
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (value) => {
    setLoading(true);
    setError(null);
    try {
      setReport(await api.lowStock(value));
    } catch (err) {
      setError(err);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run(threshold);
  }, [run, threshold, refreshKey]);

  return (
    <>
      <form
        className="table-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          if (thresholdInput === threshold) run(thresholdInput);
          else setThreshold(thresholdInput);
        }}
      >
        <label className="inline-select" htmlFor="threshold">
          <span>Stock below</span>
          <input
            id="threshold"
            className="input-narrow"
            type="number"
            min="0"
            step="1"
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
          />
          <span>units</span>
        </label>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          <Icon name="refresh" size={16} /> Run report
        </button>
        <div className="toolbar-spacer" />
        {report && !loading && (
          <span className="muted">
            {report.count} product(s) below {report.threshold}
          </span>
        )}
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
              <th className="hide-sm">SKU</th>
              <th className="num hide-sm">Price</th>
              <th className="num">Available</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <SkeletonRows rows={4} cols={5} />}
            {!loading &&
              report?.data.map((p) => (
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
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!loading && report && report.data.length === 0 && (
        <EmptyState
          icon="checkCircle"
          title="Nothing below the threshold"
          message={`No products have fewer than ${report.threshold} units in stock.`}
        />
      )}
    </>
  );
}
