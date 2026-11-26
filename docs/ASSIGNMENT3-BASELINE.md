# FinOps Enterprise — Assignment 3 (incremental)

An incremental extension of the previously delivered Next.js/Express/MongoDB Assignment 2 project, using the uploaded Assignment 3 archive as the reference for risk and approval functionality. Northbridge Commercial Bank is fictional; do not deploy this educational application with real financial data.

## Upgrade an existing Assignment 2 deployment

Back up MongoDB first. Stop the old stack with `docker compose down` (without `-v`), copy the changed files or apply the companion patch from the Assignment 2 project root, and run `docker compose up --build -d` from the same directory. If using a separate directory, specify the original Compose project name with `docker compose -p ORIGINAL_NAME up --build -d` so the existing volume is reused. Do not run both stacks on port 8080. The existing migration remains unchanged; startup creates the risk collections, indexes, defaults and migration marker `assignment-3-risk` before the API listens. Completed and Rejected historical records remain unchanged in financial status; historical Pending records are explicitly protected from execution because they lack a risk assessment. No balances are recalculated. New transactions are assessed automatically. Do not downgrade to Assignment 2 after creating approval-gated transfers, because the old backend does not enforce the new gate.

## Assignment 3 features

- Eight deterministic additive risk rules; 100-point cap; immutable evidence snapshot for every newly initiated transfer.
- Versioned draft/active/superseded risk policies; currency-specific activation and simulated administrator role.
- Sequential workflow decisions, escalation, separation of duties, immutable decision records and unique decision idempotency keys.
- Existing Assignment 2 financial execution engine retained, with an additional authoritative assessment/approval gate in the same MongoDB session. Workflow rejection sets the financial status to Rejected without changing balances.
- New Next.js risk workspace, assessment and workflow records, dashboard counts, policy creation/edit/activation and actor selector. Policy editing and audit evidence use JSON panels, not the uploaded Vite screens.

| Score | Level | Required stages |
|---|---|---|
| 0–24 | Low | None |
| 25–49 | Medium | Operations Reviewer |
| 50–74 | High | Operations Reviewer then Senior Reviewer |
| 75–100 | Critical | Senior Reviewer then Compliance Reviewer |

New collections: `risk_policies`, `risk_assessments`, `approval_policies`, `approval_workflows`, `approval_decisions`, `workflow_actors`, `risk_policy_locks`. Policy versions use `policyKey` as the stable route identifier. The six fictional actors are seeded automatically; choose the role required by the current stage. Actor selection is not authentication.

### New endpoints (prefix `/api/v1`)

| Method | Path |
|---|---|
| GET/POST | /risk-policies |
| GET/PUT | /risk-policies/:id |
| POST | /risk-policies/:id/activate |
| GET | /risk-assessments, /risk-assessments/:id |
| GET | /risk/dashboard |
| GET | /approval-workflows, /approval-workflows/:id |
| GET/POST | /approval-workflows/:id/decisions |
| POST | /approval-workflows/:id/escalate |
| GET | /approvals/dashboard, /approvals/queue, /workflow-actors |

For a decision, send `Idempotency-Key` and `{ "actorId":"ACTOR-OLIVIA-CHEN", "decision":"Approved", "comments":"Reviewed" }`. Rejection and escalation require comments. A workflow must be fully approved before processing; low risk needs no approval. To demonstrate High risk, use fresh active CAD accounts with source balance 1,000,000.00 and transfer 120,000.00; the three cumulative amount rules score 60. Approve as Olivia Chen, then Daniel Brooks; return to Transactions to process. The original Assignment 2 validation timing is retained: funds, currency, status and overflow are checked at execution, rather than rejecting initiation early as in the uploaded reference.

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
5. Submit a transfer larger than the source balance, complete any required approval stages, process it and verify Rejected and unchanged balances.
6. Run integration tests for simultaneous requests, duplicate keys and terminal replay.
7. Restart the stack and verify records persist.

## Scope and limitations

This is a patch applied to the previously generated Assignment 2 reconstruction, not to the public GitHub repository. Dashboard, client/account forms, search, filters and linked detail panels are implemented; UI design and navigation are not identical to Assignment 1. No production authentication, authorization, audit ledger, TLS, database authentication, backup or multi-node HA is provided. Browser idempotency keys survive retries within a form session, not reloads. Dependencies are semver ranges; npm lockfiles should be generated and committed after installation. Docker and full browser validation must be run on a Docker-capable machine. See TEST-RESULTS.txt for checks actually executed.
