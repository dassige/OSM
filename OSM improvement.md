## **Code Quality & Architecture**

| \# | Suggestion | Priority |
| ----- | ----- | ----- |
| 1 | **Add test coverage** — Jest/Supertest is installed but zero tests exist | High |
| 2 | **Split db.js** — It's 500+ lines; break into user-service, event-service, crud-service | Medium |
| 3 | **Replace console.log** with structured logging (winston/pino) including request correlation IDs | Medium |
| 4 | **Consistent error handling** — Some Socket.IO handlers have unhandled promise rejections | Medium |

---

## **Data Layer**

| \# | Suggestion | Priority |
| ----- | ----- | ----- |
| 5 | **Missing DB indexes** on live\_forms(member\_id, skill\_id, form\_status) — likely causing slow queries | High |
| 6 | **Form versioning** — Snapshot form structure at submission time; changing a form mid-survey currently retroactively affects scoring | High |
| 7 | **Bulk inserts** — bulkAddMembers likely does N individual inserts; should batch them | Low |

---

## **Security**

| \# | Suggestion | Priority |
| ----- | ----- | ----- |
| 8 | **Rate limiting** — No API rate limits on /login or /api/\* endpoints (express-rate-limit) | High |
| 9 | **CORS** — Socket.IO currently allows origin: "\*" | Medium |
| 10 | **Email template XSS** — No input sanitisation before user-provided content is rendered into HTML templates | Medium |
| 11 | **Session store** — In-memory sessions are lost on restart; move to a persistent store (Redis or SQLite-backed) | Medium |

---

## **Frontend & UX**

| \# | Suggestion | Priority |
| ----- | ----- | ----- |
| 12 | **Frontend validation** — Joi schemas exist only on the backend; add lightweight client-side feedback | Low |
| 13 | **Report pagination** — No pagination on large member/skill lists; memory risk with large datasets | Medium |
| 14 | **Socket.IO reconnect** — If the connection drops, client state can diverge from server with no recovery | Medium |

---

## **Operations & Observability**

| \# | Suggestion | Priority |
| ----- | ----- | ----- |
| 15 | **Health check endpoint** — Add GET /health (DB connectivity \+ uptime) for load balancers/uptime monitors | Medium |
| 16 | **Automated backups** — Currently manual trigger only; add a background job for daily DB backups (optionally to GCS) | Medium |
| 17 | **DB housekeeping** — No archival/cleanup for old live\_forms and survey\_responses; tables will grow unbounded | Medium |
| 18 | **Startup env validation** — Missing entries in .env silently default; add a startup check for required keys | Low |

---

## **Features / Completeness**

| \# | Suggestion | Priority |
| ----- | ----- | ----- |
| 19 | **WhatsApp resilience** — The headless client has no session recovery or message queue retry logic on disconnect | Medium |
| 20 | **Training planner notifications** — No mechanism to notify members when they're assigned to a training session | Low |
| 21 | **OpenAPI/Swagger docs** — No API spec; a /api/docs endpoint would help with future integrations | Low |

---

**Overall:** The app has a solid foundation with a clear purpose, comprehensive feature set, and good documentation. The highest-impact quick wins are adding **database indexes** (\#5), **rate limiting** (\#8), **form versioning** (\#6), and **at least basic integration tests** (\#1).

Would you like to tackle any of these specifically?

