import { pgTable, bigserial, text, integer, bigint, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const apiRequestsTable = pgTable("api_requests", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  requestId: text("request_id"),
  clientOrgId: text("client_org_id").notNull(),
  apiId: text("api_id"),
  clientId: text("client_id"),
  user: text("user"),
  resourcePath: text("resource_path"),
  method: text("method"),
  responseCode: integer("response_code"),
  requestDurationMs: integer("request_duration_ms"),
  bytesUploaded: bigint("bytes_uploaded", { mode: "number" }),
  bytesDownloaded: bigint("bytes_downloaded", { mode: "number" }),
  requestTs: timestamp("request_ts", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertApiRequestSchema = createInsertSchema(apiRequestsTable).omit({ id: true, syncedAt: true });
export const selectApiRequestSchema = createSelectSchema(apiRequestsTable);

export type InsertApiRequest = z.infer<typeof insertApiRequestSchema>;
export type ApiRequest = typeof apiRequestsTable.$inferSelect;
