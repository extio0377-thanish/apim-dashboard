import { Router, type IRouter } from "express";
import { db, apiRequestsTable } from "@workspace/db";
import { and, eq, gte, lte, ilike, or, sql, desc, count, inArray } from "drizzle-orm";

const router: IRouter = Router();

const ES_URL = process.env.ELASTICSEARCH_URL || "http://10.0.3.3:19200";
const ES_INDEX = process.env.ELASTICSEARCH_INDEX || "apiman_metrics";

interface ESHit {
  _id: string;
  _source: {
    requestStart?: string;
    requestEnd?: string;
    requestDuration?: number;
    apiStart?: string;
    apiEnd?: string;
    apiDuration?: number;
    url?: string;
    resource?: string;
    method?: string;
    apiOrgId?: string;
    apiId?: string;
    apiVersion?: string;
    planId?: string;
    clientOrgId?: string;
    clientId?: string;
    clientVersion?: string;
    contractId?: string;
    user?: string;
    responseCode?: number;
    responseMessage?: string;
    failure?: boolean;
    failureCode?: number;
    error?: boolean;
    bytesUploaded?: number;
    bytesDownloaded?: number;
  };
}

async function esQuery(path: string, body: unknown) {
  const url = `${ES_URL}/${ES_INDEX}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ElasticSearch error ${res.status}: ${text}`);
    }
    return res.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw Object.assign(new Error(message), { esError: true });
  }
}

function buildTimeFilter(from?: string, to?: string) {
  if (!from && !to) return null;
  const range: Record<string, string> = {};
  if (from) range.gte = from;
  if (to) range.lte = to;
  return { range: { requestStart: range } };
}

function buildMustClauses(clientOrgId?: string, from?: string, to?: string) {
  const must: unknown[] = [];
  if (clientOrgId) {
    must.push({ term: { "clientOrgId.keyword": clientOrgId } });
  }
  const timeFilter = buildTimeFilter(from, to);
  if (timeFilter) must.push(timeFilter);
  return must;
}

router.get("/metrics/summary", async (req, res): Promise<void> => {
  const { clientOrgId, from, to } = req.query as Record<string, string>;
  const must = buildMustClauses(clientOrgId, from, to);

  const body = {
    size: 0,
    query: must.length > 0 ? { bool: { must } } : { match_all: {} },
    aggs: {
      total: { value_count: { field: "requestDuration" } },
      success: {
        filter: { range: { responseCode: { gte: 100, lte: 399 } } },
      },
      errors: {
        filter: { range: { responseCode: { gte: 400 } } },
      },
      avg_duration: { avg: { field: "requestDuration" } },
      p95_duration: {
        percentiles: { field: "requestDuration", percents: [95] },
      },
      total_bytes_up: { sum: { field: "bytesUploaded" } },
      total_bytes_down: { sum: { field: "bytesDownloaded" } },
      unique_clients: { cardinality: { field: "clientId.keyword" } },
      unique_apis: { cardinality: { field: "apiId.keyword" } },
      unique_users: { cardinality: { field: "user.keyword" } },
    },
  };

  const result = await esQuery("/_search", body);
  const aggs = result.aggregations;
  const totalRequests = result.hits?.total?.value ?? 0;
  const successCount = aggs.success?.doc_count ?? 0;
  const errorCount = aggs.errors?.doc_count ?? 0;

  res.json({
    totalRequests,
    successCount,
    errorCount,
    errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
    avgDurationMs: aggs.avg_duration?.value ?? 0,
    p95DurationMs: aggs.p95_duration?.values?.["95.0"] ?? 0,
    totalBytesUploaded: aggs.total_bytes_up?.value ?? 0,
    totalBytesDownloaded: aggs.total_bytes_down?.value ?? 0,
    uniqueClients: aggs.unique_clients?.value ?? 0,
    uniqueApis: aggs.unique_apis?.value ?? 0,
    uniqueUsers: aggs.unique_users?.value ?? 0,
  });
});

function groupMetricAgg(field: string, size: number) {
  return {
    terms: { field, size },
    aggs: {
      success: { filter: { range: { responseCode: { gte: 100, lte: 399 } } } },
      errors: { filter: { range: { responseCode: { gte: 400 } } } },
      avg_duration: { avg: { field: "requestDuration" } },
    },
  };
}

