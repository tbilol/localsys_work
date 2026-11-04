# Local System

Internal operations platform for a taxi business: task assignment, worker reports and monitoring.
The entire interface is in Uzbek; every UI string lives in `client/src/lib/uz.js`.

- **client/** — React 18 + Vite, React Router v6, Recharts, date-fns, react-hot-toast → deployed on **Vercel**
- **server/** — Node.js + Express 5, JWT, bcrypt, helmet, express-validator → deployed on **Railway**
- **Database** — PostgreSQL (**Supabase**) via `pg`; local development falls back to SQLite when `DATABASE_URL` is not set

## Local development

```bash
npm run install:all     # installs root, server and client deps
npm run dev             # API on http://localhost:3000, client on http://localhost:5173
```

No `.env` is needed locally: without `DATABASE_URL` the API uses SQLite at `server/data/localsystem.db`
(override with `SQLITE_PATH`), and the client calls `http://localhost:3000/api`.
To develop against PostgreSQL instead, put `DATABASE_URL=…` in `server/.env`.

On first start the server creates the tables and a default admin, and prints
`Administrator yaratildi: telefon '+998000000000', parol 'admin123'`. No other data is seeded.
On the login page the `+998` prefix is fixed, so type the remaining nine digits: `000000000`.
**Change this password right after the first login** (Xodimlar → Tahrirlash).

## Deployment

### 1. Supabase (database)

1. Create a project. In **Connect → Connection string → URI** copy the **Session pooler** string
   (`postgresql://postgres.PROJECTID:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres`).
   The direct `db.PROJECTID.supabase.co` host is IPv6-only and many hosts, Railway included, may not reach it.
2. Nothing else to do: the API creates its tables on startup (`CREATE TABLE IF NOT EXISTS`).
   You can also run it by hand with `npm --prefix server run migrate`.

### 2. Railway (API)

New project → Deploy from GitHub → set **Root Directory** to `server`. Railway runs `npm install` and `npm start`.

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Supabase connection string |
| `JWT_SECRET` | a long random string, e.g. `openssl rand -hex 32` |
| `FRONTEND_URL` | your Vercel URL, e.g. `https://local-system.vercel.app` (comma-separate several) |
| `NODE_ENV` | `production` |
| `TZ` | `Asia/Tashkent` — "today"/"this week" on the dashboard and date filters use the server's time zone |

`PORT` is provided by Railway. Set the health check path to `/api/health`.
Then **Settings → Networking → Generate Domain** to get the API URL.

### 3. Vercel (client)

New project → import the repo → **Root Directory** `client` (framework preset: Vite).
Add `VITE_API_URL` = `https://YOUR-API.up.railway.app/api`, then deploy.
`VITE_API_URL` is baked in at build time, so redeploy after changing it. `client/vercel.json` sends every
route to `index.html` so deep links such as `/tasks` work.

Finally make sure `FRONTEND_URL` on Railway matches the Vercel domain exactly (no trailing slash needed).

### Environment reference

| Server variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL URL. Unset = SQLite |
| `JWT_SECRET` | dev value | Required when `NODE_ENV=production` |
| `FRONTEND_URL` | any origin | CORS allow-list |
| `PORT` | `3000` | |
| `LOGIN_RATE_LIMIT` | `5` | Login attempts per minute per IP |
| `TRUST_PROXY` | `1` | Proxy hops in front of the API (for the real client IP) |
| `PGSSL` | on for non-local hosts | `disable` to turn TLS off |
| `PG_POOL_MAX` | `10` | Max PostgreSQL connections |
| `SQLITE_PATH` | `server/data/localsystem.db` | SQLite file when `DATABASE_URL` is unset |

### Single-host alternative

`npm run build && npm start` also serves `client/dist` from the API process. Build the client with
`VITE_API_URL=/api` for that setup.

## Roles

| | Admin | Owner | Worker |
|---|:-:|:-:|:-:|
| Dashboard & statistics | ✓ | ✓ | |
| Create / assign / bulk-complete tasks | ✓ | ✓ | |
| View all reports | ✓ | ✓ | |
| My tasks (start / complete / reject) | | | ✓ |
| Submit reports, see own history | | | ✓ |
| Add / edit / deactivate / delete workers | ✓ | ✓ | |
| Manage admins and owners | ✓ | | |
| Activity log | ✓ | | |

## API

All responses use `{ success, data, error }`. Every route except login requires `Authorization: Bearer <token>`.

| Method | Path | Access |
|---|---|---|
| POST | `/api/auth/login` | public |
| GET | `/api/auth/me` | any |
| GET, POST | `/api/users` | admin (all roles), owner (workers only) |
| GET, PUT, DELETE | `/api/users/:id` | admin (all roles), owner (workers only); DELETE is permanent |
| GET | `/api/users/workers` | admin, owner — worker list for assignment |
| GET | `/api/tasks` | any (workers see only their own) — `status, priority, assignedTo, from, to, search` |
| POST | `/api/tasks` | admin, owner |
| GET | `/api/tasks/:id` | any (own only for workers), includes status history |
| PUT | `/api/tasks/:id` | admin, owner |
| PUT | `/api/tasks/:id/status` | any — `{ status, rejectionReason }` |
| PUT | `/api/tasks/bulk/status` | admin, owner — `{ ids, status }` |
| GET | `/api/reports` | any (own only for workers) — `department, userId, from, to, search` |
| POST | `/api/reports` | worker — `{ title, content }` (department taken from the worker's profile) |
| GET | `/api/reports/:id` | any (own only for workers) |
| GET | `/api/dashboard/stats`, `/api/dashboard/chart-data` | admin, owner |
| GET | `/api/activity` | admin — `action, userId, from, to, limit, offset` |
| GET | `/api/health` | public — `{ status: "ok", timestamp }` |

## Notes on behaviour

- **Phone numbers** are stored as `+998` followed by exactly 9 digits. Every phone field shows `+998` as a fixed prefix and accepts only the 9 digits; the API also accepts the 9 digits alone or with spaces.
- **Deactivate** (the toggle) blocks login immediately and keeps all data. **Butunlay o'chirish** (`DELETE /api/users/:id`) permanently removes the user, every task assigned to them and all their reports, and records a `user.delete` entry with the counts. Tasks the deleted user had *assigned to others* are kept with no assigner; their past activity-log entries keep their name.
- Nobody can deactivate or delete themselves, and the last active admin cannot be deactivated, demoted or deleted.
- Login is rate-limited to 5 attempts per minute per IP (in memory, per API instance). Staff behind one shared office IP share that budget; raise `LOGIN_RATE_LIMIT` if that becomes a problem.
- Every POST/PUT body is validated with express-validator before the route runs; errors come back in Uzbek.
- **Pending reports** on the dashboard = active workers who have not submitted a report today.
- Stored enum values are Uzbek: priority `past | orta | yuqori | shoshilinch`, status `kutilmoqda | jarayonda | bajarildi | rad_etildi`, department `haydovchilar | dispetcherlar | mexaniklar | moliya`. Roles stay `admin | owner | worker`.
- Timestamps are `TIMESTAMPTZ` in PostgreSQL (UTC text in SQLite); the API always returns ISO-8601 UTC strings and the client shows them in local time.
- Workers can move tasks `kutilmoqda → jarayonda → bajarildi`, or reject a pending/in-progress task (reason required). Owners/admins can set any status.
- API error messages are in Uzbek, so they can be shown to users directly.
- Every status change is stored in `task_status_history` (shown when a task row is expanded) and in the activity log.
