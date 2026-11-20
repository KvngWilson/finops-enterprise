# FinOps Enterprise — Assignment 4

Incremental release based on the delivered Assignment 3 Next.js/Express/MongoDB application. Assignment 1–3 business data, migration utility, transaction engine, risk scoring, policy versioning, and sequential approval services remain in place. Assignment 4 adds authenticated identities, role and ownership enforcement, session/JWT/OIDC flows, security administration, audit history, and Keycloak deployment. See [incremental changes](docs/ASSIGNMENT4.md), [demonstration plan](docs/DEMONSTRATION.md), and [previous release documentation](docs/ASSIGNMENT3-BASELINE.md) (historical instructions only).

## Run from the existing Assignment 3 repository

Back up existing MongoDB data and apply the supplied patch from the project root:

```sh
git apply --check assignment3-to-assignment4.patch
git apply assignment3-to-assignment4.patch
```

The patch targets the exact previously delivered Assignment 3 release, not an arbitrary GitHub branch. Alternatively extract the full archive. Preserve the original Docker Compose project name and its named volume. Never use `docker compose down -v` during upgrade. The previous demo data remains in `backend/data/`; if you supplied the original A1 dataset earlier, keep that version instead.

Prerequisites: Docker Engine/Desktop with Compose v2, Node.js 22 and npm for optional local tests, internet access for dependency/image installation, a Google OAuth client and (optionally) SMTP credentials. No external credentials are included.

```sh
cp .env.example .env
# Edit .env and provide strong unique secrets for all four required password/secret fields.
docker compose up --build -d
docker compose ps -a
docker compose logs -f backend keycloak
```

Application: **http://localhost:3128**. Keycloak admin console: **http://localhost:8081/admin/**. Health endpoint: `http://localhost:3128/api/v1/health`. Backend and application MongoDB remain private to the Compose network. The migration container exiting successfully is expected.

To use the same existing MongoDB volume from a renamed directory, use `docker compose -p <original-project-name> up --build -d` and the same project name for all commands. Compose creates a separate Keycloak PostgreSQL volume; it does not replace the MongoDB database.

## Environment

| Variable | Purpose |
|---|---|
| `PUBLIC_ORIGIN` | Exact browser origin, default `http://localhost:3128` (no trailing slash) |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | Create the first internal System Administrator, insert-only; does not reset an existing password |
| `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD` | Initial Keycloak administrator; separate from application administrator |
| `KEYCLOAK_DB_PASSWORD` | PostgreSQL password for Keycloak |
| `KEYCLOAK_CLIENT_SECRET` | Shared confidential OIDC client secret; must match imported client |
| `KEYCLOAK_PUBLIC_URL` | Browser-reachable Keycloak origin, default `http://localhost:8081` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Create a Google Web application OIDC client and supply its credentials |
| `SMTP_URL`, `SMTP_FROM` | SMTP transport for password-reset and invitation delivery |

Example secret generation (run separately for each secret): `openssl rand -hex 32`. Keep `.env` and any Postman environment containing credentials out of Git. For localhost HTTP, cookie Secure is off; it is on when `PUBLIC_ORIGIN` uses HTTPS. Keycloak is explicitly deployed in development mode for local coursework, not production.

For local email testing without external SMTP, set `SMTP_URL=smtp://mailpit:1025` and `SMTP_FROM=finops@example.test`, then start `docker compose --profile mail up --build -d`. Visit http://localhost:8025 to inspect reset/invitation mail. Mailpit is a development-only optional service; never expose it publicly.

## First login and user setup

Sign in with the configured internal bootstrap admin using Session or JWT mode. Open **Identity & security → users**. Create users with each required role. An initial password activates the user; leaving it blank creates a Pending account and a one-time invitation link. Send the link privately or use SMTP. Customers must be assigned an existing `clientId` (visible in the client directory); every account and transaction request is scoped by that identifier. Create a separate Manager, Operations Reviewer, Senior Reviewer, Compliance Reviewer, Risk Analyst and Auditor for demonstration. Sign in with each account rather than selecting simulated actors.

## Keycloak setup

