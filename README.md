# API Gateway Metrics Dashboard

A modern, Grafana-inspired dashboard for monitoring API Manager (apiman) metrics from ElasticSearch. Built with React + Node.js in a pnpm monorepo. Includes full user authentication, role-based access control, password policy management, and per-user color themes.

---

## Features

- **Secure Login** — JWT-based authentication; no public signup; only admins can create users
- **Role-Based Access** — Admin, Operator, and Viewer roles with configurable permissions
- **Password Policy** — Enforce minimum length, uppercase, lowercase, numbers, and special characters globally
- **User Profile + Themes** — Each user can choose from 6 color themes (Red, Blue, Green, Orange, Pink, Default)
- **Two environment tabs** — Production (`PRODUCTION-DTBU`) and Sandbox (`SANDBOX-DTBU`)
- **Date range presets** — 1h, 6h, 24h, 7d, 30d, or custom calendar picker
- **KPI cards** — Total Requests, Error Rate, Avg Response Time, Unique Clients
- **Charts grouped by** — User, Response Code, Client ID, API ID, Resource Path
- **Request volume timeseries** — Area chart with configurable interval
- **Raw Requests table** — PostgreSQL-backed, fully searchable and filterable:
  - Search across API ID, resource, client ID, user simultaneously
  - Filter by API ID, Resource Path, Client ID, User, Status Code (2xx/4xx/5xx or exact)
  - Paginated (50 per page), CSV export
- **Sync from ES** — Pull latest records from ElasticSearch into the local DB on demand
- **Auto-refresh** — Configurable polling interval (30s, 1m, 5m, 15m)
- **CSV export** on every chart card
- **PDF print** layout

---

## Architecture

```
workspace/
├── artifacts/
│   ├── api-server/          # Express.js API server (Node.js)
│   │   └── src/
│   │       ├── lib/         # auth.ts (JWT/bcrypt), seed.ts (default data), logger.ts
│   │       ├── middlewares/ # authMiddleware.ts (JWT verification)
│   │       └── routes/      # auth, users, roles, password-policy, profile, metrics
│   └── apim-dashboard/      # React + Vite frontend
│       └── src/
│           ├── contexts/    # AuthContext.tsx, ThemeContext.tsx
│           ├── pages/       # Login, Dashboard, Users, Roles, PasswordPolicy, Profile
│           └── components/  # AppLayout (sidebar nav), UI components
├── lib/
│   ├── api-spec/            # OpenAPI 3.0 spec + Orval codegen config
│   ├── api-client-react/    # Auto-generated React Query hooks
│   ├── api-zod/             # Auto-generated Zod validation schemas
│   └── db/                  # Drizzle ORM schema + PostgreSQL client
└── pnpm-workspace.yaml
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v9+
- PostgreSQL 14+
- ElasticSearch 7+ with `apiman_metrics` index (your API Manager's ES instance)

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/extio0377-thanish/apim-dashboard.git
cd apim-dashboard
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set environment variables

Create a `.env` file in the **project root** (`apim-dashboard/.env`). The server automatically loads it from there. You can also place it directly inside `artifacts/api-server/` — values there override root values.

```env
# PostgreSQL connection (required)
DATABASE_URL=postgresql://user:password@localhost:5432/apim_dashboard

# ElasticSearch (your apiman ES instance)
ELASTICSEARCH_URL=http://10.0.3.3:19200
ELASTICSEARCH_INDEX=apiman_metrics

# API server port
PORT=3001

