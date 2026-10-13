# FinOps Enterprise — Corporate Financial Operations Portal

Release 1 for Northbridge Commercial Bank, a fictional Canadian commercial bank. Operations staff can register corporate clients, maintain profiles, create financial accounts, investigate historical transactions, and review a consolidated dashboard. All business records come from the Express API and persist in JSON files.

## Quick start

Terminal 1:

```bash
cd backend
npm ci
cp .env.example .env
npm run verify:data
npm run dev
```

Terminal 2:

```bash
cd frontend
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**. Backend health is **http://localhost:3000/api/v1/health**. Use localhost in the browser to match the default CORS origin. The backend starts on port 3000 unless configured otherwise. Neither startup command seeds or overwrites data.

For a production frontend build, run `npm run build` in `frontend`. `npm run preview` serves the build on port 4173; set backend `FRONTEND_ORIGIN=http://localhost:4173` and restart the backend if testing the preview.

## Configuration

| Application | Variable | Default / purpose |
| --- | --- | --- |
| Backend | PORT | 3000, valid TCP port |
| Backend | FRONTEND_ORIGIN | http://localhost:5173, allowed browser origin |
| Backend | DATA_DIR | backend/data; optional absolute directory with all three JSON files |
| Frontend | VITE_API_BASE_URL | http://localhost:3000/api/v1; restart Vite after changes |

The backend reads `.env` from its working directory. Start it inside `backend`.

## Architecture and project structure

```text
backend/
  src/app.js                    importable Express application factory
  src/server.js                 listening port and shutdown
  src/config.js                 environment configuration
  src/routes/                   API endpoint declarations
  src/controllers/              HTTP inputs, status codes and response envelopes
  src/services/                 validation, uniqueness, ownership and aggregation
  src/repositories/             entity repositories and shared atomic JSON store
  src/domain/                   enums, validation, errors and integrity checks
  data/                         clients.json, accounts.json, transactions.json
  scripts/                      explicit seed reset and dataset verification
  test/                         HTTP integration and persistence tests
frontend/
  src/pages/                    dashboard, directories, details and forms
  src/components.jsx            shared tables, fields, badges and states
  src/hooks.js                  abortable requests and loading/error/retry handling
  src/api.js                    configurable HTTP boundary
  src/money.js                  exact decimal-to-cent conversion and display
  src/styles.css                desktop/tablet/mobile layout
  test/                         monetary precision tests
docs/
  FinOps.postman_collection.json API requests and expected-response assertions
  *-results.txt                 captured automated testing evidence
  screenshots/                  desktop and tablet browser captures
scripts/
  browser-check.cjs             repeatable browser workflows and screenshots
```

Requests pass through **route → controller → service → repository → JSON file**. Dashboard aggregation uses repositories, never direct file reads. React communicates through Fetch and React Router; options such as industries and statuses are fetched from `/metadata` rather than duplicated as business data in components.

## REST API catalogue

Success responses use `{data: resource}`. Lists use `{data: [...], pagination: {page, pageSize, total, totalPages}}`. Health returns `{status, timestamp}`. Errors use `{error: {code, message, fields?}}`.

| Method | Endpoint under /api/v1 | Purpose |
| --- | --- | --- |
| GET | /health | Status and current UTC timestamp |
| GET | /metadata | Supported industries, countries, statuses, types and currencies |
| GET | /clients | Directory; search, status, industry, page, pageSize |
| POST | /clients | Register client; HTTP 201 and Location header |
| GET | /clients/:id | Client profile with associated accounts |
| PATCH | /clients/:id | Update editable client fields |
| GET | /accounts | Filter by clientId, accountType, currency, status; pagination |
| POST | /accounts | Create account for an existing active client; HTTP 201 |
| GET | /accounts/:id | Account with owner profile |
| GET | /transactions | Search reference; sourceAccountId, status, from, to; pagination |
| GET | /transactions/:id | Transaction with both related account records |
| GET | /dashboard/summary | Seven indicators, status counts, five most recent transactions |

The transaction list additionally accepts `accountId` to find incoming and outgoing activity for an account profile. `from` and `to` use YYYY-MM-DD and include the entire UTC calendar day. Invalid dates and reversed ranges return 400. Transaction ordering is descending timestamp, then descending UUID for ties. Default page size is 10; maximum is 100. Client search is case-insensitive and partial on company and registration number. Account numbers are simulated strings prefixed `SIM-`.

### Request examples

Create client:

```json
{"companyName":"Example Corporation","registrationNumber":"DEMO-NEW-0001","industry":"Technology","country":"Canada","contactEmail":"operations@example.com","contactPhone":"+1 555 010 9999"}
```

Create account, substituting the returned clientId:

```json
{"clientId":"00000000-0000-4000-8000-000000000001","accountType":"Operating","currency":"CAD","balanceMinor":1250075}
```

Editable client fields are companyName, industry, country, contactEmail, contactPhone and status. IDs, registration numbers and timestamps cannot be set or changed by the caller. Clients start Active; accounts start Active. No client deletion, balance editing, account closing, transaction creation, execution, editing, cancellation or approval endpoints exist.

### Errors

400 indicates invalid fields, malformed JSON, invalid UUID/query values, impossible dates, fractional cents, unsafe monetary integers, or immutable/system fields. 404 indicates a valid but missing resource or unsupported endpoint. 409 indicates a duplicate normalized registration or inactive/suspended owner. 500 is a controlled storage/server error; details remain in the backend log. Account creation never accepts a status or caller-specified account number.

## Data model

