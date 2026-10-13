import { useEffect, useState, useRef } from "react";
import {
  Link,
  useParams,
  useSearchParams,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useApi } from "../hooks";
import { request, query } from "../api";
import { money, toMinor } from "../money";
import {
  PageTitle,
  State,
  Field,
  Select,
  AccountRows,
  Details,
  Badge,
  Pagination,
  TransactionRows,
  date,
} from "../components";
export function Accounts() {
  const [filters, setFilters] = useState({
    clientId: "",
    accountType: "",
    currency: "",
    status: "",
    page: 1,
  });
  const [clientSearch, setClientSearch] = useState("");
  const clients = useApi(
    "/clients?" + query({ search: clientSearch, pageSize: 100 }),
  );
  const meta = useApi("/metadata");
  const state = useApi("/accounts?" + query(filters));
  const change = (k, v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));
  return (
    <>
      <PageTitle
        title="Financial accounts"
        description="Account ownership, recorded balances, and current status."
        action={
          <Link className="button primary" to="/accounts/new">
            + Register account
          </Link>
        }
      />
      <div className="filters">
        <Field label="Find corporate client">
          <input
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            placeholder="Search company"
          />
        </Field>
        <Field label="Corporate client">
          <Select
            value={filters.clientId}
            onChange={(e) => change("clientId", e.target.value)}
            options={(clients.data?.data ?? []).map((c) => ({
              value: c.clientId,
              label: c.companyName,
            }))}
          />
        </Field>
        {[
          ["accountType", "Account type", "ACCOUNT_TYPES"],
          ["currency", "Currency", "CURRENCIES"],
          ["status", "Status", "ACCOUNT_STATUSES"],
        ].map(([key, label, constant]) => (
          <Field key={key} label={label}>
            <Select
              value={filters[key]}
              onChange={(e) => change(key, e.target.value)}
              options={meta.data?.data[constant] ?? []}
            />
          </Field>
        ))}
        <button
          onClick={() => {
            setClientSearch("");
            setFilters({
              clientId: "",
              accountType: "",
              currency: "",
              status: "",
              page: 1,
            });
          }}
        >
          Clear filters
        </button>
      </div>
      <State state={state}>
        {({ data, pagination }) => (
          <section className="panel">
            <AccountRows accounts={data} />
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
export function AccountDetails() {
  const { id } = useParams();
  const state = useApi("/accounts/" + id);
  const [page, setPage] = useState(1);
  const ts = useApi("/transactions?" + query({ accountId: id, page }));
  const location = useLocation();
  return (
    <>
      <PageTitle
        title="Account details"
        description="Recorded account information and related historical activity."
      />
      {location.state?.notice && (
        <p className="notice" role="status">
          {location.state.notice}
        </p>
      )}
      <State state={state}>
        {({ data: a }) => (
          <section className="panel">
            <h2>{a.accountNumber}</h2>
            <Details
              items={[
                [
                  "Corporate client",
                  <Link to={`/clients/${a.clientId}`}>
                    {a.client.companyName}
                  </Link>,
                ],
                ["Account type", a.accountType],
                ["Currency", a.currency],
                ["Recorded balance", money(a.balanceMinor, a.currency)],
                ["Status", <Badge value={a.status} />],
                ["Created", date(a.createdAt)],
                ["Account ID", a.accountId],
              ]}
            />
          </section>
        )}
      </State>
      <section className="panel">
        <h2>Related transactions</h2>
        <State state={ts}>
          {({ data, pagination }) => (
            <>
              <TransactionRows transactions={data} />
              <Pagination value={pagination} onPage={setPage} />
            </>
          )}
        </State>
      </section>
    </>
  );
}
export function AccountForm() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    clientId: searchParams.get("clientId") ?? "",
    accountType: "",
    currency: "",
    balance: "0.00",
  });
  const [search, setSearch] = useState("");
  const clients = useApi("/clients?" + query({ search, pageSize: 100 }));
  const meta = useApi("/metadata");
  const selected = useApi(
    form.clientId ? "/clients/" + form.clientId : "/health",
  );
  const [error, setError] = useState("");
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const navigate = useNavigate();
  const change = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const available = clients.data?.data ?? [];
  const options = available.map((c) => ({
    value: c.clientId,
    label: `${c.companyName} (${c.status})`,
  }));
  if (selected.data?.data && !options.some((o) => o.value === form.clientId))
    options.unshift({
      value: form.clientId,
      label: selected.data.data.companyName,
    });
  async function submit(e) {
    e.preventDefault();
    if (lock.current) return;
    let balanceMinor;
    try {
      balanceMinor = toMinor(form.balance);
    } catch (err) {
      setFields({ balanceMinor: err.message });
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setFields({});
    try {
      const { data } = await request("/accounts", {
        method: "POST",
        body: JSON.stringify({
          clientId: form.clientId,
          accountType: form.accountType,
          currency: form.currency,
          balanceMinor,
        }),
      });
      navigate("/accounts/" + data.accountId, {
        state: { notice: "Account registered successfully." },
      });
    } catch (err) {
      setError(err.message);
      setFields(err.fields ?? {});
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Register financial account"
        description="Create an active account for an active corporate client."
      />
      <State state={meta}>
        {({ data: m }) => (
          <form className="panel form" onSubmit={submit}>
            <Field label="Search corporate clients">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Company or registration number"
              />
            </Field>
            <State state={clients}>
              {() => (
                <Field label="Corporate client" error={fields.clientId}>
                  <Select
                    required
                    placeholder="Select client"
                    value={form.clientId}
                    options={options}
                    onChange={(e) => change("clientId", e.target.value)}
                  />
                </Field>
              )}
            </State>
            {form.clientId && (
              <State state={selected}>
                {({ data: c }) => (
                  <p className="selected-client">
                    {c.companyName} <Badge value={c.status} />
                    {c.status !== "Active" && (
                      <span className="error">
                        {" "}
                        Only active clients can receive new accounts.
                      </span>
                    )}
                  </p>
                )}
              </State>
            )}
            <div className="form-grid">
              <Field label="Account type" error={fields.accountType}>
                <Select
                  required
                  placeholder="Select type"
                  options={m.ACCOUNT_TYPES}
                  value={form.accountType}
                  onChange={(e) => change("accountType", e.target.value)}
                />
              </Field>
              <Field label="Currency" error={fields.currency}>
                <Select
                  required
                  placeholder="Select currency"
                  options={m.CURRENCIES}
                  value={form.currency}
                  onChange={(e) => change("currency", e.target.value)}
                />
              </Field>
              <Field label="Opening balance" error={fields.balanceMinor}>
                <input
                  required
                  inputMode="decimal"
                  value={form.balance}
                  onChange={(e) => change("balance", e.target.value)}
                  aria-describedby="balance-help"
                />
                <small id="balance-help">
                  Use up to two decimal places, for example 12500.75.
                </small>
              </Field>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button type="button" onClick={() => navigate("/accounts")}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  !form.clientId ||
                  selected.loading ||
                  selected.error ||
                  selected.data?.data?.status !== "Active"
                }
              >
                {busy ? "Saving…" : "Register account"}
              </button>
            </div>
          </form>
        )}
      </State>
    </>
  );
}
