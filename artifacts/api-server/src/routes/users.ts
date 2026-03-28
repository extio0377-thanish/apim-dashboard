import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, rolesTable, passwordPolicyTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, validatePassword } from "../lib/auth";
import { requireAdmin, requireAuth, type AuthRequest } from "../middlewares/authMiddleware";

const router = Router();

router.get("/users", requireAuth, async (_req, res) => {
  try {
    const users = await db.select({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, mobile: usersTable.mobile, roleId: usersTable.roleId, theme: usersTable.theme, active: usersTable.active, createdAt: usersTable.createdAt }).from(usersTable);
    const roles = await db.select().from(rolesTable);
    const roleMap = Object.fromEntries(roles.map((r) => [r.id, r.name]));
    res.json(users.map((u) => ({ ...u, role: u.roleId ? roleMap[u.roleId] : null })));
  } catch {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/users", requireAdmin, async (_req: AuthRequest, res) => {
  const req = _req as AuthRequest;
  const { fullName, email, mobile, password, roleId, theme, active } = req.body ?? {};
  if (!fullName || !email || !password) { res.status(400).json({ error: "fullName, email, and password are required" }); return; }
  try {
    const [policy] = await db.select().from(passwordPolicyTable).limit(1);
    if (policy) {
      const check = validatePassword(password, policy);
      if (!check.valid) { res.status(400).json({ error: "Password policy violation", details: check.errors }); return; }
    }
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) { res.status(409).json({ error: "Email already in use" }); return; }
    const passwordHash = await hashPassword(password);
    const [created] = await db.insert(usersTable).values({ fullName, email: email.toLowerCase(), mobile: mobile ?? "", passwordHash, roleId: roleId ?? null, theme: theme ?? "red", active: active ?? true }).returning({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, mobile: usersTable.mobile, roleId: usersTable.roleId, theme: usersTable.theme, active: usersTable.active });
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.put("/users/:id", requireAdmin, async (_req: AuthRequest, res) => {
  const req = _req as AuthRequest;
  const { id } = req.params;
  const { fullName, email, mobile, password, roleId, theme, active } = req.body ?? {};
  try {
    type UserUpdate = {
      fullName?: string; email?: string; mobile?: string; roleId?: string | null;
      theme?: string; active?: boolean; passwordHash?: string; updatedAt: Date;
    };
    const updates: UserUpdate = { updatedAt: new Date() };
    if (fullName) updates.fullName = fullName;
    if (email) {
      const dup = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
      if (dup.length > 0 && dup[0].id !== id) { res.status(409).json({ error: "Email already in use" }); return; }
      updates.email = email.toLowerCase();
    }
    if (mobile !== undefined) updates.mobile = mobile;
    if (roleId !== undefined) updates.roleId = roleId || null;
    if (theme) updates.theme = theme;
    if (active !== undefined) updates.active = active;
    if (password) {
      const [policy] = await db.select().from(passwordPolicyTable).limit(1);
      if (policy) {
        const check = validatePassword(password, policy);
        if (!check.valid) { res.status(400).json({ error: "Password policy violation", details: check.errors }); return; }
      }
      updates.passwordHash = await hashPassword(password);
    }
    const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, mobile: usersTable.mobile, roleId: usersTable.roleId, theme: usersTable.theme, active: usersTable.active });
    if (!updated) { res.status(404).json({ error: "User not found" }); return; }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/users/:id", requireAdmin, async (_req: AuthRequest, res) => {
  const req = _req as AuthRequest;
  const { id } = req.params;
  if (req.user?.userId === id) { res.status(400).json({ error: "Cannot delete your own account" }); return; }
  try {
    const [deleted] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning({ id: usersTable.id });
    if (!deleted) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
