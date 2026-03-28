import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMetricsSummary,
  useGetMetricsByUser,
  useGetMetricsByResponseCode,
  useGetMetricsByClient,
  useGetMetricsByApi,
  useGetMetricsByResource,
  useGetMetricsTimeseries,
  useGetMetricsRaw,
  useSyncMetrics,
  GetMetricsTimeseriesInterval,
} from "@workspace/api-client-react";
import { CSVLink } from "react-csv";
import { format, subHours, subDays, subMinutes } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, ChevronDown, Check, Sun, Moon, Download, Printer,
  Calendar as CalendarIcon, ArrowUp, ArrowDown, Activity, AlertCircle, Clock, Users,
  BarChart3Icon, Search, X, DatabaseZap, Filter
} from "lucide-react";

// Colors
const CHART_COLORS = {
  blue: "#0079F2",
  purple: "#795EFF",
  green: "#009118",
  red: "#A60808",
  pink: "#ec4899",
  orange: "#f97316",
  yellow: "#eab308",
};

const CHART_COLOR_LIST = [
  CHART_COLORS.blue,
  CHART_COLORS.purple,
  CHART_COLORS.green,
  CHART_COLORS.red,
  CHART_COLORS.pink,
];

const DATA_SOURCES = ["ElasticSearch", "API Gateway"];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "6px",
        padding: "10px 14px",
        border: "1px solid #e0e0e0",
        color: "#1a1a1a",
        fontSize: "13px",
        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
      }}
    >
      <div style={{ marginBottom: "6px", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}>
        {payload.length === 1 && payload[0].color && payload[0].color !== "#ffffff" && (
          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", backgroundColor: payload[0].color, flexShrink: 0 }} />
        )}
        {label}
      </div>
      {payload.map((entry: any, index: number) => (
        <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
          {payload.length > 1 && entry.color && entry.color !== "#ffffff" && (
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", backgroundColor: entry.color, flexShrink: 0 }} />
          )}
          <span style={{ color: "#444" }}>{entry.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>
            {typeof entry.value === "number" ? new Intl.NumberFormat("en-US").format(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function CustomLegend({ payload }: any) {
  if (!payload || payload.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 16px", fontSize: "13px" }}>
      {payload.map((entry: any, index: number) => (
        <div key={index} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", backgroundColor: entry.color, flexShrink: 0 }} />
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function parseLocalDate(dateStr: string): Date {
  const d = new Date(dateStr);
  return d;
}

function formatDate(dateStr: string, fmt = "MMM d, HH:mm"): string {
  if (!dateStr) return "";
  try {
    return format(new Date(dateStr), fmt);
  } catch (e) {
    return dateStr;
  }
}

function getStatusColor(code: number | string) {
  const c = typeof code === 'string' ? parseInt(code, 10) : code;
  if (c >= 200 && c < 300) return CHART_COLORS.green;
  if (c >= 300 && c < 400) return CHART_COLORS.blue;
  if (c >= 400 && c < 500) return CHART_COLORS.orange;
  if (c >= 500) return CHART_COLORS.red;
  return CHART_COLORS.purple;
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [isDark, setIsDark] = useState(false);
  const [clientOrgId, setClientOrgId] = useState<"PRODUCTION-DTBU" | "SANDBOX-DTBU" | "">("PRODUCTION-DTBU");
  
  // Date range filter
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 1),
    to: new Date(),
  });
  
  const fromIso = dateRange.from.toISOString();
  const toIso = dateRange.to.toISOString();

  const [intervalMs, setIntervalMs] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const [timeseriesInterval, setTimeseriesInterval] = useState<GetMetricsTimeseriesInterval>("1h");

  // Pagination for raw data
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Raw table filters
  const [filterSearch, setFilterSearch] = useState("");
  const [filterApiId, setFilterApiId] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterResource, setFilterResource] = useState("");
  const [filterResponseCode, setFilterResponseCode] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [syncStatus, setSyncStatus] = useState<{ synced: number; error: string | null } | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filterSearch), 400);
    return () => clearTimeout(t);
  }, [filterSearch]);

  const hasActiveFilters = !!(filterApiId || filterClientId || filterUser || filterResource || filterResponseCode || filterSearch);

  const clearFilters = useCallback(() => {
    setFilterSearch("");
    setFilterApiId("");
    setFilterClientId("");
    setFilterUser("");
    setFilterResource("");
    setFilterResponseCode("");
    setPage(0);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (intervalMs) {
      const id = setInterval(() => {
        queryClient.invalidateQueries();
      }, intervalMs);
      return () => clearInterval(id);
    }
  }, [intervalMs, queryClient]);

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  // When clientOrgId is "" (All Environments), omit the filter entirely so ES returns all data
  const commonParams = clientOrgId
    ? { clientOrgId, from: fromIso, to: toIso }
    : { from: fromIso, to: toIso };

  const summaryQuery = useGetMetricsSummary({ params: commonParams });
  const byUserQuery = useGetMetricsByUser({ params: { ...commonParams, size: 10 } });
  const byCodeQuery = useGetMetricsByResponseCode({ params: commonParams });
  const byClientQuery = useGetMetricsByClient({ params: { ...commonParams, size: 10 } });
  const byApiQuery = useGetMetricsByApi({ params: { ...commonParams, size: 10 } });
  const byResourceQuery = useGetMetricsByResource({ params: { ...commonParams, size: 10 } });
  const timeseriesQuery = useGetMetricsTimeseries({ params: { ...commonParams, interval: timeseriesInterval } });
  const rawQuery = useGetMetricsRaw({ params: { 
    ...commonParams, 
    size: pageSize, 
    from_offset: page * pageSize,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(filterApiId && { apiId: filterApiId }),
    ...(filterClientId && { clientId: filterClientId }),
    ...(filterUser && { user: filterUser }),
    ...(filterResource && { resource: filterResource }),
    ...(filterResponseCode && filterResponseCode !== "all" && { responseCode: filterResponseCode }),
  }});
  const syncMutation = useSyncMetrics();

  // Per-section loading — each card shows its own skeleton until its data arrives
  const summaryLoading   = summaryQuery.isLoading    || summaryQuery.isFetching;
  const timeseriesLoading= timeseriesQuery.isLoading || timeseriesQuery.isFetching;
  const byApiLoading     = byApiQuery.isLoading      || byApiQuery.isFetching;
  const byCodeLoading    = byCodeQuery.isLoading     || byCodeQuery.isFetching;
  const byClientLoading  = byClientQuery.isLoading   || byClientQuery.isFetching;
  const byUserLoading    = byUserQuery.isLoading     || byUserQuery.isFetching;
  const byResourceLoading= byResourceQuery.isLoading || byResourceQuery.isFetching;
  const rawLoading       = rawQuery.isLoading        || rawQuery.isFetching;
  // Keep `loading` for the top refresh button spinner (any query in-flight)
  const loading = summaryLoading || timeseriesLoading || byApiLoading || byCodeLoading ||
                  byClientLoading || byUserLoading || byResourceLoading || rawLoading;
  const isSpinning = loading;

  function esErrMsg(q: { isError: boolean; error: unknown }) {
    if (!q.isError) return null;
    const msg = q.error instanceof Error ? q.error.message : String(q.error);
    return msg.includes("ECONNREFUSED") || msg.includes("fetch failed")
      ? "Cannot reach ElasticSearch"
      : msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
  }

  const summary = summaryQuery.data;
  const byUser = byUserQuery.data || [];
  const byCode = byCodeQuery.data || [];
  const byClient = byClientQuery.data || [];
  const byApi = byApiQuery.data || [];
  const byResource = byResourceQuery.data || [];
  const timeseries = timeseriesQuery.data || [];
  const rawData = rawQuery.data;

  const lastRefreshed = summaryQuery.dataUpdatedAt
    ? (() => {
        const d = new Date(summaryQuery.dataUpdatedAt);
        return `${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()} on ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      })()
    : null;

  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "#e5e5e5";
  const tickColor = isDark ? "#98999C" : "#71717a";

  const applyPreset = (preset: string) => {
    const now = new Date();
    switch (preset) {
      case "1h": setDateRange({ from: subHours(now, 1), to: now }); break;
      case "6h": setDateRange({ from: subHours(now, 6), to: now }); break;
      case "24h": setDateRange({ from: subDays(now, 1), to: now }); break;
      case "7d": setDateRange({ from: subDays(now, 7), to: now }); break;
      case "30d": setDateRange({ from: subDays(now, 30), to: now }); break;
    }
  };

  const responseCodeData = useMemo(() => {
    return byCode.map(item => ({
      name: item.key,
      value: item.count,
      color: getStatusColor(item.key)
    }));
  }, [byCode]);

  // Raw Table
  const [sorting, setSorting] = useState<SortingState>([]);
  const rawColumns: ColumnDef<any>[] = [
    { accessorKey: "timestamp", header: "Timestamp", cell: ({ row }) => <span className="font-mono text-xs whitespace-nowrap">{formatDate(row.original.requestStart, "yyyy-MM-dd HH:mm:ss")}</span> },
    { accessorKey: "method", header: "Method", cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.method}</span> },
    { accessorKey: "apiId", header: "API ID", cell: ({ row }) => <span className="font-mono text-xs max-w-[120px] truncate block" title={row.original.apiId}>{row.original.apiId || "-"}</span> },
    { accessorKey: "resource", header: "Resource", cell: ({ row }) => <span className="font-mono text-xs max-w-[160px] truncate block" title={row.original.resource}>{row.original.resource || "-"}</span> },
    { accessorKey: "clientId", header: "Client ID", cell: ({ row }) => <span className="font-mono text-xs max-w-[120px] truncate block" title={row.original.clientId}>{row.original.clientId || "-"}</span> },
    { accessorKey: "user", header: "User", cell: ({ row }) => <span className="text-xs max-w-[120px] truncate block" title={row.original.user}>{row.original.user || "-"}</span> },
    { 
      accessorKey: "responseCode", 
      header: "Status",
      cell: ({ row }) => {
        const code = row.original.responseCode;
        const colorClass = 
          code >= 200 && code < 300 ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
          code >= 300 && code < 400 ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" :
          code >= 400 && code < 500 ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" :
          "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
        return <Badge className={`hover:bg-transparent ${colorClass}`} variant="outline">{code}</Badge>;
      }
    },
    { accessorKey: "requestDuration", header: "Duration", cell: ({ row }) => <span className="text-xs whitespace-nowrap">{row.original.requestDuration} ms</span> },
  ];

  const rawTable = useReactTable({
    data: rawData?.records || [],
    columns: rawColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="min-h-screen bg-background px-5 py-4 pt-[32px] pb-[32px] pl-[24px] pr-[24px]">
      <div className="max-w-[1400px] mx-auto">
        
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
          <div className="pt-2">
            <h1 className="font-bold text-[32px] tracking-tight">API Metrics Dashboard</h1>
            <p className="text-muted-foreground mt-1.5 text-[14px]">Monitor API Gateway traffic and performance</p>
            
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[12px] text-muted-foreground shrink-0">Data Sources:</span>
              {DATA_SOURCES.map((source) => (
                <span
                  key={source}
                  className="text-[12px] font-bold rounded px-2 py-0.5 truncate print:!bg-[rgb(229,231,235)] print:!text-[rgb(75,85,99)]"
                  style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgb(229, 231, 235)", color: isDark ? "#c8c9cc" : "rgb(75, 85, 99)" }}
                >
                  {source}
                </span>
              ))}
            </div>
            {lastRefreshed && <p className="text-[12px] text-muted-foreground mt-2">Last refresh: {lastRefreshed}</p>}
          </div>
          
          <div className="flex flex-col items-end gap-3 pt-2 print:hidden">
            <div className="flex items-center gap-3">
              <div className="relative" ref={dropdownRef}>
                <div
                  className="flex items-center rounded-[6px] overflow-hidden h-[26px] text-[12px]"
                  style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
                >
                  <button onClick={handleRefresh} disabled={loading} className="flex items-center gap-1 px-2 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50">
                    <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                  <div className="w-px h-4 shrink-0" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)" }} />
                  <button onClick={() => setDropdownOpen((o) => !o)} className="flex items-center justify-center px-1.5 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                {dropdownOpen && (
                  <div className="absolute right-0 top-[30px] w-48 bg-popover border rounded-md shadow-md z-50 py-1 text-sm text-popover-foreground">
                    <div className="px-3 py-2 border-b text-xs font-semibold text-muted-foreground">Auto Refresh</div>
                    <button className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between" onClick={() => { setIntervalMs(null); setDropdownOpen(false); }}>
                      Off {!intervalMs && <Check className="w-4 h-4" />}
                    </button>
                    {[ { l: "1m", ms: 60000 }, { l: "5m", ms: 300000 }, { l: "15m", ms: 900000 }].map(opt => (
                      <button key={opt.l} className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between" onClick={() => { setIntervalMs(opt.ms); setDropdownOpen(false); }}>
                        Every {opt.l} {intervalMs === opt.ms && <Check className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => window.print()}
                className="flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors"
                style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
              >
                <Printer className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsDark((d) => !d)}
                className="flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors"
                style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
              >
                {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Filters Row */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 p-4 rounded-lg bg-card border print:hidden">
          <div className="flex-1 w-full lg:w-auto">
            <Tabs value={clientOrgId} onValueChange={(v: any) => setClientOrgId(v)} className="w-full max-w-[480px]">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="">All Environments</TabsTrigger>
                <TabsTrigger value="PRODUCTION-DTBU">Production</TabsTrigger>
                <TabsTrigger value="SANDBOX-DTBU">Sandbox</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-muted p-1 rounded-md">
              {["1h", "6h", "24h", "7d", "30d"].map(preset => (
                <Button key={preset} variant="ghost" size="sm" onClick={() => applyPreset(preset)} className="h-8 text-xs font-medium px-3">
                  {preset}
                </Button>
              ))}
            </div>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[280px] justify-start text-left font-normal bg-background">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dateRange.from, "MMM d, HH:mm")} - {format(dateRange.to, "MMM d, HH:mm")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range) => { if (range?.from && range?.to) setDateRange({ from: range.from, to: range.to }); }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* KPIs */}
        {summaryQuery.isError && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>ElasticSearch error — {esErrMsg(summaryQuery)}. Summary metrics unavailable.</span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-6 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <Activity className="w-4 h-4" />
                <p className="text-sm font-medium">Total Requests</p>
              </div>
              {summaryLoading ? <Skeleton className="h-8 w-32" /> : (
                <p className="text-3xl font-bold tracking-tight" style={{ color: CHART_COLORS.blue }}>
                  {summary?.totalRequests?.toLocaleString() ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <AlertCircle className="w-4 h-4" />
                <p className="text-sm font-medium">Error Rate</p>
              </div>
              {summaryLoading ? <Skeleton className="h-8 w-32" /> : (
                <p className={`text-3xl font-bold tracking-tight ${
                  (summary?.errorRate ?? 0) > 5 ? 'text-red-600' : (summary?.errorRate ?? 0) < 1 ? 'text-green-600' : ''
                }`}>
                  {(summary?.errorRate ?? 0).toFixed(2)}%
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <p className="text-sm font-medium">Avg Response Time</p>
              </div>
              {summaryLoading ? <Skeleton className="h-8 w-32" /> : (
                <p className="text-3xl font-bold tracking-tight" style={{ color: CHART_COLORS.blue }}>
                  {Math.round(summary?.avgDurationMs ?? 0)} ms
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <Users className="w-4 h-4" />
                <p className="text-sm font-medium">Unique Clients</p>
              </div>
              {summaryLoading ? <Skeleton className="h-8 w-32" /> : (
                <p className="text-3xl font-bold tracking-tight" style={{ color: CHART_COLORS.blue }}>
                  {summary?.uniqueClients?.toLocaleString() ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Volume over time */}
        <Card className="mb-6">
          <CardHeader className="px-5 pt-5 pb-2 flex-row items-center justify-between space-y-0 border-b border-border/50">
            <div>
              <CardTitle className="text-base">Request Volume & Errors</CardTitle>
              <CardDescription className="text-xs">Requests over time</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select value={timeseriesInterval} onValueChange={(v: any) => setTimeseriesInterval(v)}>
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue placeholder="Interval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1 Hour</SelectItem>
                  <SelectItem value="6h">6 Hours</SelectItem>
                  <SelectItem value="1d">1 Day</SelectItem>
                </SelectContent>
              </Select>
              {!timeseriesLoading && timeseries.length > 0 && (
                <CSVLink data={timeseries} filename="timeseries.csv" className="print:hidden flex items-center justify-center w-[28px] h-[28px] rounded-[6px] transition-colors hover:opacity-80" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }} aria-label="Export as CSV">
                  <Download className="w-3.5 h-3.5" />
                </CSVLink>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {timeseriesLoading ? <Skeleton className="w-full h-[300px]" /> : timeseriesQuery.isError ? (
              <div className="w-full h-[300px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <AlertCircle className="w-5 h-5 text-destructive/70" />
                <span className="text-xs">{esErrMsg(timeseriesQuery)}</span>
              </div>
            ) : timeseries.length > 0 ? (
              <ResponsiveContainer width="100%" height={300} debounce={0}>
                <AreaChart data={timeseries}>
                  <defs>
                    <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorErr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.red} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={CHART_COLORS.red} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(v) => formatDate(v, timeseriesInterval === '1d' ? 'MMM d' : 'HH:mm')} 
                    tick={{ fontSize: 12, fill: tickColor }} 
                    stroke={tickColor} 
                    tickMargin={10}
                    minTickGap={30}
                  />
                  <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} tickMargin={10} />
                  <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)', stroke: 'none' }} />
                  <Legend content={<CustomLegend />} />
                  <Area type="monotone" dataKey="requests" name="Total Requests" stroke={CHART_COLORS.blue} fillOpacity={1} fill="url(#colorReq)" strokeWidth={2} activeDot={{ r: 5, fill: CHART_COLORS.blue, stroke: '#fff' }} isAnimationActive={false} />
                  <Area type="monotone" dataKey="errors" name="Errors" stroke={CHART_COLORS.red} fillOpacity={1} fill="url(#colorErr)" strokeWidth={2} activeDot={{ r: 5, fill: CHART_COLORS.red, stroke: '#fff' }} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-[300px] flex items-center justify-center text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        {/* 2-Column Grid for Groupings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          
          {/* Top APIs */}
          <Card>
            <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between border-b border-border/50">
              <CardTitle className="text-base">Top APIs by Usage</CardTitle>
              {!byApiLoading && byApi.length > 0 && (
                <CSVLink data={byApi} filename="by-api.csv" className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] hover:opacity-80" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}>
                  <Download className="w-3.5 h-3.5" />
                </CSVLink>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {byApiLoading ? <Skeleton className="w-full h-[250px] m-5" /> : byApiQuery.isError ? (
                <div className="h-[250px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <AlertCircle className="w-5 h-5 text-destructive/70" />
                  <span className="text-xs">{esErrMsg(byApiQuery)}</span>
                </div>
              ) : (
                <Tabs defaultValue="chart" className="w-full">
                  <div className="px-5 pt-3 flex justify-end">
                    <TabsList className="h-8">
                      <TabsTrigger value="chart" className="text-xs px-3">Chart</TabsTrigger>
                      <TabsTrigger value="table" className="text-xs px-3">Table</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="chart" className="p-5 pt-0 outline-none">
                    <ResponsiveContainer width="100%" height={250} debounce={0}>
                      <BarChart data={byApi} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={gridColor} />
                        <XAxis type="number" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                        <YAxis type="category" dataKey="key" width={100} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} tickFormatter={(v) => v.length > 15 ? v.substring(0, 15) + '...' : v} />
                        <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                        <Bar dataKey="count" name="Requests" fill={CHART_COLORS.purple} radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </TabsContent>
                  <TabsContent value="table" className="m-0 outline-none">
                    <div className="overflow-auto max-h-[280px]">
                      <Table>
                        <TableHeader className="bg-muted/50 sticky top-0">
                          <TableRow>
                            <TableHead className="text-xs">API</TableHead>
                            <TableHead className="text-xs text-right">Requests</TableHead>
                            <TableHead className="text-xs text-right">Errors</TableHead>
                            <TableHead className="text-xs text-right">Avg Duration</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {byApi.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell className="font-medium text-xs">{row.key}</TableCell>
                              <TableCell className="text-right text-xs">{row.count.toLocaleString()}</TableCell>
                              <TableCell className="text-right text-xs text-red-600">{row.errorCount.toLocaleString()}</TableCell>
                              <TableCell className="text-right text-xs">{Math.round(row.avgDurationMs)}ms</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>

          {/* Response Codes */}
          <Card>
            <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between border-b border-border/50">
              <CardTitle className="text-base">Response Codes</CardTitle>
              {!byCodeLoading && byCode.length > 0 && (
                <CSVLink data={byCode} filename="by-response-code.csv" className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] hover:opacity-80" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}>
                  <Download className="w-3.5 h-3.5" />
                </CSVLink>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {byCodeLoading ? <Skeleton className="w-full h-[250px] m-5" /> : byCodeQuery.isError ? (
                <div className="h-[250px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <AlertCircle className="w-5 h-5 text-destructive/70" />
                  <span className="text-xs">{esErrMsg(byCodeQuery)}</span>
                </div>
              ) : (
                <Tabs defaultValue="chart" className="w-full">
                  <div className="px-5 pt-3 flex justify-end">
                    <TabsList className="h-8">
                      <TabsTrigger value="chart" className="text-xs px-3">Chart</TabsTrigger>
                      <TabsTrigger value="table" className="text-xs px-3">Table</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="chart" className="p-5 pt-0 outline-none">
                    <ResponsiveContainer width="100%" height={250} debounce={0}>
                      <PieChart>
                        <Pie
                          data={responseCodeData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          stroke="none"
                          isAnimationActive={false}
                        >
                          {responseCodeData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
                        <Legend content={<CustomLegend />} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ paddingLeft: "20px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </TabsContent>
                  <TabsContent value="table" className="m-0 outline-none">
                    <div className="overflow-auto max-h-[280px]">
                      <Table>
                        <TableHeader className="bg-muted/50 sticky top-0">
                          <TableRow>
                            <TableHead className="text-xs">Status Code</TableHead>
                            <TableHead className="text-xs text-right">Count</TableHead>
                            <TableHead className="text-xs text-right">% of Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {byCode.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell className="font-medium text-xs">
                                <Badge variant="outline" style={{ borderColor: getStatusColor(row.key), color: getStatusColor(row.key) }}>{row.key}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-xs">{row.count.toLocaleString()}</TableCell>
                              <TableCell className="text-right text-xs">{((row.count / (summary?.totalRequests || 1)) * 100).toFixed(1)}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>

          {/* Top Clients */}
          <Card>
            <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between border-b border-border/50">
              <CardTitle className="text-base">Top Clients</CardTitle>
              {!byClientLoading && byClient.length > 0 && (
                <CSVLink data={byClient} filename="by-client.csv" className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] hover:opacity-80" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}>
                  <Download className="w-3.5 h-3.5" />
                </CSVLink>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {byClientLoading ? <Skeleton className="w-full h-[250px] m-5" /> : byClientQuery.isError ? (
                <div className="h-[250px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <AlertCircle className="w-5 h-5 text-destructive/70" />
                  <span className="text-xs">{esErrMsg(byClientQuery)}</span>
                </div>
              ) : (
                <Tabs defaultValue="chart" className="w-full">
                  <div className="px-5 pt-3 flex justify-end">
                    <TabsList className="h-8">
                      <TabsTrigger value="chart" className="text-xs px-3">Chart</TabsTrigger>
                      <TabsTrigger value="table" className="text-xs px-3">Table</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="chart" className="p-5 pt-0 outline-none">
                    <ResponsiveContainer width="100%" height={250} debounce={0}>
                      <BarChart data={byClient} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={gridColor} />
                        <XAxis type="number" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                        <YAxis type="category" dataKey="key" width={100} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} tickFormatter={(v) => v.length > 15 ? v.substring(0, 15) + '...' : v} />
                        <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                        <Bar dataKey="count" name="Requests" fill={CHART_COLORS.blue} radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </TabsContent>
                  <TabsContent value="table" className="m-0 outline-none">
                    <div className="overflow-auto max-h-[280px]">
                      <Table>
                        <TableHeader className="bg-muted/50 sticky top-0">
                          <TableRow>
                            <TableHead className="text-xs">Client ID</TableHead>
                            <TableHead className="text-xs text-right">Requests</TableHead>
                            <TableHead className="text-xs text-right">Success</TableHead>
                            <TableHead className="text-xs text-right">Error %</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {byClient.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell className="font-medium text-xs font-mono">{row.key}</TableCell>
                              <TableCell className="text-right text-xs">{row.count.toLocaleString()}</TableCell>
                              <TableCell className="text-right text-xs text-green-600">{row.successCount.toLocaleString()}</TableCell>
                              <TableCell className="text-right text-xs text-red-600">{row.errorRate.toFixed(1)}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>

          {/* Top Users */}
          <Card>
            <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between border-b border-border/50">
              <CardTitle className="text-base">Top Users</CardTitle>
              {!byUserLoading && byUser.length > 0 && (
                <CSVLink data={byUser} filename="by-user.csv" className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] hover:opacity-80" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}>
                  <Download className="w-3.5 h-3.5" />
                </CSVLink>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {byUserLoading ? <Skeleton className="w-full h-[250px] m-5" /> : byUserQuery.isError ? (
                <div className="h-[250px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <AlertCircle className="w-5 h-5 text-destructive/70" />
                  <span className="text-xs">{esErrMsg(byUserQuery)}</span>
                </div>
              ) : (
                <Tabs defaultValue="chart" className="w-full">
                  <div className="px-5 pt-3 flex justify-end">
                    <TabsList className="h-8">
                      <TabsTrigger value="chart" className="text-xs px-3">Chart</TabsTrigger>
                      <TabsTrigger value="table" className="text-xs px-3">Table</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="chart" className="p-5 pt-0 outline-none">
                    <ResponsiveContainer width="100%" height={250} debounce={0}>
                      <BarChart data={byUser} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={gridColor} />
                        <XAxis type="number" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                        <YAxis type="category" dataKey="key" width={100} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} tickFormatter={(v) => !v ? 'Unknown' : v.length > 15 ? v.substring(0, 15) + '...' : v} />
                        <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                        <Bar dataKey="count" name="Requests" fill={CHART_COLORS.green} radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </TabsContent>
                  <TabsContent value="table" className="m-0 outline-none">
                    <div className="overflow-auto max-h-[280px]">
                      <Table>
                        <TableHeader className="bg-muted/50 sticky top-0">
                          <TableRow>
                            <TableHead className="text-xs">User</TableHead>
                            <TableHead className="text-xs text-right">Requests</TableHead>
                            <TableHead className="text-xs text-right">Error %</TableHead>
                            <TableHead className="text-xs text-right">Avg Duration</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {byUser.map((row) => (
                            <TableRow key={row.key || 'unknown'}>
                              <TableCell className="font-medium text-xs">{row.key || 'Unknown'}</TableCell>
                              <TableCell className="text-right text-xs">{row.count.toLocaleString()}</TableCell>
                              <TableCell className="text-right text-xs text-red-600">{row.errorRate.toFixed(1)}%</TableCell>
                              <TableCell className="text-right text-xs">{Math.round(row.avgDurationMs)}ms</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
          
          {/* Top Resources (Full Width for the last card) */}
          <Card className="lg:col-span-2">
            <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between border-b border-border/50">
              <CardTitle className="text-base">Top Resources (Paths)</CardTitle>
              {!byResourceLoading && byResource.length > 0 && (
                <CSVLink data={byResource} filename="by-resource.csv" className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] hover:opacity-80" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}>
                  <Download className="w-3.5 h-3.5" />
                </CSVLink>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {byResourceLoading ? <Skeleton className="w-full h-[300px] m-5" /> : byResourceQuery.isError ? (
                <div className="h-[300px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <AlertCircle className="w-5 h-5 text-destructive/70" />
                  <span className="text-xs">{esErrMsg(byResourceQuery)}</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  <div className="p-5 pr-2">
                    <ResponsiveContainer width="100%" height={250} debounce={0}>
                      <BarChart data={byResource.slice(0, 5)} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={gridColor} />
                        <XAxis type="number" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                        <YAxis type="category" dataKey="key" width={100} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} tickFormatter={(v) => v.length > 15 ? v.substring(0, 15) + '...' : v} />
                        <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                        <Bar dataKey="count" name="Requests" fill={CHART_COLORS.pink} radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="border-l border-border/50 overflow-auto max-h-[290px]">
                    <Table>
                      <TableHeader className="bg-muted/50 sticky top-0">
                        <TableRow>
                          <TableHead className="text-xs">Resource Path</TableHead>
                          <TableHead className="text-xs text-right">Requests</TableHead>
                          <TableHead className="text-xs text-right">Errors</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {byResource.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="font-medium text-xs max-w-[200px] truncate" title={row.key}>{row.key}</TableCell>
                            <TableCell className="text-right text-xs">{row.count.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-xs text-red-600">{row.errorCount.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Raw Data Table */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-4 border-b border-border/50">
            <div className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Raw Requests</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Stored in database · {rawData?.total ? `${rawData.total.toLocaleString()} records match` : "No records yet"}
                  {syncStatus && !syncStatus.error && <span className="ml-2 text-green-600 font-medium">· {syncStatus.synced} synced from ES</span>}
                  {syncStatus?.error && <span className="ml-2 text-red-500">· Sync failed: {syncStatus.error}</span>}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-[30px] text-xs gap-1.5"
                  disabled={syncMutation.isPending}
                  onClick={() => {
                    setSyncStatus(null);
                    syncMutation.mutate(
                      { data: { clientOrgId, from: fromIso, to: toIso, size: 1000 } },
                      {
                        onSuccess: (data) => {
                          setSyncStatus({ synced: data.synced, error: data.error ?? null });
                          queryClient.invalidateQueries();
                        },
                        onError: (err) => {
                          setSyncStatus({ synced: 0, error: err.message });
                        },
                      }
                    );
                  }}
                >
                  {syncMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <DatabaseZap className="w-3.5 h-3.5" />
                  )}
                  Sync from ES
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-[30px] text-xs gap-1.5"
                  onClick={() => setFiltersExpanded(v => !v)}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filter
                  {hasActiveFilters && <span className="ml-0.5 w-2 h-2 rounded-full bg-blue-500 inline-block" />}
                </Button>
                {rawData && rawData.records.length > 0 && (
                  <CSVLink data={rawData.records} filename="raw-requests.csv" className="flex items-center justify-center w-[26px] h-[26px] rounded-[6px] hover:opacity-80" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}>
                    <Download className="w-3.5 h-3.5" />
                  </CSVLink>
                )}
              </div>
            </div>

            {/* Filter Bar */}
            {filtersExpanded && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search across API, resource, client, user..."
                      value={filterSearch}
                      onChange={(e) => { setFilterSearch(e.target.value); setPage(0); }}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={clearFilters}>
                      <X className="w-3 h-3 mr-1" /> Clear all
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="API ID"
                    value={filterApiId}
                    onChange={(e) => { setFilterApiId(e.target.value); setPage(0); }}
                    className="h-8 text-xs w-36"
                  />
                  <Input
                    placeholder="Resource path"
                    value={filterResource}
                    onChange={(e) => { setFilterResource(e.target.value); setPage(0); }}
                    className="h-8 text-xs w-40"
                  />
                  <Input
                    placeholder="Client ID"
                    value={filterClientId}
                    onChange={(e) => { setFilterClientId(e.target.value); setPage(0); }}
                    className="h-8 text-xs w-36"
                  />
                  <Input
                    placeholder="User"
                    value={filterUser}
                    onChange={(e) => { setFilterUser(e.target.value); setPage(0); }}
                    className="h-8 text-xs w-32"
                  />
                  <Select value={filterResponseCode} onValueChange={(v) => { setFilterResponseCode(v); setPage(0); }}>
                    <SelectTrigger className="h-8 text-xs w-36">
                      <SelectValue placeholder="Status code" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="2xx">2xx — Success</SelectItem>
                      <SelectItem value="3xx">3xx — Redirect</SelectItem>
                      <SelectItem value="4xx">4xx — Client Error</SelectItem>
                      <SelectItem value="5xx">5xx — Server Error</SelectItem>
                      <SelectItem value="200">200 OK</SelectItem>
                      <SelectItem value="201">201 Created</SelectItem>
                      <SelectItem value="400">400 Bad Request</SelectItem>
                      <SelectItem value="401">401 Unauthorized</SelectItem>
                      <SelectItem value="403">403 Forbidden</SelectItem>
                      <SelectItem value="404">404 Not Found</SelectItem>
                      <SelectItem value="429">429 Too Many Requests</SelectItem>
                      <SelectItem value="500">500 Internal Error</SelectItem>
                      <SelectItem value="502">502 Bad Gateway</SelectItem>
                      <SelectItem value="503">503 Unavailable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {rawLoading ? (
              <div className="p-5 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : rawQuery.isError ? (
              <div className="h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <AlertCircle className="w-5 h-5 text-destructive/70" />
                <span className="text-xs">{rawQuery.error instanceof Error ? rawQuery.error.message : "Failed to load records"}</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    {rawTable.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id} className="text-xs font-semibold whitespace-nowrap">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {rawTable.getRowModel().rows.length > 0 ? (
                      rawTable.getRowModel().rows.map((row) => (
                        <TableRow key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id} className="text-sm py-2 px-4 whitespace-nowrap">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={rawColumns.length} className="h-32 text-center text-muted-foreground">
                          <div className="flex flex-col items-center justify-center">
                            <BarChart3Icon className="w-8 h-8 mb-2 opacity-20" />
                            No records found for the selected timeframe
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
            
            {/* Pagination Controls */}
            {rawData && rawData.total > pageSize && (
              <div className="flex items-center justify-between p-4 border-t border-border/50 text-sm">
                <div className="text-muted-foreground text-xs">
                  Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, rawData.total)} of {rawData.total} records
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= rawData.total}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