async function getGroupedMetrics(
  field: string,
  clientOrgId?: string,
  from?: string,
  to?: string,
  size = 20
) {
  const must = buildMustClauses(clientOrgId, from, to);
  const body = {
    size: 0,
    query: must.length > 0 ? { bool: { must } } : { match_all: {} },
    aggs: {
      grouped: groupMetricAgg(`${field}.keyword`, size),
    },
  };
  const result = await esQuery("/_search", body);
  const buckets = result.aggregations?.grouped?.buckets ?? [];
  return buckets.map((b: { key: string; doc_count: number; success: { doc_count: number }; errors: { doc_count: number }; avg_duration: { value: number } }) => ({
    key: b.key,
    count: b.doc_count,
    successCount: b.success?.doc_count ?? 0,
    errorCount: b.errors?.doc_count ?? 0,
    errorRate: b.doc_count > 0 ? ((b.errors?.doc_count ?? 0) / b.doc_count) * 100 : 0,
    avgDurationMs: b.avg_duration?.value ?? 0,
  }));
}

router.get("/metrics/by-user", async (req, res): Promise<void> => {
  const { clientOrgId, from, to, size } = req.query as Record<string, string>;
  const data = await getGroupedMetrics("user", clientOrgId, from, to, size ? parseInt(size) : 20);
  res.json(data);
});

router.get("/metrics/by-response-code", async (req, res): Promise<void> => {
  const { clientOrgId, from, to } = req.query as Record<string, string>;
  const must = buildMustClauses(clientOrgId, from, to);
  const body = {
    size: 0,
    query: must.length > 0 ? { bool: { must } } : { match_all: {} },
    aggs: {
      grouped: {
        terms: { field: "responseCode", size: 50 },
        aggs: {
          avg_duration: { avg: { field: "requestDuration" } },
        },
      },
    },
  };
  const result = await esQuery("/_search", body);
  const buckets = result.aggregations?.grouped?.buckets ?? [];
  const data = buckets.map((b: { key: number; doc_count: number; avg_duration: { value: number } }) => {
    const code = b.key;
    const isSuccess = code >= 100 && code <= 399;
    return {
      key: String(code),
      count: b.doc_count,
      successCount: isSuccess ? b.doc_count : 0,
      errorCount: isSuccess ? 0 : b.doc_count,
      errorRate: isSuccess ? 0 : 100,
      avgDurationMs: b.avg_duration?.value ?? 0,
    };
  });
  res.json(data);
});

router.get("/metrics/by-client", async (req, res): Promise<void> => {
  const { clientOrgId, from, to, size } = req.query as Record<string, string>;
  const data = await getGroupedMetrics("clientId", clientOrgId, from, to, size ? parseInt(size) : 20);
  res.json(data);
});

router.get("/metrics/by-api", async (req, res): Promise<void> => {
  const { clientOrgId, from, to, size } = req.query as Record<string, string>;
  const data = await getGroupedMetrics("apiId", clientOrgId, from, to, size ? parseInt(size) : 20);
  res.json(data);
});

router.get("/metrics/by-resource", async (req, res): Promise<void> => {
  const { clientOrgId, from, to, size } = req.query as Record<string, string>;
  const data = await getGroupedMetrics("resource", clientOrgId, from, to, size ? parseInt(size) : 20);
  res.json(data);
});

router.get("/metrics/timeseries", async (req, res): Promise<void> => {
  const { clientOrgId, from, to, interval = "1h" } = req.query as Record<string, string>;
  const must = buildMustClauses(clientOrgId, from, to);

  const calendarIntervalMap: Record<string, string> = {
    "1h": "hour",
    "6h": "hour",
    "1d": "day",
  };
  const calInterval = calendarIntervalMap[interval] ?? "hour";

  const body = {
    size: 0,
    query: must.length > 0 ? { bool: { must } } : { match_all: {} },
    aggs: {
      over_time: {
        date_histogram: {
          field: "requestStart",
          calendar_interval: calInterval,
          min_doc_count: 0,
        },
        aggs: {
          errors: { filter: { range: { responseCode: { gte: 400 } } } },
          avg_duration: { avg: { field: "requestDuration" } },
        },
      },
    },
  };

  const result = await esQuery("/_search", body);
  const buckets = result.aggregations?.over_time?.buckets ?? [];
  const data = buckets.map((b: { key_as_string: string; doc_count: number; errors: { doc_count: number }; avg_duration: { value: number } }) => ({
    timestamp: b.key_as_string,
    requests: b.doc_count,
    errors: b.errors?.doc_count ?? 0,
    avgDurationMs: b.avg_duration?.value ?? 0,
  }));

  res.json(data);
});

