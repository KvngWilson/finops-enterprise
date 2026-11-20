# Incremental security design and implementation notes

## Files and architecture

- `backend/src/security/crypto.js`: salted scrypt password hashes, secure random opaque credentials, SHA-256 digests.
- `backend/src/security/policy.js`: individual permission catalog, eight mandatory roles, exact approval-stage mapping, customizable non-reserved permissions.
- `backend/src/security/index.js`: Mongo initialization, Express session store, session registry, JWT family/rotation service, OIDC flows, secure linking, identity/role administration, assigned risk cases, audit events and business-route guards.
- `backend/src/app.js`, `server.js`: middleware mounted before the existing financial routes; security initialized at startup.
- `backend/src/transfers.js`: user-scoped idempotency key for newly authenticated requests; original atomic processing retained.
- `backend/src/services/risk-approval.js`: resolve reviewers from active internal users, preserve stage role separation, maintain decision history and mandatory score bands. Escalation records a supervisory target but cannot silently grant a different stage approval privilege. A permitted reviewer is still required for that stage.
- `frontend/app/security.tsx`: functional login, invitation, reset, error, profile, security, sessions/history, user/role permissions, audit and assigned-risk-case views.
- `frontend/app/page.tsx`, `risk.tsx`: authentication gate, role-aware navigation/actions, authenticated API helper, authenticated reviewer identity; previous business views retained.
- `compose.yaml`, `.env.example`, `keycloak/`: Keycloak + persistent PostgreSQL, private token/JWKS endpoint, optional Mailpit; NGINX host port 3128, internal app ports unchanged.
- `backend/test`, `frontend/test`, `frontend/e2e`: existing tests adapted to authenticated actors, new security tests and browser tests.

## Identity and data model

| Collection | Content / index |
|---|---|
| users | Internal ID, normalized unique email, profile, scrypt hash, status, roles, optional customerId, timestamps |
| roles | Unique role name, permission IDs, system marker |
| permissions | Individual named permissions |
| externalIdentities | Unique (provider, providerSubject), unique (userId, provider), link timestamp |
| sessions | Express/connect-mongo session storage, TTL |
| sessionRegistry | SHA-256 session-ID digest, user, device, method, inactivity/absolute expiration, revocation |
| refreshTokens | SHA-256 opaque token digest, family ID, used state, expiration TTL |
| tokenFamilies | User, device, expiration TTL, revocation, last activity |
| passwordResetTokens | Hashed one-time reset/invite tokens, kind, expiration TTL |
| securityAuditEvents | Append-only API, event ID/type/actor/provider/result/timestamp/metadata; timestamp and actor indexes |
| securityConfig | Restart-persistent signing key pair and session secret, private application collection |
| risk_cases | Assigned analyst ID, assessment reference, case status/notes; assignment and status index |

Original clients/accounts/transactions, risk assessments, policies, workflows, decision records, migration markers remain unchanged. No deletion/reseeding of financial data on upgrade. Eight required system roles are reset to their mandatory permission matrix at startup; custom roles and user assignments persist. The bootstrap admin is insert-only. Legacy simulated workflow actors are no longer trusted for authorization. Their decision records are retained for audit; historical Pending transactions still use prior LegacyProtected semantics. Scope changes are deliberate: new transaction idempotency keys are namespaced to the authenticated user and old unauthenticated keys cannot safely be associated with a new identity.

## Role matrix

| Role | Principal grants |
|---|---|
| System Administrator | users.read/create/update/status/roles; roles.read/create/update; permissions.read/assign; dashboard.read; staff record read; clients.create/update; accounts.create; risk.policies.create/update/activate; risk.cases.assign; audit.read |
| Manager | dashboard.read; staff record read; transactions.process; audit.read; escalation visibility |
| Operations Reviewer | staff record read; approvals.medium.decide; approvals.high.stage1; approvals.escalate |
| Senior Reviewer | staff record read; approvals.high.stage2; approvals.critical.stage1; approvals.escalate |
| Compliance Reviewer | staff record read; approvals.critical.stage2; audit.read |
| Risk Analyst | staff record read; risk.cases.manage on assigned cases only; audit.read |
| Auditor | staff record read; audit.read; no mutations |
| Customer | accounts.own.read; transactions.own.read; transactions.own.create; no staff permissions |

Staff read = clients.read, accounts.read, transactions.read, risk.assessments.read, risk.policies.read, approvals.read. Profile and own session functionality is available to all active users. Customer roles cannot be combined with staff roles. A Manager or Administrator does not acquire any approval privilege unless explicitly assigned a separate reviewer role. The same internal user cannot approve two stages even if multiple explicit reviewer roles are assigned. Custom role permissions can be changed by the administrator, but cannot grant reserved identity-admin, customer ownership, approval-decision or policy-mutation privileges. System roles are immutable through the API. Existing bank data does not include organizational tenancy; staff record reads are bank-wide. Transfer execution is an explicit Manager permission, not a grant of transaction approval. Customer initiation alone never processes money.

