import { useId, Children, cloneElement, isValidElement } from "react";
import { Link } from "react-router-dom";
import { money } from "./money";
export const date = (value) =>
  new Date(value).toLocaleString("en-CA", { timeZone: "UTC" }) + " UTC";
export function Badge({ value }) {
  return <span className={`badge ${value?.toLowerCase()}`}>{value}</span>;
}
export function PageTitle({
  eyebrow = "FINANCIAL OPERATIONS",
  title,
  description,
  action,
}) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function State({ state, children }) {
  if (state.loading)
    return (
      <div className="state" role="status">
        Loading records…
      </div>
    );
  if (state.error)
    return (
      <div className="state error" role="alert">
        <strong>Unable to load this view</strong>
        <p>{state.error.message}</p>
        <button onClick={state.retry}>Try again</button>
      </div>
    );
  return children(state.data);
}
export function Pagination({ value, onPage }) {
  return (
    <div className="pagination">
      <span>
        {value.total} records · Page {value.page} of{" "}
        {Math.max(1, value.totalPages)}
      </span>
      <div>
        <button
          disabled={value.page <= 1}
          onClick={() => onPage(value.page - 1)}
        >
          Previous
        </button>
        <button
          disabled={value.page >= value.totalPages}
          onClick={() => onPage(value.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
export function Field({ label, error, children }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child, index) =>
        index === 0 && isValidElement(child)
          ? cloneElement(child, {
              id,
              "aria-invalid": !!error,
              "aria-describedby":
                [child.props["aria-describedby"], error ? id + "-error" : null]
                  .filter(Boolean)
                  .join(" ") || undefined,
            })
          : child,
      )}
      {error && (
        <span id={id + "-error"} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
export function Select({
  value,
  onChange,
  options,
  placeholder = "All",
  ...rest
}) {
  return (
    <select value={value ?? ""} onChange={onChange} {...rest}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option
          key={typeof o === "string" ? o : o.value}
          value={typeof o === "string" ? o : o.value}
        >
          {typeof o === "string" ? o : o.label}
        </option>
      ))}
    </select>
  );
}
export function Table({ headers, children, empty }) {
  return (
    <>
      <p className="table-hint">Scroll horizontally to view all columns.</p>
      <div
        className="table-wrap"
        tabIndex="0"
        role="region"
        aria-label="Financial records"
      >
        <table>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {empty ? (
              <tr>
                <td className="empty" colSpan={headers.length}>
                  No matching records found.
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
export function AccountRows({ accounts }) {
  return (
    <Table
      headers={[
        "Account number",
        "Corporate client",
        "Type",
        "Balance",
        "Status",
      ]}
      empty={!accounts.length}
    >
      {accounts.map((a) => (
        <tr key={a.accountId}>
          <td>
            <Link to={`/accounts/${a.accountId}`}>{a.accountNumber}</Link>
          </td>
          <td>
            {a.companyName ?? (
              <Link to={`/clients/${a.clientId}`}>View client</Link>
            )}
          </td>
          <td>{a.accountType}</td>
          <td className="numeric">{money(a.balanceMinor, a.currency)}</td>
          <td>
            <Badge value={a.status} />
          </td>
        </tr>
      ))}
    </Table>
  );
}
export function TransactionRows({ transactions }) {
  return (
    <Table
      headers={[
        "Reference",
        "Created at",
        "Source → Destination",
        "Amount",
        "Status",
      ]}
      empty={!transactions.length}
    >
      {transactions.map((t) => (
        <tr key={t.transactionId}>
          <td>
            <Link to={`/transactions/${t.transactionId}`}>
              {t.referenceNumber}
            </Link>
          </td>
          <td>{date(t.createdAt)}</td>
          <td className="account-pair">
            <Link to={`/accounts/${t.sourceAccountId}`}>
              {t.sourceAccountNumber}
            </Link>
            <span>→</span>
            <Link to={`/accounts/${t.destinationAccountId}`}>
              {t.destinationAccountNumber}
            </Link>
          </td>
          <td className="numeric">{money(t.amountMinor, t.currency)}</td>
          <td>
            <Badge value={t.status} />
          </td>
        </tr>
      ))}
    </Table>
  );
}
export function Details({ items }) {
  return (
    <dl className="details">
      {items.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
