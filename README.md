# Local System

Internal operations platform for a taxi business: task assignment, worker reports and monitoring.
The entire interface is in Uzbek; every UI string lives in `client/src/lib/uz.js`.

- **client/** — React 18 + Vite, React Router v6, Recharts, date-fns, react-hot-toast
- **server/** — Node.js + Express 5, SQLite (better-sqlite3), JWT, bcrypt

## Quick start

```bash
npm run install:all     # installs root, server and client deps
npm run dev             # API on :4000, client on http://localhost:5173 (proxies /api)
```

On first start the server creates a default admin and prints
`Administrator yaratildi: telefon '+998000000000', parol 'admin123'`. No other data is seeded.
On the login page the `+998` prefix is fixed, so type the remaining nine digits: `000000000`.
Change this password after logging in (Xodimlar → Tahrirlash).

## Production

```bash
npm run build                                  # builds client/dist
JWT_SECRET=<long-random-string> NODE_ENV=production npm start
```

The server serves the built client and the API on one port (`PORT`, default 4000).
`JWT_SECRET` is required when `NODE_ENV=production`. See `server/.env.example`.

The database lives at `server/data/localsystem.db`. Back up the whole `server/data` folder.
The schema is versioned (`PRAGMA user_version`); the server refuses to start on a database
created by an incompatible older schema rather than silently misbehaving.

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

## Notes on behaviour

- **Phone numbers** are stored as `+998` followed by exactly 9 digits. Every phone field shows `+998` as a fixed prefix and accepts only the 9 digits; the API also accepts the 9 digits alone or with spaces.
- **Deactivate** (the toggle) blocks login immediately and keeps all data. **Butunlay o'chirish** (`DELETE /api/users/:id`) permanently removes the user, every task assigned to them and all their reports, and records a `user.delete` entry with the counts. Tasks the deleted user had *assigned to others* are kept with no assigner; their past activity-log entries keep their name.
- Nobody can deactivate or delete themselves, and the last active admin cannot be deactivated, demoted or deleted.
- **Pending reports** on the dashboard = active workers who have not submitted a report today.
- Stored enum values are Uzbek: priority `past | orta | yuqori | shoshilinch`, status `kutilmoqda | jarayonda | bajarildi | rad_etildi`, department `haydovchilar | dispetcherlar | mexaniklar | moliya`. Roles stay `admin | owner | worker`.
- Timestamps are SQLite `CURRENT_TIMESTAMP` strings (`YYYY-MM-DD HH:MM:SS`, UTC); the client converts them to local time.
- Workers can move tasks `kutilmoqda → jarayonda → bajarildi`, or reject a pending/in-progress task (reason required). Owners/admins can set any status.
- API error messages are in Uzbek, so they can be shown to users directly.
- Every status change is stored in `task_status_history` (shown when a task row is expanded) and in the activity log.