1. Wait for Keycloak startup, log into its administrator console, select `finops-enterprise` realm.
2. Verify the `finops-web` OpenID Connect client uses client authentication, Standard Flow enabled, Direct Access Grants disabled, PKCE S256, and exact redirect URI `http://localhost:3128/api/auth/keycloak/callback`. The imported client secret must equal `KEYCLOAK_CLIENT_SECRET`. Import uses environment placeholders in `keycloak/finops-enterprise-realm.json`.
3. Create an employee in Keycloak and assign credentials (not temporary if you want a direct demo). The internal account must be created separately in FinOps with appropriate permissions.
4. Sign into the internal account using Session mode. Open **Identity & security → security → Link keycloak**. Authenticate at Keycloak and complete the callback. This proves possession of the external identity and securely binds its subject to the existing internal account. It does not grant external roles.
5. Sign out of FinOps. Choose Continue with Keycloak and verify the same internal ID and roles. Application logout revokes the FinOps session only; the user's Keycloak SSO session can remain active. To test fresh credential entry, log out of Keycloak through its account console or use a private browser.
6. If realm import is skipped because the realm already exists, verify or update its client configuration manually. The Keycloak issuer must be exactly `$KEYCLOAK_PUBLIC_URL/realms/finops-enterprise`; the backend uses the private `keycloak:8080` token/JWKS endpoints with dynamic backchannel enabled.

References: https://www.keycloak.org/server/importExport and https://www.keycloak.org/server/hostname.

## Google setup

In Google Cloud Console configure the consent screen and a Web application OAuth client. Register exactly `http://localhost:3128/api/auth/google/callback` as an authorized redirect URI. Add your testing Google accounts as test users if the consent screen is in testing mode. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, restart the backend (`docker compose up -d --force-recreate backend`). Sign in with a local internal account in Session mode and link Google from its security settings. Sign out of FinOps and use Continue with Google. The same internal user must be resolved. Unknown/unlinked subjects cannot log in; matching email is never enough. FinOps logout does not log the person out of Google itself.

## API and authorization

New endpoints use `/api/auth`, `/api/users`, `/api/roles`, `/api/permissions`, `/api/security/audit` and `/api/risk-cases`. Existing business routes stay under `/api/v1`; only health is publicly accessible. For cookies, send the `X-CSRF-Token` obtained from session login or `/api/auth/me` on mutations. For JWT, send `Authorization: Bearer <access token>`; use the HttpOnly refresh cookie and rotate at `/api/auth/jwt/refresh`. All methods resolve the same internal user, check current status and obtain permissions from MongoDB. See [API and role details](docs/ASSIGNMENT4.md) and [Postman collection](postman/FinOps-Assignment4.postman_collection.json).

## Automated verification

```sh
# Built-in domain/security unit tests and database integration suites.
docker compose exec backend npm test
docker compose exec -e RUN_INTEGRATION=1 backend npm test
# Frontend component tests, full type checking, and browser tests from host:
cd frontend
npm install
npm run typecheck
npm test
npx playwright install chromium
# In the host shell, export BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD
# with the values used in .env (avoid copying real passwords into command history).
npm run test:e2e
npm run screenshots
```

The browser suite uses a running localhost deployment and creates PNG files in `frontend/screenshots/`. Only commit screenshots from test accounts, with no secrets or personal data. Actual runtime screenshots were not captured in the build environment. The supplied `pages.zip` and `mockups.zip` are visual references, not evidence of a running application. The new UI follows the existing A3 shell and incorporates directory filters, counts, profile/provider/session/history views, role matrix and audit views; it is not a pixel-identical reproduction of the mockups.

## Verification status and known limitations

See `TEST-RESULTS.txt`. Only dependency-free Node unit tests and static syntax/configuration checks were executed. npm registry DNS resolution failed; Docker and MongoDB replica set are not available in the build environment, so full Next.js type checking/build, Express/MongoDB integration, Keycloak realm import, real provider callbacks, SMTP delivery and browser tests remain unverified. The source provides the implementations and reproducible test instructions, not a claim of live acceptance. No private GitHub commit was made.

This is a coursework environment: MongoDB is internal but lacks production authentication in the inherited configuration; signing keys and session secrets are persisted in MongoDB for restart stability, not a production key vault; audit records are append-only via the API rather than protected against an administrator with direct database write access. HTTP/Keycloak development mode are not appropriate for production. Add TLS termination, key management, authenticated MongoDB replica set, backup/recovery, restricted DB service accounts, distributed rate limits, and monitoring before Assignment 5 production-readiness work. The inherited single-bank dataset has no organization/tenant field; staff read permissions operate across that bank, while customers are strictly scoped to their linked client. No automatic identity mapping is performed for legacy simulated reviewer IDs; historical decisions remain historical and should be reconciled administratively before completing live pre-upgrade review workflows.
