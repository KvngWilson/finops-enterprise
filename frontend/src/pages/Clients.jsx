import { useState, useRef } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { useApi } from "../hooks";
import { request, query } from "../api";
import {
  PageTitle,
  State,
  Pagination,
  Field,
  Select,
  Table,
  Badge,
  Details,
  AccountRows,
  date,
} from "../components";
export function Clients() {
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    industry: "",
    page: 1,
  });
  const metadata = useApi("/metadata");
  const state = useApi("/clients?" + query(filters));
  const change = (key, value) =>
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  return (
    <>
      <PageTitle
        title="Corporate clients"
        description="Register and maintain your corporate customer portfolio."
        action={
          <Link className="button primary" to="/clients/new">
            + Register client
          </Link>
        }
      />
      <div className="filters">
        <Field label="Search clients">
          <input
            placeholder="Company or registration number"
            value={filters.search}
            onChange={(e) => change("search", e.target.value)}
          />
        </Field>
        <Field label="Status">
          <Select
            value={filters.status}
            onChange={(e) => change("status", e.target.value)}
            options={metadata.data?.data.CLIENT_STATUSES ?? []}
          />
        </Field>
        <Field label="Industry">
          <Select
            value={filters.industry}
            onChange={(e) => change("industry", e.target.value)}
            options={metadata.data?.data.INDUSTRIES ?? []}
          />
        </Field>
        <button
          onClick={() =>
            setFilters({ search: "", status: "", industry: "", page: 1 })
          }
        >
          Clear filters
        </button>
      </div>
      <State state={state}>
        {({ data, pagination }) => (
          <section className="panel">
            <Table
              headers={[
                "Company",
                "Registration",
                "Industry",
                "Country",
                "Status",
              ]}
              empty={!data.length}
            >
              {data.map((c) => (
                <tr key={c.clientId}>
                  <td>
                    <Link to={`/clients/${c.clientId}`}>{c.companyName}</Link>
                  </td>
                  <td>{c.registrationNumber}</td>
                  <td>{c.industry}</td>
                  <td>{c.country}</td>
                  <td>
                    <Badge value={c.status} />
                  </td>
                </tr>
              ))}
            </Table>
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
export function ClientDetails() {
  const { id } = useParams();
  const state = useApi("/clients/" + id);
  const location = useLocation();
  return (
    <>
      <PageTitle
        title="Client profile"
        description="Business information and associated financial accounts."
        action={
          <Link className="button primary" to={`/clients/${id}/edit`}>
            Edit client
          </Link>
        }
      />
      {location.state?.notice && (
        <p className="notice" role="status">
          {location.state.notice}
        </p>
      )}
      <State state={state}>
        {({ data: c }) => (
          <>
            <section className="panel">
              <h2>{c.companyName}</h2>
              <Details
                items={Object.entries({
                  Registration: c.registrationNumber,
                  Industry: c.industry,
                  Country: c.country,
                  Email: c.contactEmail,
                  Phone: c.contactPhone || "—",
                  Status: <Badge value={c.status} />,
                  Created: date(c.createdAt),
                  "Last updated": date(c.updatedAt),
                  "Client ID": c.clientId,
                })}
              />
            </section>
            <section className="panel">
              <div className="section-title">
                <h2>Financial accounts</h2>
                <Link to={`/accounts/new?clientId=${id}`}>
                  + Register account
                </Link>
              </div>
              <AccountRows accounts={c.accounts} />
            </section>
          </>
        )}
      </State>
    </>
  );
}
const blank = {
  companyName: "",
  registrationNumber: "",
  industry: "",
  country: "",
  contactEmail: "",
  contactPhone: "",
};
export function ClientForm() {
  const { id } = useParams();
  const meta = useApi("/metadata");
  const existing = useApi(id ? "/clients/" + id : "/health");
  return (
    <>
      <PageTitle
        title={id ? "Edit corporate client" : "Register corporate client"}
        description={
          id
            ? "Update business information. Registration identifiers are immutable."
            : "Enter the organization’s registration and contact information."
        }
      />
      <State state={meta}>
        {({ data: options }) => (
          <State state={existing}>
            {(payload) => (
              <Form
                key={id ?? "new"}
                id={id}
                options={options}
                initial={id ? payload.data : blank}
              />
            )}
          </State>
        )}
      </State>
    </>
  );
}
function Form({ id, options, initial }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const navigate = useNavigate();
  const change = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  async function submit(e) {
    e.preventDefault();
    if (lock.current) return;
    const fields = {};
    if (
      form.companyName.trim().length < 2 ||
      form.companyName.trim().length > 150
    )
      fields.companyName = "Use 2–150 characters.";
    if (
      !id &&
      (form.registrationNumber.trim().length < 5 ||
        form.registrationNumber.trim().length > 30)
    )
      fields.registrationNumber = "Use 5–30 characters.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim()))
      fields.contactEmail = "Enter a valid email address.";
    if (!form.industry) fields.industry = "Select an industry.";
    if (!form.country) fields.country = "Select a country.";
    setErrors(fields);
    if (Object.keys(fields).length) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const body = Object.fromEntries(
        [
          "companyName",
          "industry",
          "country",
          "contactEmail",
          "contactPhone",
          ...(id ? ["status"] : ["registrationNumber"]),
        ].map((k) => [k, form[k]]),
      );
      const { data } = await request("/clients" + (id ? "/" + id : ""), {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      navigate("/clients/" + data.clientId, {
        state: {
          notice: id
            ? "Client updated successfully."
            : "Client registered successfully.",
        },
      });
    } catch (err) {
      setError(err.message);
      setErrors(err.fields ?? {});
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="panel form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Registered company name" error={errors.companyName}>
          <input
            required
            maxLength={150}
            value={form.companyName}
            onChange={(e) => change("companyName", e.target.value)}
          />
        </Field>
        <Field
          label="Business registration number"
          error={errors.registrationNumber}
        >
          <input
            required
            disabled={!!id}
            maxLength={30}
            value={form.registrationNumber}
            onChange={(e) => change("registrationNumber", e.target.value)}
          />
        </Field>
        <Field label="Industry" error={errors.industry}>
          <Select
            required
            placeholder="Select industry"
            value={form.industry}
            options={options.INDUSTRIES}
            onChange={(e) => change("industry", e.target.value)}
          />
        </Field>
        <Field label="Country" error={errors.country}>
          <Select
            required
            placeholder="Select country"
            value={form.country}
            options={options.COUNTRIES}
            onChange={(e) => change("country", e.target.value)}
          />
        </Field>
        <Field label="Contact email" error={errors.contactEmail}>
          <input
            required
            type="email"
            value={form.contactEmail}
            onChange={(e) => change("contactEmail", e.target.value)}
          />
        </Field>
        <Field label="Contact phone (optional)" error={errors.contactPhone}>
          <input
            maxLength={30}
            value={form.contactPhone}
            onChange={(e) => change("contactPhone", e.target.value)}
          />
        </Field>
        {id && (
          <Field label="Client status" error={errors.status}>
            <Select
              required
              placeholder="Select status"
              value={form.status}
              options={options.CLIENT_STATUSES}
              onChange={(e) => change("status", e.target.value)}
            />
          </Field>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          onClick={() => navigate(id ? "/clients/" + id : "/clients")}
        >
          Cancel
        </button>
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : id ? "Save changes" : "Register client"}
        </button>
      </div>
    </form>
  );
}
