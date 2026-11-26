# Assignment 4 — mandatory demonstration plan

Use isolated demo accounts and preserve existing MongoDB data. Configure Google/Keycloak and link each provider to an active internal account before the associated login demonstration. Create separate internal users for Customer, Manager, Operations Reviewer, Senior Reviewer, Compliance Reviewer, Risk Analyst, Auditor. Create two active CAD accounts for a customer using the System Administrator first. Use the customer to initiate transfers. Default high-risk example: CAD 120,000 from CAD 1,000,000 with clean 24h history; risk score 60. Manager executes only after required reviews.

| # | Scenario | Expected evidence |
|---|---|---|
| 1 | Session login | Session cookie; current user /me returns 200 |
| 2 | Refresh browser | Authenticated portal persists |
| 3 | Session logout | Old cookie cannot access protected API |
| 4 | JWT login | RS256 access token, HttpOnly refresh cookie |
| 5 | Expired JWT | 401 (wait 15 minutes or use a test token signed with a test key on disposable DB) |
| 6 | JWT refresh | New refresh cookie and access token |
| 7 | Reuse old refresh token in Postman | 401 and replacement family denied |
| 8 | Keycloak | Same internal ID and assigned roles |
| 9 | Google | Same internal ID and assigned roles |
| 10 | External identity linking | Authenticated local session; unique provider subject; no email-only matching |
| 11 | Customer requests foreign account ID | 404/403; list filters cannot override ownership |
| 12 | Operations Reviewer attempts High stage 2 | 403 |
| 13 | Senior Reviewer performs High stage 2 | Approved; Manager can process transfer |
| 14 | Multi-role reviewer attempts both High stages | Second decision denied; separate authorized reviewer required |
| 15 | Admin suspends customer or reviewer | Existing session and JWT rejected |
| 16 | Customer tries to modify role | 403 |
| 17 | Revoke own active session | Revoked credential cannot access protected endpoints |
| 18 | Audit trail | Success and failure events visible; mutation routes absent |
| 19 | Restart Compose (without -v) | Mongo data, users and Keycloak persist |
| 20 | Unauthenticated Postman request | 401 on financial/admin endpoint |

Additional demonstrations: CSRF mutation without header (403); invalid password (401); invitation redeem and replay; password reset by SMTP; custom role permissions and removal; customer transfer gate; assigned risk case read/edit isolation; administrator/manager approval attempt denied; audit API read-only; access token family revoked on logout. Test all eight seeded roles; explicitly confirm Auditor cannot mutate records.

Use the Postman collection in `postman/` and test credentials stored only locally. Browser tests can capture screenshots; provided visual mockups should not be submitted as runtime evidence. Record actual outcomes and screenshots after local execution.
