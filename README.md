# QueueFlow: Full-stack Queue Management System

A responsive queue management application built for the Rugas Team assignment. A manager can log in, create named queues, add people (each gets an auto-generated token), reorder the waiting list, call the next person with one click, cancel tokens, and track wait times and queue length on an analytics dashboard.

## Live demo

- **Frontend:** https://queue-management-murex.vercel.app
- **Backend API:** https://queuemanagement-srmt.onrender.com/api/health
- **GitHub:** https://github.com/AdvikaChaithra/QueueManagement

**Demo login:** `advika@gmail.com` / `advika1234` (or register a new manager account)

> The backend runs on Render's free tier, which sleeps after inactivity. The first request can take up to ~50 seconds to wake it up. Data is stored in SQLite on an ephemeral disk, so it may reset when the service restarts.

## Assignment requirements

| # | Requirement | Implementation |
|---|---|---|
| 1 | Manager can log in and create queues | Register/login with JWT sessions and bcrypt-hashed passwords; create and delete queues |
| 2 | Each queue has a name | Required name field, max 60 characters |
| 3 | Add persons/tokens; a token is created | Adding a person generates a sequential token number (#001, #002, ...) per queue |
| 4 | Queue displays waiting tokens | Live waiting list with the person in service shown separately, plus search |
| 5 | Move tokens up and down | Up/down buttons on each waiting token |
| 6 | Assign the top token for service with one click | "Call next" button; one token is in service at a time and is completed before the next is called |
| 7 | Cancel a token | Cancel button with confirmation, works for waiting and serving tokens |
| 8 | Analytics dashboard | Average wait time, queue length trend, completed/cancelled counts, token breakdown and recent activity |

## Tech stack

- **Frontend:** React 18, Vite, Recharts, Axios, Lucide React
- **Backend:** Node.js, Express
- **Database:** SQLite (`better-sqlite3`)
- **Authentication:** JWT and bcrypt

## Run locally

Requires Node.js 18 or newer (20 LTS recommended). Open two terminals.

### 1. Start the API

```bash
cd server
npm install
cp .env.example .env        # Windows CMD: copy .env.example .env
npm run dev
```

Set a long random `JWT_SECRET` in `server/.env`. The API runs at `http://localhost:5000` and creates the SQLite database at `server/data/queue_manager.db` on first start.

### 2. Start the frontend

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173`, create a manager account, and create your first queue.

## Environment variables

| Where | Variable | Purpose |
|---|---|---|
| server | `JWT_SECRET` | Secret used to sign login tokens |
| server | `CLIENT_ORIGIN` | Allowed frontend origin for CORS (no trailing slash) |
| server | `PORT` | API port (default 5000) |
| client | `VITE_API_URL` | API base URL ending in `/api` (default `http://localhost:5000/api`) |

## API routes

All routes except health, register and login require `Authorization: Bearer <JWT>`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | API health check |
| POST | `/api/auth/register` | Create manager account |
| POST | `/api/auth/login` | Manager login |
| GET | `/api/auth/me` | Current manager |
| GET / POST | `/api/queues` | List / create queues |
| DELETE | `/api/queues/:id` | Delete a queue |
| GET | `/api/queues/:id/tokens` | Get active queue tokens |
| POST | `/api/queues/:id/tokens` | Add a person and generate a token |
| POST | `/api/queues/:id/next` | Call the first waiting token |
| POST | `/api/tokens/:id/move` | Move a waiting token up/down (`{ "direction": "up" }`) |
| DELETE | `/api/tokens/:id` | Cancel a waiting or serving token |
| POST | `/api/tokens/:id/complete` | Complete active service |
| GET | `/api/queues/:id/analytics` | Queue metrics and recent activity |

## Design decisions

- Token numbers increment independently within each queue and are never reused after cancellation.
- Waiting positions are renumbered after a cancellation or when a token is called.
- Only one token can be in service per queue; the manager completes it before calling the next.
- Reordering applies only to waiting tokens.
- Average wait time is the time from token creation to the start of service, for tokens that have been called.
- The queue length trend comes from recorded queue events (add, call, cancel, complete, reorder), not sample data.
- Timestamps are stored in UTC and converted to the viewer's local time in the browser.
- Each manager can only access their own queues and tokens.

## Deployment

- **Backend (Render):** root directory `server`, build `npm install`, start `npm start`. Set `JWT_SECRET`, `CLIENT_ORIGIN` and `NODE_VERSION=20`.
- **Frontend (Vercel):** root directory `client`, build `npm run build`, output `dist`. Set `VITE_API_URL` to the Render URL plus `/api`.

## Future improvements

Rate limiting, password reset, a managed database (Postgres) for persistent storage, real-time updates via WebSockets, and automated tests.
