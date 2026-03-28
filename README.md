# API Gateway Metrics Dashboard

A modern, Grafana-inspired dashboard for monitoring API Manager (apiman) metrics from ElasticSearch. Built with React + Node.js in a pnpm monorepo.

---

## Features

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
- **Dark mode toggle**

---

## Architecture

```
workspace/
├── artifacts/
│   ├── api-server/          # Express.js API server (Node.js)
│   └── apim-dashboard/      # React + Vite frontend
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
- PostgreSQL 14+ (for raw request storage and filtering)
- ElasticSearch 7+ with `apiman_metrics` index (your API Manager's ES instance)

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/apim-dashboard.git
cd apim-dashboard
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set environment variables

Create a `.env` file in the **project root**, or set these as environment variables:

```env
# PostgreSQL connection (required for raw requests table)
DATABASE_URL=postgresql://user:password@localhost:5432/apim_dashboard

# ElasticSearch (your apiman ES instance)
ELASTICSEARCH_URL=http://10.0.3.3:19200
ELASTICSEARCH_INDEX=apiman_metrics

# API server port (optional, defaults to 3001)
PORT=3001

# Session secret (any random string)
SESSION_SECRET=your-random-secret-here
```

### 4. Create the database table

Connect to your PostgreSQL database and run:

```sql
CREATE TABLE IF NOT EXISTS api_requests (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT,
  client_org_id TEXT NOT NULL,
  api_id TEXT,
  client_id TEXT,
  "user" TEXT,
  resource_path TEXT,
  method TEXT,
  response_code INTEGER,
  request_duration_ms INTEGER,
  bytes_uploaded BIGINT,
  bytes_downloaded BIGINT,
  request_ts TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_requests_client_org_id ON api_requests(client_org_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_request_ts    ON api_requests(request_ts);
CREATE INDEX IF NOT EXISTS idx_api_requests_api_id        ON api_requests(api_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_client_id     ON api_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_user          ON api_requests("user");
CREATE INDEX IF NOT EXISTS idx_api_requests_resource_path ON api_requests(resource_path);
CREATE INDEX IF NOT EXISTS idx_api_requests_response_code ON api_requests(response_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_requests_request_id ON api_requests(request_id)
  WHERE request_id IS NOT NULL;
```

### 5. Run codegen (generates API hooks from OpenAPI spec)

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
The API server starts on `http://localhost:3001` by default.

**Terminal 2 — Dashboard (frontend):**
```bash
pnpm --filter @workspace/apim-dashboard run dev
```
The dashboard opens at `http://localhost:5173`.

---

## API Endpoints

All endpoints are served under `/api/`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/metrics/summary` | KPI summary (from ElasticSearch) |
| GET | `/api/metrics/by-user` | Top users by request count |
| GET | `/api/metrics/by-response-code` | Breakdown by HTTP status code |
| GET | `/api/metrics/by-client` | Top clients by request count |
| GET | `/api/metrics/by-api` | Top APIs by request count |
| GET | `/api/metrics/by-resource` | Top resource paths |
| GET | `/api/metrics/timeseries` | Request volume over time |
| GET | `/api/metrics/raw` | Raw requests from PostgreSQL (filterable) |
| POST | `/api/metrics/sync` | Sync records from ElasticSearch → PostgreSQL |

### Common query parameters

| Param | Description | Example |
|-------|-------------|---------|
| `clientOrgId` | Environment filter | `PRODUCTION-DTBU` |
| `from` | ISO start date | `2024-01-01T00:00:00Z` |
| `to` | ISO end date | `2024-01-31T23:59:59Z` |
| `size` | Max results | `50` |

### Raw endpoint additional filters

| Param | Description | Example |
|-------|-------------|---------|
| `search` | Full-text search | `payments` |
| `apiId` | Filter by API ID | `payments-api` |
| `clientId` | Filter by client | `client-abc` |
| `user` | Filter by user | `john.doe` |
| `resource` | Filter by path | `/v1/payments` |
| `responseCode` | Status filter | `4xx`, `500`, `2xx,5xx` |

### Sync endpoint body

```json
{
  "clientOrgId": "PRODUCTION-DTBU",
  "from": "2024-01-01T00:00:00Z",
  "to": "2024-01-31T23:59:59Z",
  "size": 1000
}
```

---

## Building for Production

```bash
# Build the API server
pnpm --filter @workspace/api-server run build

# Build the frontend
pnpm --filter @workspace/apim-dashboard run build
```

The frontend build output is in `artifacts/apim-dashboard/dist/`. Serve it with any static file server, or configure your reverse proxy (nginx, Apache) to serve `dist/` and proxy `/api/` to the API server.

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
    }
}
```

---

## ElasticSearch Index Mapping

The dashboard expects your `apiman_metrics` index to have these fields:

| Field | Type | Description |
|-------|------|-------------|
| `clientOrgId` | keyword | Environment identifier (e.g. `PRODUCTION-DTBU`) |
| `clientId` | keyword | API client identifier |
| `apiId` | keyword | API identifier |
| `user` | keyword | Authenticated user |
| `resource` | keyword | Request resource/path |
| `method` | keyword | HTTP method |
| `responseCode` | integer | HTTP response code |
| `requestDuration` | integer | Request duration in ms |
| `requestStart` | date | Request start timestamp |
| `bytesUploaded` | long | Request body size in bytes |
| `bytesDownloaded` | long | Response body size in bytes |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript |
| UI Components | shadcn/ui, Tailwind CSS |
| Charts | Recharts |
| State / Data | TanStack Query (React Query) |
| API Layer | Express.js 5, TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| API Spec | OpenAPI 3.0, Orval codegen |
| Package Manager | pnpm workspaces |
| Font | IBM Plex Sans |

---

## License

MIT
