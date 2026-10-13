import {
  INDUSTRIES,
  COUNTRIES,
  CLIENT_STATUSES,
  ACCOUNT_TYPES,
  CURRENCIES,
  ACCOUNT_STATUSES,
  TRANSACTION_STATUSES,
} from "./constants.js";
import { UUID } from "./validation.js";
function assert(ok, message) {
  if (!ok) throw new Error(message);
}
function unique(rows, key, normal = (v) => v) {
  const seen = new Set();
  for (const r of rows) {
    const v = normal(r[key]);
    assert(!seen.has(v), `Duplicate ${key}`);
    seen.add(v);
  }
}
const timestamp = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const text = (v, min, max) =>
  typeof v === "string" && v.trim() === v && v.length >= min && v.length <= max;
export function validateRows(kind, rows) {
  assert(Array.isArray(rows), "Dataset must be an array.");
  for (const r of rows) {
    assert(
      r && typeof r === "object" && !Array.isArray(r),
      "Each record must be an object.",
    );
    assert(
      UUID.test(
        r[
          kind === "clients"
            ? "clientId"
            : kind === "accounts"
              ? "accountId"
              : "transactionId"
        ],
      ),
      "Invalid UUID",
    );
    assert(timestamp(r.createdAt), "Invalid createdAt");
    if (kind === "clients") {
      assert(
        text(r.companyName, 2, 150) && text(r.registrationNumber, 5, 30),
        "Invalid client name or registration",
      );
      assert(
        INDUSTRIES.includes(r.industry) &&
          COUNTRIES.includes(r.country) &&
          CLIENT_STATUSES.includes(r.status),
        "Invalid client enum",
      );
      assert(
        text(r.contactEmail, 3, 254) &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.contactEmail),
        "Invalid client email",
      );
      assert(
        r.contactPhone === undefined || text(r.contactPhone, 0, 30),
        "Invalid phone",
      );
      assert(timestamp(r.updatedAt), "Invalid updatedAt");
    } else if (kind === "accounts") {
      assert(
        UUID.test(r.clientId) && text(r.accountNumber, 1, 80),
        "Invalid account owner/number",
      );
      assert(
        ACCOUNT_TYPES.includes(r.accountType) &&
          CURRENCIES.includes(r.currency) &&
          ACCOUNT_STATUSES.includes(r.status),
        "Invalid account enum",
      );
      assert(
        Number.isSafeInteger(r.balanceMinor) && r.balanceMinor >= 0,
        "Invalid balance",
      );
    } else {
      assert(
        text(r.referenceNumber, 1, 80) &&
          UUID.test(r.sourceAccountId) &&
          UUID.test(r.destinationAccountId) &&
          r.sourceAccountId !== r.destinationAccountId,
        "Invalid transaction identity",
      );
      assert(
        Number.isSafeInteger(r.amountMinor) && r.amountMinor > 0,
        "Invalid transaction amount",
      );
      assert(
        r.transactionType === "Transfer" &&
          TRANSACTION_STATUSES.includes(r.status) &&
          CURRENCIES.includes(r.currency) &&
          text(r.description, 0, 250),
        "Invalid transaction fields",
      );
    }
  }
  unique(
    rows,
    kind === "clients"
      ? "clientId"
      : kind === "accounts"
        ? "accountId"
        : "transactionId",
  );
  if (kind === "clients")
    unique(rows, "registrationNumber", (v) => v.trim().toLowerCase());
  if (kind === "accounts") unique(rows, "accountNumber");
  if (kind === "transactions") unique(rows, "referenceNumber");
}
export function verifyDataset(
  { clients, accounts, transactions },
  minimums = false,
) {
  for (const [kind, rows] of Object.entries({
    clients,
    accounts,
    transactions,
  }))
    validateRows(kind, rows);
  const ids = new Set(clients.map((c) => c.clientId));
  const accountMap = new Map(accounts.map((a) => [a.accountId, a]));
  for (const a of accounts)
    assert(ids.has(a.clientId), "Account references missing client.");
  for (const t of transactions) {
    const a = accountMap.get(t.sourceAccountId),
      b = accountMap.get(t.destinationAccountId);
    assert(a && b, "Transaction references missing account.");
    assert(
      a.currency === t.currency && b.currency === t.currency,
      "Currency mismatch.",
    );
  }
  if (minimums) {
    assert(
      clients.length >= 10 &&
        accounts.length >= 20 &&
        transactions.length >= 50,
      "Dataset quantities below minimum.",
    );
    assert(
      new Set(clients.map((c) => c.industry)).size >= 5,
      "At least five industries required.",
    );
    assert(
      clients.filter((c) => c.status !== "Active").length >= 2 &&
        accounts.filter((a) => a.status !== "Active").length >= 2,
      "Non-active examples required.",
    );
    assert(
      CURRENCIES.every((c) => accounts.some((a) => a.currency === c)),
      "Both currencies required.",
    );
    assert(
      TRANSACTION_STATUSES.every((s) =>
        transactions.some((t) => t.status === s),
      ),
      "All transaction statuses required.",
    );
  }
  return {
    clients: clients.length,
    accounts: accounts.length,
    transactions: transactions.length,
  };
}
