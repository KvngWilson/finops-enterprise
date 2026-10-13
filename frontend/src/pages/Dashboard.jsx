import { Link } from "react-router-dom";
import { useApi } from "../hooks";
import { PageTitle, State, TransactionRows } from "../components";
export default function Dashboard() {
  const state = useApi("/dashboard/summary");
  return (
    <>
      <PageTitle
        title="Operations overview"
        description="Your corporate banking portfolio at a glance."
        action={
          <Link className="button primary" to="/clients/new">
            + Register client
          </Link>
        }
      />
      <State state={state}>
        {({ data: d }) => (
          <>
            <div className="metrics">
              {[
                ["Corporate clients", d.totalClients],
                ["Active clients", d.activeClients],
                ["Active accounts", d.activeAccounts],
                ["Recorded transactions", d.totalTransactions],
                ["Pending transactions", d.pendingTransactions],
                ["Completed transactions", d.completedTransactions],
                ["Rejected transactions", d.rejectedTransactions],
              ].map(([label, value]) => (
                <article className="metric" key={label}>
                  <p>{label}</p>
                  <strong>{value}</strong>
                  <span>Current recorded portfolio</span>
                </article>
              ))}
            </div>
            <section className="panel">
              <div className="section-title">
                <h2>Transaction status</h2>
                <span className="muted">Historical activity</span>
              </div>
              <div
                className="chart"
                role="img"
                aria-label={Object.entries(d.statusCounts)
                  .map(([s, n]) => `${s}: ${n}`)
                  .join(", ")}
              >
                {Object.entries(d.statusCounts).map(([s, n]) => (
                  <div className="chart-row" key={s}>
                    <span>{s}</span>
                    <div className="track">
                      <div
                        className={`bar ${s.toLowerCase()}`}
                        style={{
                          width: `${d.totalTransactions ? (n / d.totalTransactions) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <strong>{n}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="section-title">
                <h2>Recent transactions</h2>
                <Link to="/transactions">View all activity →</Link>
              </div>
              <TransactionRows transactions={d.recentTransactions} />
            </section>
          </>
        )}
      </State>
    </>
  );
}