## Authentication flows

- Session: authenticate local password -> regenerate Express session -> registry row with 30m idle/8h absolute expiry -> signed HttpOnly cookie -> backend checks registry and status on each request. Mutation requires session-bound CSRF header. Logout and revocation invalidate backend registry. Session cookies aren't returned to JS.
- JWT: authenticate -> create family and hashed refresh credential -> issue RS256 access token (15m; issuer `finops`, audience `finops-api`, internal subject and family ID). Access verification checks signature, algorithm, required claims, expiration and family revocation on every request. Refresh rotation consumes old hash and issues replacement in a Mongo transaction. Replay of a used hash revokes the family. Families expire after seven days. Browser access token is in memory, refresh in HttpOnly cookie. Switching authentication modes revokes prior browser credentials where present.
- OIDC: authorization code redirects with PKCE S256, random state and nonce bound to a short-lived session. Callback exchanges code server-to-server, validates issuer/audience/signature/expiration/subject/nonce and matches external provider subject. A link operation requires an authenticated existing session and still-valid linking identity when the callback completes. Email matching never auto-links. Application sessions are generated from internal user records, not provider roles.
- Password reset: generic forgot-password response, hashed 30m reset token; delivery through configured SMTP. Invite token expires after 24h, redeem atomically; consumed token cannot be reused. Successful reset/change revokes sessions and token families. Local password policy is 12–128 characters.

## Routes

All business routes in A1–3 remain mounted under `/api/v1`, with health public and all others protected. Session auth requires cookie + CSRF header for non-GET; JWT auth requires Bearer on business and admin APIs.

| Method | Route | Authorization |
|---|---|---|
| POST | /api/auth/session/login | Credentials |
| POST | /api/auth/session/logout | Active session + CSRF |
| POST | /api/auth/jwt/login | Credentials |
| POST | /api/auth/jwt/refresh | Refresh cookie |
| POST | /api/auth/jwt/logout | Refresh cookie |
| GET | /api/auth/keycloak, /api/auth/google | OIDC initiation |
| GET | /api/auth/{provider}/callback | State, nonce, PKCE, token validation |
| POST | /api/auth/{provider}/link | Active session + CSRF, returns external authorization URL |
| DELETE | /api/auth/identities/:provider | Authenticated owner; keep local credential |
| GET/PATCH | /api/auth/me | Authenticated owner |
| POST | /api/auth/password/change | Authenticated owner + current password |
| POST | /api/auth/password/forgot, /password/reset, /invitation/accept | Rate-limited, single-use token where relevant |
| GET | /api/auth/sessions, /api/auth/history | Authenticated owner |
| DELETE | /api/auth/sessions/:id | Own session/family |
| GET/POST | /api/users | users.read/create |
| GET/PATCH | /api/users/:id | users.read/update |
| PATCH | /api/users/:id/status | users.status |
| PUT | /api/users/:id/roles | users.roles |
| GET/POST | /api/roles | roles.read/create |
| GET/PATCH | /api/roles/:id | roles.read/update |
| GET | /api/permissions | permissions.read |
| PUT | /api/roles/:id/permissions | permissions.assign |
| GET | /api/security/audit, /api/security/audit/:id | audit.read |
| GET/POST | /api/risk-cases | Assigned analyst read or administrator assign |
| PATCH | /api/risk-cases/:id | Assigned analyst only |

No audit update/delete API is exposed. Record authentication success/failure, logout, revocation, password change/reset, status change, role and permission changes, access denials, provider links/unlinks and case actions. No passwords, tokens, or private keys are intentionally included. Audit timestamps are BSON Dates; existing financial timestamps retain their historic ISO-string format. Security audit integrity is API-level; direct Mongo administrators can still alter storage. Production hardening is deferred.

## Design references and differences

The supplied PNG mockups in `pages.zip` and `mockups.zip` informed the security workspace: user counts and filterable directory, role/permission matrix, detail/profile view, session/history/provider views, audit logs, and existing dark sidebar. The assignment's screen requirements were implemented as working tabs and forms within the existing Next.js shell rather than standalone routes or multi-step pixel-identical mockups. Directory search/filter/sort operates on the bounded 500-row response in this coursework release; large-scale server pagination is a follow-up. User detail/edit and role create/edit share views. No separate ABAC policy-editor UI is implemented; resource-level guards live on the server.
