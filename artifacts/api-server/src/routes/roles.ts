import { Router } from "express";
import { db } from "@workspace/db";
import { rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/authMiddleware";

const router = Router();

export const ALL_PERMISSIONS = [
  { key: "manage_users", label: "Manage Users" },
  { key: "manage_roles", label: "Manage Roles" },
  { key: "manage_policy", label: "Manage Password Policy" },
  { key: "view_metrics", label: "View Metrics" },
  { key: "sync_metrics", label: "Sync Metrics from ES" },
];

router.get("/roles", requireAdmin, async (_req, res) => {
  try {
    const roles = await db.select().from(rolesTable);
    res.json(roles);
  } catch {
    res.status(500).json({ error: "Failed to fetch roles" });
  }
});

router.get("/roles/permissions", requireAdmin, (_req, res) => {
  res.json(ALL_PERMISSIONS);
});

router.post("/roles", requireAdmin, async (req, res) => {
  const { name, permissions } = req.body ?? {};
  if (!name) { res.status(400).json({ error: "Role name is required" }); return; }
  try {
    const [created] = await db.insert(rolesTable).values({ name, permissions: permissions ?? [] }).returning();
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: "Failed to create role" });
  }
});

router.put("/roles/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, permissions } = req.body ?? {};
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (permissions) updates.permissions = permissions;
    const [updated] = await db.update(rolesTable).set(updates as Parameters<typeof db.update>[0]).where(eq(rolesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Role not found" }); return; }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update role" });
  }
});

router.delete("/roles/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [deleted] = await db.delete(rolesTable).where(eq(rolesTable.id, id)).returning({ id: rolesTable.id });
    if (!deleted) { res.status(404).json({ error: "Role not found" }); return; }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete role" });
  }
});

export default router;
