import { PageHeader } from '../components/Feedback.jsx';
import LowStockReport from '../components/LowStockReport.jsx';

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Identify products that need restocking. Uses the low-stock report API."
      />
      <section className="card card-flush">
        <div className="card-header card-header-pad">
          <div>
            <h2>Low-stock report</h2>
            <p className="muted">Products with stock strictly below the chosen threshold.</p>
          </div>
        </div>
        <LowStockReport />
      </section>
    </>
  );
}
