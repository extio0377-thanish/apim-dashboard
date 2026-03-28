import { pgTable, text, boolean, timestamp, integer, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const rolesTable = pgTable("roles", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  permissions: text("permissions").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const usersTable = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  mobile: text("mobile"),
  passwordHash: text("password_hash").notNull(),
  roleId: varchar("role_id", { length: 36 }).references(() => rolesTable.id),
  theme: text("theme").notNull().default("red"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const passwordPolicyTable = pgTable("password_policy", {
  id: integer("id").primaryKey().default(1),
  minLength: integer("min_length").notNull().default(8),
  minUppercase: integer("min_uppercase").notNull().default(1),
  minLowercase: integer("min_lowercase").notNull().default(1),
  minNumbers: integer("min_numbers").notNull().default(1),
  minSpecial: integer("min_special").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, passwordHash: true, createdAt: true, updatedAt: true });
export const selectUserSchema = createSelectSchema(usersTable).omit({ passwordHash: true });
export const insertRoleSchema = createInsertSchema(rolesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectRoleSchema = createSelectSchema(rolesTable);
export const insertPolicySchema = createInsertSchema(passwordPolicyTable).omit({ id: true, updatedAt: true });
export const selectPolicySchema = createSelectSchema(passwordPolicyTable);

export type User = z.infer<typeof selectUserSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Role = z.infer<typeof selectRoleSchema>;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type PasswordPolicy = z.infer<typeof selectPolicySchema>;