| Entity | Identity / relationships | Business properties |
| --- | --- | --- |
| Client | clientId UUID; registrationNumber normalized uniqueness | companyName, industry, country, contactEmail, contactPhone, status, createdAt, updatedAt |
| Account | accountId UUID; existing clientId; unique accountNumber string | accountType, currency, balanceMinor safe integer, status, createdAt |
| Transaction | transactionId UUID; unique referenceNumber; different sourceAccountId and destinationAccountId | amountMinor positive safe integer, matching currency, Transfer type, status, description, createdAt |

All timestamps are UTC ISO 8601. CAD and USD have two decimal places. The UI parses decimal strings using BigInt before converting to a safe Number; it never computes cents by multiplying a floating-point input. It formats cents from integer portions so amounts near the safe-integer boundary retain their final cent.

## Demonstration dataset

The supplied files contain 10 fictional clients across all seven industries, 20 accounts in CAD and USD, and 50 transactions spanning Pending, Completed and Rejected. Clients 9 and 10 are Inactive and Suspended; the final two accounts are Frozen and Closed. Each client owns two accounts. Transfers link different accounts with matching currency and include low and high values. `TXN-2026-000001` is the investigation example. Recorded balances are independent demo values; reading transactions never changes them.

Initial dashboard: 10 total clients, 8 active clients, 18 active accounts, 50 transactions, 17 Pending, 17 Completed, 16 Rejected.

```bash
cd backend
npm run verify:data
```

The verifier checks arrays, fields, UUIDs, timestamps, enums, uniqueness, safe amounts, owner references, transaction references/currency, minimum counts and required examples.

To explicitly discard local changes and restore demo data:

```bash
npm run seed -- --reset-demo
```

This command overwrites all three data files

## Persistence and reliability

`JsonStore.read()` uses `node:fs/promises`, requires a JSON array and applies entity validation. Missing, corrupted or structurally invalid files fail without creating replacement empty arrays. `JsonStore.update()` uses a process-wide queue indexed by the resolved file path. The complete read/validate/modify/write cycle runs inside that queue. Uniqueness checks also run inside the client-file queue.

An update writes an exclusive temporary file in the same directory, flushes it, closes it and atomically renames it over the original. Temporary files are cleaned up on errors. A failed business validation or write does not intentionally discard the original data. JSON files are read afresh on requests; a real backend restart retains changes.

## Tests and reproducible evidence

```bash
cd backend
npm test
npm run verify:data
cd ../frontend
npm test
npm run build
```

Backend tests create temporary datasets, start real HTTP listeners and cover creation/update, actual server restart, filtering, duplicates, immutability, ownership rules, monetary limits, history ordering and relationships, inclusive dates, read-only restrictions, unchanged balances, dashboard aggregation, parallel distinct/duplicate writes, corrupt/missing/non-array storage, empty datasets and malformed JSON. They leave demonstration data unchanged.

Browser workflow (the runner starts its own API and Vite server using a disposable copy of the demo data):

```bash
npm ci
npx playwright install chromium
npm run test:browser
```

Run those commands from the project root. The browser script checks routes, client registration/editing, account registration and cents display, source/destination navigation, search/empty results, invalid date handling, loading/API-error states, duplicate submission protection, dashboard refresh, 404 and tablet layout. It saves screenshots and a log under `docs`. The runner removes its temporary dataset and stops both servers when it finishes. It does not mutate the shipped demo data. Port 5175 must be available. `BROWSER_EXECUTABLE` and `BROWSER_ARGS` optionally select a locally installed Chromium runtime; normal installations use Playwright’s downloaded Chromium.

## Technical reflection

### 1. Layered Express architecture

`routes/index.js` declares paths and methods. `controllers/index.js` translates query/body/params into service calls and sets envelopes, 201 responses and Location headers. `services/index.js` implements registration normalization, editable fields, active-client ownership and dashboard calculations. Entity repositories hide file access; `json-store.js` owns asynchronous reads and replacement writes. Putting these rules in routes would duplicate validation, couple rules to HTTP and make future workflow reuse and independent testing harder.

### 2. Concurrent asynchronous JSON updates

Two independent reads can observe the same old array and later writes can discard each other's additions. `JsonStore.update()` serializes the full modification cycle using a Map of promises keyed by absolute filename. Failed operations do not poison the queue. Registration uniqueness is checked after the queued read, so concurrent duplicates produce one 201 and the remaining 409 responses. The integration tests send concurrent requests to verify both distinct-record retention and duplicate prevention. This solves single-process same-file races; multi-process or cross-file transactions need stronger storage infrastructure.

### 3. Integer minor units

Binary floating-point cannot precisely represent many decimal fractions. Accounts store safe integer `balanceMinor`, and transactions store positive integer `amountMinor`. `validation.js` rejects negative, fractional, string or unsafe balances. `money.js` parses decimal strings with at most two decimal places using BigInt and enforces Number.MAX_SAFE_INTEGER before conversion. Its formatter separates integer and fractional portions. Frontend tests cover 0.29, fractional-cent rejection and the safe-integer boundary.

### 4. React asynchronous requests and validation

`useApi` tracks loading, data and errors, aborts stale Fetch calls on filter/route changes and offers retry. Shared `State` handles loading and request failures, and tables provide empty results. Forms use browser validation plus explicit client-side checks; the backend independently validates every write. API field errors are shown beside the corresponding inputs. Each submit handler sets a ref lock before awaiting the request and disables the submit button, preventing duplicate requests from rapid clicks. Successful writes navigate to the details view with a confirmation. During verification, Vite's all-interface host setting encountered a sandbox network-interface restriction; binding to 127.0.0.1 allowed reproducible local startup while using localhost as the browser origin.