router.get("/metrics/raw", async (req, res): Promise<void> => {
  const { clientOrgId, from, to, size, from_offset, search, apiId, clientId, user, resource, responseCode } = req.query as Record<string, string>;

  const pageSize = size ? Math.min(parseInt(size), 500) : 50;
  const offset = from_offset ? parseInt(from_offset) : 0;

  const conditions = [];

  if (clientOrgId) conditions.push(eq(apiRequestsTable.clientOrgId, clientOrgId));
  if (from) conditions.push(gte(apiRequestsTable.requestTs, new Date(from)));
  if (to) conditions.push(lte(apiRequestsTable.requestTs, new Date(to)));
  if (apiId) conditions.push(ilike(apiRequestsTable.apiId, `%${apiId}%`));
  if (clientId) conditions.push(ilike(apiRequestsTable.clientId, `%${clientId}%`));
  if (user) conditions.push(ilike(apiRequestsTable.user, `%${user}%`));
  if (resource) conditions.push(ilike(apiRequestsTable.resourcePath, `%${resource}%`));

  if (responseCode) {
    const codes = responseCode.split(",").map((c) => c.trim());
    const codeConditions = codes.map((c) => {
      if (c.endsWith("xx")) {
        const prefix = parseInt(c[0]);
        return and(
          gte(apiRequestsTable.responseCode, prefix * 100),
          lte(apiRequestsTable.responseCode, prefix * 100 + 99)
        );
      }
      const num = parseInt(c);
      return isNaN(num) ? undefined : eq(apiRequestsTable.responseCode, num);
    }).filter(Boolean);
    if (codeConditions.length > 0) {
      conditions.push(or(...(codeConditions as Parameters<typeof or>)));
    }
  }

  if (search) {
    conditions.push(
      or(
        ilike(apiRequestsTable.apiId, `%${search}%`),
        ilike(apiRequestsTable.resourcePath, `%${search}%`),
        ilike(apiRequestsTable.clientId, `%${search}%`),
        ilike(apiRequestsTable.user, `%${search}%`),
      ) as ReturnType<typeof or>
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult, rows] = await Promise.all([
    db.select({ count: count() }).from(apiRequestsTable).where(where),
    db
      .select()
      .from(apiRequestsTable)
      .where(where)
      .orderBy(desc(apiRequestsTable.requestTs))
      .limit(pageSize)
      .offset(offset),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  const records = rows.map((r) => ({
    id: String(r.id),
    requestStart: r.requestTs?.toISOString() ?? "",
    requestEnd: r.requestTs?.toISOString() ?? "",
    requestDuration: r.requestDurationMs ?? 0,
    apiDuration: 0,
    url: null,
    resource: r.resourcePath ?? null,
    method: r.method ?? "",
    apiOrgId: r.clientOrgId,
    apiId: r.apiId ?? "",
    apiVersion: "",
    planId: null,
    clientOrgId: r.clientOrgId,
    clientId: r.clientId ?? "",
    clientVersion: null,
    user: r.user ?? null,
    responseCode: r.responseCode ?? 0,
    responseMessage: "",
    failure: (r.responseCode ?? 0) >= 400,
    error: (r.responseCode ?? 0) >= 500,
    bytesUploaded: r.bytesUploaded ?? 0,
    bytesDownloaded: r.bytesDownloaded ?? 0,
  }));

  res.json({ total, records });
});

router.post("/metrics/sync", async (req, res): Promise<void> => {
  const { clientOrgId, from, to, size = 1000 } = req.body ?? {};

  const must = buildMustClauses(clientOrgId, from, to);
  const body = {
    size: Math.min(Number(size), 5000),
    sort: [{ requestStart: { order: "desc" } }],
    query: must.length > 0 ? { bool: { must } } : { match_all: {} },
  };

  let esError: string | null = null;
  let hits: ESHit[] = [];

  try {
    const result = await esQuery("/_search", body);
    hits = result.hits?.hits ?? [];
  } catch (err) {
    esError = err instanceof Error ? err.message : String(err);
    res.json({ synced: 0, skipped: 0, source: "elasticsearch", error: esError });
    return;
  }

  if (hits.length === 0) {
    res.json({ synced: 0, skipped: 0, source: "elasticsearch", error: null });
    return;
  }

  const rows = hits.map((h: ESHit) => ({
    requestId: h._id,
    clientOrgId: h._source.clientOrgId ?? clientOrgId ?? "",
    apiId: h._source.apiId ?? null,
    clientId: h._source.clientId ?? null,
    user: h._source.user ?? null,
    resourcePath: h._source.resource ?? null,
    method: h._source.method ?? null,
    responseCode: h._source.responseCode ?? null,
    requestDurationMs: h._source.requestDuration ?? null,
    bytesUploaded: h._source.bytesUploaded ?? null,
    bytesDownloaded: h._source.bytesDownloaded ?? null,
    requestTs: h._source.requestStart ? new Date(h._source.requestStart) : null,
  }));

  const BATCH_SIZE = 100;
  let synced = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const result = await db
      .insert(apiRequestsTable)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: apiRequestsTable.id });
    synced += result.length;
    skipped += batch.length - result.length;
  }

  res.json({ synced, skipped, source: "elasticsearch", error: null });
});

export default router;