# JWT signing secret — use a long random string in production
SESSION_SECRET=your-very-long-random-secret-here
```

### 4. Create the database tables

Connect to your PostgreSQL database and run the following SQL. This creates all required tables and indexes.

#### 4a. Metrics table (raw API request storage)

```sql
CREATE TABLE IF NOT EXISTS api_requests (
  id               BIGSERIAL PRIMARY KEY,
  request_id       TEXT,
  client_org_id    TEXT NOT NULL,
  api_id           TEXT,
  client_id        TEXT,
  "user"           TEXT,
  resource_path    TEXT,
  method           TEXT,
  response_code    INTEGER,
  request_duration_ms INTEGER,
  bytes_uploaded   BIGINT,
  bytes_downloaded BIGINT,
  request_ts       TIMESTAMPTZ,
  synced_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_requests_client_org_id ON api_requests(client_org_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_request_ts    ON api_requests(request_ts);
CREATE INDEX IF NOT EXISTS idx_api_requests_api_id        ON api_requests(api_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_client_id     ON api_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_user          ON api_requests("user");
CREATE INDEX IF NOT EXISTS idx_api_requests_resource_path ON api_requests(resource_path);
CREATE INDEX IF NOT EXISTS idx_api_requests_response_code ON api_requests(response_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_requests_request_id
  ON api_requests(request_id) WHERE request_id IS NOT NULL;
```

#### 4b. Auth & User Management tables

```sql
-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id          VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  mobile        TEXT,
  password_hash TEXT NOT NULL,
  role_id       VARCHAR(36) REFERENCES roles(id),
  theme         TEXT NOT NULL DEFAULT 'red',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email   ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- Password policy table (single row, id always = 1)
CREATE TABLE IF NOT EXISTS password_policy (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  min_length    INTEGER NOT NULL DEFAULT 8,
  min_uppercase INTEGER NOT NULL DEFAULT 1,
  min_lowercase INTEGER NOT NULL DEFAULT 1,
  min_numbers   INTEGER NOT NULL DEFAULT 1,
  min_special   INTEGER NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **Automatic seeding:** When the API server starts for the first time, it automatically creates the three default roles (Admin, Operator, Viewer), the default admin user, and the default password policy. No manual SQL inserts are needed for these.

### 5. Run codegen (generates typed API hooks from the OpenAPI spec)

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## Running in Development

Start both the API server and the frontend in separate terminals:

**Terminal 1 — API Server:**
```bash
pnpm --filter @workspace/api-server run dev
```
The API server starts on `http://localhost:3001` by default (or the `PORT` you set).

**Terminal 2 — Dashboard (frontend):**
```bash
pnpm --filter @workspace/apim-dashboard run dev
```
The dashboard opens at `http://localhost:5173`.

**First Login:**
- URL: `http://localhost:5173`
- Email: `admin@apim.local`
- Password: `Admin@1234`

> Change the admin password immediately after first login via the **My Profile** page.

---

## Default Roles & Permissions

Three roles are seeded automatically on first startup:

| Role | Permissions |
|------|-------------|
| **Admin** | manage_users, manage_roles, manage_policy, view_metrics, sync_metrics |
| **Operator** | view_metrics, sync_metrics |
| **Viewer** | view_metrics |

You can create additional custom roles with any combination of permissions from the **Roles** page (Admin only).

---

## Password Policy

The default password policy (configurable from the **Password Policy** page):

| Rule | Default |
|------|---------|
| Minimum length | 8 characters |
| Minimum uppercase | 1 |
| Minimum lowercase | 1 |
| Minimum numbers | 1 |
| Minimum special characters | 1 |

Policy is enforced on all password entry points: creating a user, changing a user's password, and self-service password change in Profile.

---

## Color Themes

Each user can select their preferred theme from the **My Profile** page. Theme is stored per-user in the database and in localStorage.

| Theme | Color |
|-------|-------|
| Red (default) | `#d63031` |
| Blue | `#0079f2` |
| Green | `#1a9a47` |
| Orange | `#f97316` |
| Pink | `#e84393` |
| Default | `#1e3a5f` (dark navy) |

---

## API Endpoints

All endpoints are served under `/api/`. Most endpoints require a valid JWT Bearer token in the `Authorization` header.

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | None | Login — returns JWT token |
| GET | `/api/auth/me` | Bearer | Get current user info + permissions |

#### Login request body
```json
{ "email": "admin@apim.local", "password": "Admin@1234" }
```

#### Login response
```json
{
  "token": "<jwt>",
  "user": { "id": "...", "fullName": "System Administrator", "email": "admin@apim.local", "role": "Admin", "theme": "red" }
}
```

All subsequent API calls must include:
```
Authorization: Bearer <token>
```

### User Management (Admin only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List all users (any authenticated user) |
| POST | `/api/users` | Create a new user |
| PUT | `/api/users/:id` | Update a user |
| DELETE | `/api/users/:id` | Delete a user |

#### Create user body
```json
{
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "mobile": "+1234567890",
  "password": "Secure@123",
  "roleId": "<role-uuid>",
  "theme": "blue",
  "active": true
}
```

### Role Management (Admin only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/roles` | List all roles |
| GET | `/api/roles/permissions` | List all available permission keys |
| POST | `/api/roles` | Create a role |
| PUT | `/api/roles/:id` | Update a role |
| DELETE | `/api/roles/:id` | Delete a role |

#### Create role body
```json
{
  "name": "Auditor",
  "permissions": ["view_metrics"]
}
```

Available permission keys: `manage_users`, `manage_roles`, `manage_policy`, `view_metrics`, `sync_metrics`

### Password Policy (Admin only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/password-policy` | Get current policy |
| PUT | `/api/password-policy` | Update policy |

#### Update policy body
```json
{
  "minLength": 10,
  "minUppercase": 2,
  "minLowercase": 2,
  "minNumbers": 1,
  "minSpecial": 1
}
```

### User Profile (Self)

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/api/profile` | Update own fullName, mobile, theme |
| PUT | `/api/profile/password` | Change own password |

#### Change password body
```json
{ "currentPassword": "Old@1234", "newPassword": "New@5678" }
```

### Metrics (Authenticated)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (no auth) |
| GET | `/api/metrics/summary` | KPI summary |
| GET | `/api/metrics/by-user` | Top users by request count |
| GET | `/api/metrics/by-response-code` | Breakdown by HTTP status code |
| GET | `/api/metrics/by-client` | Top clients by request count |
| GET | `/api/metrics/by-api` | Top APIs by request count |
| GET | `/api/metrics/by-resource` | Top resource paths |
| GET | `/api/metrics/timeseries` | Request volume over time |
| GET | `/api/metrics/raw` | Raw requests from PostgreSQL |
| POST | `/api/metrics/sync` | Sync from ElasticSearch → PostgreSQL |

#### Common metrics query parameters

| Param | Description | Example |
|-------|-------------|---------|
| `clientOrgId` | Environment | `PRODUCTION-DTBU` |
| `from` | ISO start date | `2024-01-01T00:00:00Z` |
| `to` | ISO end date | `2024-01-31T23:59:59Z` |
| `size` | Max results | `50` |

#### Raw endpoint additional filters

| Param | Description | Example |
|-------|-------------|---------|
| `search` | Full-text search | `payments` |
| `apiId` | Filter by API ID | `payments-api` |
| `clientId` | Filter by client | `client-abc` |
| `user` | Filter by user | `john.doe` |
| `resource` | Filter by path | `/v1/payments` |
| `responseCode` | Status filter | `4xx`, `500`, `2xx,5xx` |

---

## Building for Production

```bash
# Build the API server
pnpm --filter @workspace/api-server run build

# Build the frontend
pnpm --filter @workspace/apim-dashboard run build
```

The frontend build output is at `artifacts/apim-dashboard/dist/`. Serve it with a static file server and proxy `/api/` to the API server.

### Example nginx config

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /path/to/apim-dashboard/artifacts/apim-dashboard/dist;
    index index.html;

    # Frontend — SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## ElasticSearch Index Mapping

The dashboard expects your `apiman_metrics` index to have these fields:

| Field | Type | Description |
|-------|------|-------------|
| `clientOrgId` | keyword | Environment (`PRODUCTION-DTBU`) |
| `clientId` | keyword | API client identifier |
| `apiId` | keyword | API identifier |
| `user` | keyword | Authenticated user |
| `resource` | keyword | Request resource/path |
| `method` | keyword | HTTP method |
| `responseCode` | integer | HTTP response code |
| `requestDuration` | integer | Duration in ms |
| `requestStart` | date | Request start timestamp |
| `bytesUploaded` | long | Request body size in bytes |
| `bytesDownloaded` | long | Response body size in bytes |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript |
| UI Components | shadcn/ui, Tailwind CSS v4 |
| Charts | Recharts |
| State / Data | TanStack Query (React Query) |
| Routing | Wouter |
| Forms | React Hook Form + Zod |
| API Layer | Express.js 5, TypeScript |
| Authentication | JWT (jsonwebtoken) + bcryptjs |
| Database | PostgreSQL + Drizzle ORM |
| API Spec | OpenAPI 3.0, Orval codegen |
| Package Manager | pnpm workspaces |
| Font | IBM Plex Sans |

---

## License

MIT
