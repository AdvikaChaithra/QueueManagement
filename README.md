# QueueFlow — Full-stack Queue Management System

A responsive queue management app built for the Rugas Team project brief. Managers can register/login, create multiple queues, add people (with automatically generated sequential token numbers), reorder waiting tokens, call the next person, complete service, cancel tokens, and view queue analytics.

## Tech stack

- **Frontend:** React 18, Vite, CSS, Recharts, Axios, Lucide React
- **Backend:** Node.js, Express
- **Database:** SQLite (`better-sqlite3`)
- **Authentication:** JWT sessions and bcrypt password hashing

## Requirements

- Node.js 18 or newer and npm
- Git (optional, for GitHub submission)

## Run locally

Open two terminals.

### 1. Start the API

```bash
cd server
npm install
```

Copy `.env.example` to `.env` and set a long random `JWT_SECRET` value. Then:

```bash
npm run dev
```

API runs at `http://localhost:5000`. The SQLite database is automatically created at `server/data/queue_manager.db` on first start.

### 2. Start the frontend

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173`, create a manager account, and create your first queue.

## Main API routes

All routes except health and register/login require `Authorization: Bearer <JWT>`.

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

## Queue behavior and design decisions

- Token numbers increment independently within each queue and are not reused after cancellation.
- Waiting positions are normalized after a cancellation or service assignment.
- Only one token may be in service per queue. The manager must complete it before calling the next person.
- Reordering applies only to waiting tokens; the serving token is kept separate at the top.
- Average wait time is calculated from token creation to the time service begins, for tokens that have been called.
- Queue length trends are based on recorded queue events. The trend is a lightweight event-based history, not fabricated sample data.
- Queue data is scoped to the authenticated manager.

## GitHub submission

From the project root:

```bash
git init
git add .
git commit -m "Build QueueFlow queue management app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/queueflow.git
git push -u origin main
```

Do not commit `server/.env`, `server/data/`, `node_modules/`, or build output. A `.gitignore` is included.

## Before production deployment

Set a strong `JWT_SECRET`, serve the frontend and API over HTTPS, restrict CORS to the deployed frontend origin, add rate limiting and account recovery, and use a managed database with backups. This starter is designed for local evaluation/demo use.

## Deployment notes

- Frontend: set `VITE_API_URL` (see `client/.env.example`) to the deployed API URL ending in `/api`, then run `npm run build`.
- Backend: set `JWT_SECRET` and `CLIENT_ORIGIN` (the deployed frontend URL). SQLite needs a persistent disk; on hosts with ephemeral storage the data resets on restart.
