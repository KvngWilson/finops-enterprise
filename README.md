# FinOps Enterprise — Assignment 2

A standalone Assignment 2 reconstruction of the public Assignment 1 contract. Northbridge Commercial Bank is fictional; do not deploy this educational application with real financial data.

## Start

Prerequisites: Docker with Compose v2 and, for importing original data, Node.js 20.9+ (Node 22 recommended). From this directory:

```sh
# Optional but required for exact Assignment 1 data fidelity:
node scripts/import-assignment1.mjs
# Alternatively use a local checkout's data directory:
# node scripts/import-assignment1.mjs /path/to/assignment1/backend/data

docker compose up --build -d
docker compose ps -a
docker compose logs migrate backend
```

Browser: http://localhost:8080 ; API health: http://localhost:8080/api/v1/health.

The bundled JSON fixture is a reconstructed demonstration dataset (10 clients, 20 accounts, 50 transactions), not an exact copy of the original. The import command replaces it with the exact public data before building. The one-shot migration waits for MongoDB primary readiness, loads the files in one transaction, and writes a migration marker. Existing balances are not recalculated or overwritten; historical completed transfers are not replayed. On a previously migrated database the marker prevents re-import. To start over with exact data, use a new Compose project name (`docker compose -p finops-original up --build -d`) after stopping the first stack to avoid port conflicts. `docker compose down` keeps data; `docker compose down -v` permanently deletes the project's database volume.

## Architecture

Browser → NGINX :8080 → Next.js :8080 or Express :3000 → MongoDB replica set :27017. Only NGINX publishes a host port. NGINX preserves `/api/v1` (no trailing slash in backend proxy_pass). JSON is migration input only; MongoDB holds all runtime business data. Docker Compose runs migration before backend startup. The database uses a single-node replica set for transactions, not high availability.

## API

All paths below are prefixed `/api/v1`. Success: `{data: ...}`; lists also return `pagination`. Errors: `{error:{code,message}}`.

| Method | Path | Purpose |
|---|---|---|
| GET | /health, /metadata | DB health, enum values |
| GET/POST | /clients | List/register clients |
| GET/PATCH | /clients/:id | Client profile/edit |
| GET/POST | /accounts | List/create accounts for active owners |
| GET | /accounts/:id | Account and owner |
| GET/POST | /transactions | History/initiate transfer |
| GET | /transactions/:id | Related accounts and processing outcome |
| POST | /transactions/:id/process | Execute pending transfer |
| GET | /dashboard/summary | Counts and five newest transfers |

Lists support page and pageSize; clients support search/status/industry; accounts support clientId/accountType/currency/status; transactions support search/status/sourceAccountId/accountId/from/to. Dates are inclusive UTC days.

Create a transfer with an `Idempotency-Key` header and JSON `{ "sourceAccountId":"...", "destinationAccountId":"...", "amountMinor":1000, "currency":"CAD", "description":"Supplier payment" }`. Obtain actual UUIDs from account list. Same key and normalized body returns original record (200); changed body returns 409; new record returns 201. Initiation checks shape, amount, distinct IDs and account existence. Execution checks active accounts, matching currency, sufficient funds and destination overflow. Business rejection produces a terminal Rejected record and reason; malformed input returns HTTP errors instead. Terminal reprocessing returns the existing outcome without balance mutations.

## Transaction integrity

The processing service uses MongoDB `withTransaction` with snapshot reads and majority writes. Debit, credit and conditional Pending-to-terminal update share a session; any write error aborts all three. Concurrent writes conflict and the driver retries transient errors. No externally visible Processing state is needed. Unique indexes enforce registration, account/reference identity and idempotency keys. Monetary quantities are safe integer minor units; frontend decimal conversion uses BigInt. No foreign exchange is supported.

## Tests

```sh
cd backend && npm install && npm test
# With Compose running, from root:
docker compose exec -e RUN_INTEGRATION=1 backend npm test
# Frontend build/type checks:
cd frontend && npm install && npm run build && npm run typecheck
```

The integration suite creates a disposable database, tests competing debits and replay, checks balances, then drops only that database. The default test command runs pure business-rule tests and skips replica-set tests unless explicitly enabled.

## Demonstration

1. Open dashboard, inspect migrated records and status counts.
2. Register a client; edit its details; create two CAD accounts or use existing active accounts.
3. Initiate a transfer using their UUIDs (e.g. amount 10.00). Verify Pending and unchanged balances.
4. Open the transfer and click Process transfer. Verify Completed, timestamp and adjusted balances.
5. Submit a transfer larger than the source balance, process it and verify Rejected and unchanged balances.
6. Run integration tests for simultaneous requests, duplicate keys and terminal replay.
7. Restart the stack and verify records persist.

## Scope and limitations

This is a reconstructed project, not a patch applied to the original source. Dashboard, client/account forms, search, filters and linked detail panels are implemented; UI design and navigation are not identical to Assignment 1. No production authentication, authorization, audit ledger, TLS, database authentication, backup or multi-node HA is provided. Browser idempotency keys survive retries within a form session, not reloads. Dependencies are semver ranges; npm lockfiles should be generated and committed after installation. Docker and full browser validation must be run on a Docker-capable machine. See TEST-RESULTS.txt for checks actually executed.
