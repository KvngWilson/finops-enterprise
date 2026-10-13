import { randomUUID } from "node:crypto";
import { AppError, invalid, notFound } from "../domain/errors.js";
import * as v from "../domain/validation.js";
import * as c from "../domain/constants.js";
const now = () => new Date().toISOString();
const newest = (a, b) =>
  b.createdAt.localeCompare(a.createdAt) ||
  b.transactionId.localeCompare(a.transactionId);
export function createServices(repos) {
  const clientFields = [
    "companyName",
    "industry",
    "country",
    "contactEmail",
    "contactPhone",
  ];
  function clientValues(body, partial = false) {
    const result = {};
    for (const key of clientFields) {
      if (partial && !(key in body)) continue;
      if (key === "companyName") result[key] = v.string(body[key], key, 2, 150);
      if (key === "industry")
        result[key] = v.choice(body[key], key, c.INDUSTRIES);
      if (key === "country")
        result[key] = v.choice(body[key], key, c.COUNTRIES);
      if (key === "contactEmail") result[key] = v.email(body[key]);
      if (key === "contactPhone")
        result[key] =
          body[key] === undefined ? "" : v.string(body[key], key, 0, 30);
    }
    if ("status" in body)
      result.status = v.choice(body.status, "status", c.CLIENT_STATUSES);
    return result;
  }
  const clients = {
    async list(q) {
      const paging = v.pagination(q);
      const search = (v.scalar(q.search, "search") ?? "").trim().toLowerCase();
      const status = q.status
        ? v.choice(v.scalar(q.status, "status"), "status", c.CLIENT_STATUSES)
        : undefined;
      const industry = q.industry
        ? v.choice(v.scalar(q.industry, "industry"), "industry", c.INDUSTRIES)
        : undefined;
      const rows = (await repos.clients.findAll())
        .filter(
          (r) =>
            (!search ||
              r.companyName.toLowerCase().includes(search) ||
              r.registrationNumber.toLowerCase().includes(search)) &&
            (!status || r.status === status) &&
            (!industry || r.industry === industry),
        )
        .sort(
          (a, b) =>
            a.companyName.localeCompare(b.companyName) ||
            a.clientId.localeCompare(b.clientId),
        );
      return v.pageOf(rows, paging);
    },
    async get(id) {
      v.id(id, "clientId");
      const r = await repos.clients.findById(id);
      if (!r) throw notFound("Client");
      return {
        ...r,
        accounts: (await repos.accounts.findAll()).filter(
          (a) => a.clientId === id,
        ),
      };
    },
    async create(body) {
      v.allowedFields(body, [...clientFields, "registrationNumber"]);
      const values = clientValues(body);
      const registrationNumber = v.string(
        body.registrationNumber,
        "registrationNumber",
        5,
        30,
      );
      const stamp = now();
      const record = {
        ...values,
        registrationNumber,
        clientId: randomUUID(),
        status: "Active",
        createdAt: stamp,
        updatedAt: stamp,
      };
      return repos.clients.insert(record, (rows) => {
        if (
          rows.some(
            (r) =>
              r.registrationNumber.toLowerCase() ===
              registrationNumber.toLowerCase(),
          )
        )
          throw new AppError(
            409,
            "DUPLICATE_REGISTRATION",
            "Registration number already exists.",
            { registrationNumber: "Already registered." },
          );
      });
    },
    async update(id, body) {
      v.id(id, "clientId");
      v.allowedFields(body, [...clientFields, "status"]);
      if (!Object.keys(body).length)
        throw invalid("body", "Provide at least one editable field.");
      const values = clientValues(body, true);
      return repos.clients.update(id, (current) => {
        if (!current) throw notFound("Client");
        return { ...current, ...values, updatedAt: now() };
      });
    },
  };
  const accounts = {
    async list(q) {
      const paging = v.pagination(q);
      const filters = {};
      for (const [key, options] of [
        ["accountType", c.ACCOUNT_TYPES],
        ["currency", c.CURRENCIES],
        ["status", c.ACCOUNT_STATUSES],
      ])
        if (q[key])
          filters[key] = v.choice(v.scalar(q[key], key), key, options);
      if (q.clientId)
        filters.clientId = v.id(v.scalar(q.clientId, "clientId"), "clientId");
      const names = new Map(
        (await repos.clients.findAll()).map((r) => [r.clientId, r.companyName]),
      );
      const rows = (await repos.accounts.findAll())
        .filter((r) => Object.entries(filters).every(([k, x]) => r[k] === x))
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) ||
            a.accountId.localeCompare(b.accountId),
        )
        .map((a) => ({ ...a, companyName: names.get(a.clientId) }));
      return v.pageOf(rows, paging);
    },
    async get(id) {
      v.id(id, "accountId");
      const account = await repos.accounts.findById(id);
      if (!account) throw notFound("Account");
      return {
        ...account,
        client: await repos.clients.findById(account.clientId),
      };
    },
    async create(body) {
      v.allowedFields(body, [
        "clientId",
        "accountType",
        "currency",
        "balanceMinor",
      ]);
      v.id(body.clientId, "clientId");
      const accountType = v.choice(
          body.accountType,
          "accountType",
          c.ACCOUNT_TYPES,
        ),
        currency = v.choice(body.currency, "currency", c.CURRENCIES),
        balanceMinor = v.minor(body.balanceMinor);
      const client = await repos.clients.findById(body.clientId);
      if (!client) throw notFound("Client");
      if (client.status !== "Active")
        throw new AppError(
          409,
          "CLIENT_NOT_ACTIVE",
          "Only active clients can receive new accounts.",
        );
      const record = {
        accountId: randomUUID(),
        clientId: body.clientId,
        accountNumber: `SIM-${randomUUID()}`,
        accountType,
        currency,
        balanceMinor,
        status: "Active",
        createdAt: now(),
      };
      return repos.accounts.insert(record, (rows) => {
        if (rows.some((r) => r.accountNumber === record.accountNumber))
          throw new AppError(
            409,
            "ACCOUNT_NUMBER_CONFLICT",
            "Try creating the account again.",
          );
      });
    },
  };
  async function decorateTransactions(rows) {
    const accounts = await repos.accounts.findAll();
    const map = new Map(accounts.map((a) => [a.accountId, a.accountNumber]));
    return rows.map((t) => ({
      ...t,
      sourceAccountNumber: map.get(t.sourceAccountId),
      destinationAccountNumber: map.get(t.destinationAccountId),
    }));
  }
  const transactions = {
    async list(q) {
      const paging = v.pagination(q);
      const search = (v.scalar(q.search, "search") ?? "").trim().toLowerCase();
      const source = q.sourceAccountId
        ? v.id(
            v.scalar(q.sourceAccountId, "sourceAccountId"),
            "sourceAccountId",
          )
        : undefined;
      const account = q.accountId
        ? v.id(v.scalar(q.accountId, "accountId"), "accountId")
        : undefined;
      const status = q.status
        ? v.choice(
            v.scalar(q.status, "status"),
            "status",
            c.TRANSACTION_STATUSES,
          )
        : undefined;
      const from = v.dateBound(q.from, "from"),
        to = v.dateBound(q.to, "to", true);
      if (from !== undefined && to !== undefined && from > to)
        throw invalid("from", "Start date must not follow end date.");
      const rows = (await repos.transactions.findAll())
        .filter(
          (t) =>
            (!search || t.referenceNumber.toLowerCase().includes(search)) &&
            (!source || t.sourceAccountId === source) &&
            (!account ||
              t.sourceAccountId === account ||
              t.destinationAccountId === account) &&
            (!status || t.status === status) &&
            (from === undefined || Date.parse(t.createdAt) >= from) &&
            (to === undefined || Date.parse(t.createdAt) <= to),
        )
        .sort(newest);
      const result = v.pageOf(rows, paging);
      result.data = await decorateTransactions(result.data);
      return result;
    },
    async get(id) {
      v.id(id, "transactionId");
      const record = await repos.transactions.findById(id);
      if (!record) throw notFound("Transaction");
      return {
        ...record,
        sourceAccount: await repos.accounts.findById(record.sourceAccountId),
        destinationAccount: await repos.accounts.findById(
          record.destinationAccountId,
        ),
      };
    },
  };
  const dashboard = {
    async summary() {
      const [cs, as, ts] = await Promise.all([
        repos.clients.findAll(),
        repos.accounts.findAll(),
        repos.transactions.findAll(),
      ]);
      const statusCounts = Object.fromEntries(
        c.TRANSACTION_STATUSES.map((s) => [
          s,
          ts.filter((t) => t.status === s).length,
        ]),
      );
      return {
        totalClients: cs.length,
        activeClients: cs.filter((r) => r.status === "Active").length,
        activeAccounts: as.filter((r) => r.status === "Active").length,
        totalTransactions: ts.length,
        pendingTransactions: statusCounts.Pending,
        completedTransactions: statusCounts.Completed,
        rejectedTransactions: statusCounts.Rejected,
        statusCounts,
        recentTransactions: await decorateTransactions(
          [...ts].sort(newest).slice(0, 5),
        ),
      };
    },
  };
  return { clients, accounts, transactions, dashboard };
}
