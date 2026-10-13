import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useApi } from "../hooks";
import { query } from "../api";
import { money } from "../money";
import {
  PageTitle,
  State,
  Field,
  Select,
  TransactionRows,
  Details,
  Badge,
  Pagination,
  date,
} from "../components";
export function Transactions() {
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({
    search: "",
    sourceAccountId: params.get("sourceAccountId") ?? "",
    status: "",
    from: "",
    to: "",
    page: 1,
  });
  const [accountPage, setAccountPage] = useState(1);
  const accounts = useApi(
    "/accounts?" + query({ pageSize: 100, page: accountPage }),
  );
  const meta = useApi("/metadata");
  const state = useApi("/transactions?" + query(filters));
  const change = (k, v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));
  return (
    <>
      <PageTitle
        title="Transaction history"
        description="Search and investigate recorded financial activity. Transactions are read-only."
      />
      <div className="filters">
        <Field label="Reference number">
          <input
            placeholder="TXN-2026-000001"
            value={filters.search}
            onChange={(e) => change("search", e.target.value)}
          />
        </Field>
        <Field label="Source account">
          <Select
            value={filters.sourceAccountId}
            onChange={(e) => change("sourceAccountId", e.target.value)}
            options={(accounts.data?.data ?? []).map((a) => ({
              value: a.accountId,
              label: a.accountNumber,
            }))}
          />
        </Field>
        <Field label="Status">
          <Select
            value={filters.status}
            onChange={(e) => change("status", e.target.value)}
            options={meta.data?.data.TRANSACTION_STATUSES ?? []}
          />
        </Field>
        <Field label="From date (UTC)">
          <input
            type="date"
            value={filters.from}
            onChange={(e) => change("from", e.target.value)}
          />
        </Field>
        <Field label="To date (UTC)">
          <input
            type="date"
            value={filters.to}
            onChange={(e) => change("to", e.target.value)}
          />
        </Field>
        <button
          onClick={() =>
            setFilters({
              search: "",
              sourceAccountId: "",
              status: "",
              from: "",
              to: "",
              page: 1,
            })
          }
        >
          Clear filters
        </button>
      </div>
      {accounts.data?.pagination.totalPages > 1 && (
        <div className="pagination">
          <span>Source account choices</span>
          <button
            disabled={accountPage === 1}
            onClick={() => setAccountPage((v) => v - 1)}
          >
            Previous choices
          </button>
          <button
            disabled={accountPage >= accounts.data.pagination.totalPages}
            onClick={() => setAccountPage((v) => v + 1)}
          >
            Next choices
          </button>
        </div>
      )}
      <State state={state}>
        {({ data, pagination }) => (
          <section className="panel">
            <TransactionRows transactions={data} />
            <Pagination
              value={pagination}
              onPage={(page) => setFilters((f) => ({ ...f, page }))}
            />
          </section>
        )}
      </State>
    </>
  );
}
export function TransactionDetails() {
  const { id } = useParams();
  const state = useApi("/transactions/" + id);
  return (
    <>
      <PageTitle
        title="Transaction details"
        description="Historical record · No funds are moved by viewing this information."
      />
      <State state={state}>
        {({ data: t }) => (
          <section className="panel">
            <h2>{t.referenceNumber}</h2>
            <Details
              items={[
                ["Reference", t.referenceNumber],
                ["Status", <Badge value={t.status} />],
                ["Amount", money(t.amountMinor, t.currency)],
                ["Currency", t.currency],
                ["Type", t.transactionType],
                [
                  "Source account",
                  <Link to={`/accounts/${t.sourceAccountId}`}>
                    {t.sourceAccount.accountNumber}
                  </Link>,
                ],
                [
                  "Destination account",
                  <Link to={`/accounts/${t.destinationAccountId}`}>
                    {t.destinationAccount.accountNumber}
                  </Link>,
                ],
                ["Description", t.description],
                ["Created", date(t.createdAt)],
                ["Transaction ID", t.transactionId],
              ]}
            />
          </section>
        )}
      </State>
    </>
  );
}
