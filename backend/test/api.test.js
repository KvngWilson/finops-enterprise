import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { demoData } from "../scripts/seed.js";
import { JsonStore } from "../src/repositories/json-store.js";
import { verifyDataset } from "../src/domain/integrity.js";
let directory, server, base;
const demo = demoData();
const client = {
  companyName: "API Test Corporation",
  registrationNumber: "TEST-UNIQUE-001",
  industry: "Technology",
  country: "Canada",
  contactEmail: "ops@example.com",
  contactPhone: "",
};
async function start() {
  server = createApp({ dataDirectory: directory }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
}
async function api(path, method = "GET", body) {
  const r = await fetch(base + "/api/v1" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json(), headers: r.headers };
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "finops-test-"));
  for (const [name, rows] of Object.entries(demo))
    await writeFile(join(directory, name + ".json"), JSON.stringify(rows));
  await start();
});
after(async () => {
  await new Promise((r) => server.close(r));
  await rm(directory, { recursive: true, force: true });
});
test("demonstration dataset quantities, fields and relationships", () =>
  assert.deepEqual(verifyDataset(demo, true), {
    clients: 10,
    accounts: 20,
    transactions: 50,
  }));
test("health returns current timestamp and configured CORS", async () => {
  const r = await api("/health");
  assert.equal(r.status, 200);
  assert.equal(r.data.status, "ok");
  assert.ok(Date.now() - Date.parse(r.data.timestamp) < 2000);
  const res = await fetch(base + "/api/v1/health", {
    headers: { Origin: "http://localhost:5173" },
  });
  assert.equal(
    res.headers.get("access-control-allow-origin"),
    "http://localhost:5173",
  );
});
test("client creation, editing, profile and persistence after real server restart", async () => {
  let r = await api("/clients", "POST", client);
  assert.equal(r.status, 201);
  const id = r.data.data.clientId;
  assert.equal(r.data.data.status, "Active");
  assert.equal(r.headers.get("location"), "/api/v1/clients/" + id);
  r = await api("/clients/" + id, "PATCH", {
    companyName: "Updated API Test",
    status: "Suspended",
  });
  assert.equal(r.status, 200);
  await new Promise((r) => server.close(r));
  await start();
  r = await api("/clients/" + id);
  assert.equal(r.data.data.status, "Suspended");
  assert.equal(r.data.data.companyName, "Updated API Test");
  assert.deepEqual(r.data.data.accounts, []);
});
test("case-insensitive duplicate registration preserves original data", async () => {
  const original = await readFile(join(directory, "clients.json"), "utf8");
  const r = await api("/clients", "POST", {
    ...client,
    registrationNumber: "  test-unique-001  ",
  });
  assert.equal(r.status, 409);
  assert.equal(
    await readFile(join(directory, "clients.json"), "utf8"),
    original,
  );
});
test("validation, immutable fields and nonexistent client", async () => {
  for (const body of [
    { ...client, companyName: "" },
    { ...client, contactEmail: "bad" },
    { ...client, industry: "Unknown" },
    { ...client, country: "France" },
    { ...client, status: "Active" },
    null,
  ])
    assert.equal((await api("/clients", "POST", body)).status, 400);
  const id = demo.clients[0].clientId;
  for (const body of [
    { registrationNumber: "NEW-12345" },
    { clientId: id },
    { status: "Unknown" },
    { createdAt: "now" },
    {},
  ])
    assert.equal((await api("/clients/" + id, "PATCH", body)).status, 400);
  assert.equal(
    (await api("/clients/00000000-0000-4000-8000-999999999999")).status,
    404,
  );
});
test("client combined filters, partial search and pagination validation", async () => {
  const r = await api(
    "/clients?search=MAPLE&status=Active&industry=Manufacturing&pageSize=1",
  );
  assert.equal(r.data.data[0].clientId, demo.clients[0].clientId);
  assert.equal(r.data.pagination.total, 1);
  for (const q of [
    "page=0",
    "pageSize=101",
    "page=abc",
    "status=unknown",
    "search=a&search=b",
  ])
    assert.equal((await api("/clients?" + q)).status, 400);
});
test("account creation requires an active existing client and integer cents", async () => {
  const body = {
    clientId: demo.clients[0].clientId,
    accountType: "Operating",
    currency: "CAD",
    balanceMinor: 1250075,
  };
  const r = await api("/accounts", "POST", body);
  assert.equal(r.status, 201);
  assert.equal(r.data.data.status, "Active");
  assert.ok(r.data.data.accountNumber.startsWith("SIM-"));
  assert.equal(
    (await api("/accounts/" + r.data.data.accountId)).data.data.client
      .companyName,
    demo.clients[0].companyName,
  );
  assert.ok(
    (await api("/clients/" + body.clientId)).data.data.accounts.some(
      (a) => a.accountId === r.data.data.accountId,
    ),
  );
  for (const n of [-1, 1.25, "100", Number.MAX_SAFE_INTEGER + 1, null])
    assert.equal(
      (await api("/accounts", "POST", { ...body, balanceMinor: n })).status,
      400,
    );
  for (const i of [8, 9])
    assert.equal(
      (
        await api("/accounts", "POST", {
          ...body,
          clientId: demo.clients[i].clientId,
        })
      ).status,
      409,
    );
  assert.equal(
    (
      await api("/accounts", "POST", {
        ...body,
        clientId: "00000000-0000-4000-8000-999999999999",
      })
    ).status,
    404,
  );
  assert.equal(
    (await api("/accounts", "POST", { ...body, currency: "EUR" })).status,
    400,
  );
  assert.equal(
    (
      await api("/accounts/" + r.data.data.accountId, "PATCH", {
        balanceMinor: 0,
      })
    ).status,
    404,
  );
});
test("account combined filters include corporate ownership", async () => {
  const r = await api(
    "/accounts?clientId=" +
      demo.clients[0].clientId +
      "&currency=USD&accountType=Savings&status=Active",
  );
  assert.equal(r.data.data.length, 1);
  assert.equal(r.data.data[0].accountId, demo.accounts[1].accountId);
});
test("history search, related accounts, read-only restrictions and newest-first order", async () => {
  let r = await api("/transactions?search=txn-2026-000001");
  assert.equal(r.data.data.length, 1);
  assert.equal(r.data.data[0].amountMinor, demo.transactions[0].amountMinor);
  const detail = await api("/transactions/" + r.data.data[0].transactionId);
  assert.equal(
    detail.data.data.sourceAccount.accountId,
    demo.transactions[0].sourceAccountId,
  );
  assert.equal(
    detail.data.data.destinationAccount.accountId,
    demo.transactions[0].destinationAccountId,
  );
  r = await api("/transactions?pageSize=100");
  assert.equal(r.data.data.length, 50);
  assert.equal(
    r.data.data[0].transactionId,
    demo.transactions[49].transactionId,
  );
  for (const method of ["POST", "PATCH", "DELETE"])
    assert.equal(
      (
        await api(
          "/transactions" +
            (method === "POST" ? "" : "/" + demo.transactions[0].transactionId),
          method,
          {},
        )
      ).status,
      404,
    );
  assert.equal(
    (await api("/transactions?search=NONEXISTENT")).data.pagination.total,
    0,
  );
});
test("inclusive UTC dates, combined history filters and invalid date ranges", async () => {
  const t = demo.transactions[0];
  let r = await api(
    "/transactions?" +
      new URLSearchParams({
        search: t.referenceNumber,
        sourceAccountId: t.sourceAccountId,
        status: t.status,
        from: "2026-09-02",
        to: "2026-09-02",
      }),
  );
  assert.equal(r.data.data.length, 1);
  for (const q of [
    "from=2026-02-30",
    "from=2026-09-10&to=2026-09-02",
    "to=bad",
  ])
    assert.equal((await api("/transactions?" + q)).status, 400);
  r = await api("/transactions?accountId=" + t.destinationAccountId);
  assert.ok(
    r.data.data.every(
      (x) =>
        x.sourceAccountId === t.destinationAccountId ||
        x.destinationAccountId === t.destinationAccountId,
    ),
  );
});
test("history reads preserve balances and dashboard totals reflect storage", async () => {
  const original = await readFile(join(directory, "accounts.json"), "utf8");
  await api("/transactions");
  assert.equal(
    await readFile(join(directory, "accounts.json"), "utf8"),
    original,
  );
  const d = (await api("/dashboard/summary")).data.data;
  const cs = JSON.parse(
      await readFile(join(directory, "clients.json"), "utf8"),
    ),
    as = JSON.parse(original);
  assert.equal(d.totalClients, cs.length);
  assert.equal(d.activeClients, cs.filter((c) => c.status === "Active").length);
  assert.equal(
    d.activeAccounts,
    as.filter((a) => a.status === "Active").length,
  );
  assert.equal(d.totalTransactions, 50);
  assert.equal(d.recentTransactions.length, 5);
  assert.equal(
    d.recentTransactions[0].transactionId,
    demo.transactions[49].transactionId,
  );
  assert.equal(
    Object.values(d.statusCounts).reduce((a, b) => a + b, 0),
    50,
  );
});
test("parallel duplicate requests create exactly one record", async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      api("/clients", "POST", {
        ...client,
        registrationNumber: "CONCURRENT-001",
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 11);
});
test("parallel distinct registrations retain every write", async () => {
  const results = await Promise.all(
    Array.from({ length: 16 }, (_, i) =>
      api("/clients", "POST", {
        ...client,
        registrationNumber: "CONCURRENT-DISTINCT-" + i,
      }),
    ),
  );
  assert.ok(results.every((r) => r.status === 201));
  assert.equal(
    JSON.parse(await readFile(join(directory, "clients.json"), "utf8")).filter(
      (c) => c.registrationNumber.startsWith("CONCURRENT-DISTINCT-"),
    ).length,
    16,
  );
});
test("corrupt and missing files return controlled errors without overwrite", async () => {
  const path = join(directory, "clients.json"),
    original = await readFile(path, "utf8");
  await writeFile(path, "{broken");
  assert.equal((await api("/clients")).status, 500);
  assert.equal(
    (
      await api("/clients", "POST", {
        ...client,
        registrationNumber: "CORRUPT-001",
      })
    ).status,
    500,
  );
  assert.equal(await readFile(path, "utf8"), "{broken");
  await writeFile(path, original);
  await rename(path, path + ".backup");
  assert.equal((await api("/clients")).status, 500);
  await rename(path + ".backup", path);
});
test("non-array storage and failed business modifications preserve original bytes", async () => {
  const path = join(directory, "invalid.json");
  await writeFile(path, "{}");
  await assert.rejects(
    () => new JsonStore(path).update(() => []),
    (e) => e.code === "STORAGE_ERROR",
  );
  assert.equal(await readFile(path, "utf8"), "{}");
  await writeFile(path, "[1]");
  await assert.rejects(() =>
    new JsonStore(path).update(() => {
      throw new Error("Failed validation");
    }),
  );
  assert.equal(await readFile(path, "utf8"), "[1]");
});
test("empty datasets return zero dashboard metrics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "finops-empty-"));
  for (const name of ["clients", "accounts", "transactions"])
    await writeFile(join(dir, name + ".json"), "[]");
  const empty = createApp({ dataDirectory: dir }).listen(0);
  await new Promise((r) => empty.once("listening", r));
  try {
    const r = await fetch(
      `http://127.0.0.1:${empty.address().port}/api/v1/dashboard/summary`,
    );
    const { data } = await r.json();
    assert.equal(data.totalClients, 0);
    assert.equal(data.activeAccounts, 0);
    assert.deepEqual(data.recentTransactions, []);
    assert.deepEqual(data.statusCounts, {
      Pending: 0,
      Completed: 0,
      Rejected: 0,
    });
  } finally {
    await new Promise((r) => empty.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});
test("timestamp tie sorting uses transaction identifiers", async () => {
  const path = join(directory, "transactions.json"),
    original = await readFile(path, "utf8");
  await writeFile(
    path,
    JSON.stringify([
      { ...demo.transactions[0], createdAt: demo.transactions[1].createdAt },
      demo.transactions[1],
    ]),
  );
  try {
    assert.equal(
      (await api("/transactions")).data.data[0].transactionId,
      demo.transactions[1].transactionId,
    );
  } finally {
    await writeFile(path, original);
  }
});
test("malformed request JSON returns HTTP 400", async () => {
  const r = await fetch(base + "/api/v1/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{broken",
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, "INVALID_JSON");
});
