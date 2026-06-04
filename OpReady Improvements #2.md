## **Critical (Security / Data Loss)**

| Gap | Fix |
| ----- | ----- |
| **No helmet** | Add helmet() to server.js — sets X-Frame-Options, CSP, HSTS, etc. One line |
| **Hardcoded session fallback** "fallback\_secret\_key" in server.js:96 | Fail startup if SESSION\_SECRET is missing via env-validator.js |
| **Session cookies lack secure/sameSite/httpOnly** | Set all three in the session config; secure: true behind HTTPS/reverse-proxy |
| **CORS wildcard on Socket.IO** | Restrict origin to the app's domain via config |
| **No graceful shutdown** | Add SIGTERM/SIGINT handlers to drain Socket.IO, flush WhatsApp queue, and close the DB before exiting |
| **WAL mode not set on the main DB** | Add PRAGMA journal\_mode=WAL in services/db/connection.js — currently only on backup restore |

---

## **High (Reliability / Observability)**

| Gap | Fix |
| ----- | ----- |
| **No uncaughtException / unhandledRejection handlers** | Log \+ graceful-exit; prevents silent crashes |
| **No readiness probe** | Extend the health endpoint (or add /ready) to report WhatsApp client state and queue depth |
| **No metrics endpoint** | Add prom-client with HTTP request duration, DB query count, queue depth — exposes /metrics for Prometheus/Grafana |
| **No request correlation IDs** | Middleware that stamps each request with a X-Request-Id and threads it through all log lines |
| **Inconsistent pagination** | members and skills return full result sets — add limit/offset before data grows |

---

## **Medium (Ops / Maintainability)**

| Gap | Fix |
| ----- | ----- |
| **No API versioning** | Mount all routes under /api/v1/ — a breaking change now costs nothing; later it costs a lot |
| **nodemon in production compose** | Use node server.js in prod; nodemon is a dev tool and masks restart loops |
| **No Docker HEALTHCHECK** | Add HEALTHCHECK CMD curl \-f http://localhost:3000/api/health to the Dockerfile |
| **No coverage threshold** | Add coverageThreshold: { global: { lines: 70 } } to Jest config so CI fails on regressions |
| **No CSRF protection** | Add csurf (or lusca) for browser-session mutation endpoints — API-key routes can be exempted |

---

## **Lower (Polish)**

* **Request body validation** — extend the existing Joi setup in middleware/validation.js to cover member/skill create/update routes, not just form structures  
* **Per-route rate limiting** — public form-submit endpoints should have a tighter limit than the global /api/\* limit  
* **Automated DB backup schedule** — the manual SQL dump exists; wire it to a cron inside the container or Litestream continuous replication  
* **Image hardening** — multi-stage Dockerfile (dev deps excluded from final image), add USER node to run non-root

---

**My recommendation for where to start:** The security cluster (helmet, session hardening, session secret guard) can be done in under an hour and eliminates the most critical gaps. Graceful shutdown \+ WAL mode are the next highest leverage — both are single-function additions that prevent data loss under load or container restart. Want me to implement any of these?

