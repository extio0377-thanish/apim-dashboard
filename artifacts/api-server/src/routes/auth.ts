import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, verifyPassword } from "../lib/auth";
import { requireAuth, type AuthRequest } from "../middlewares/authMiddleware";

const router = Router();

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  try {
    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email, fullName: usersTable.fullName, passwordHash: usersTable.passwordHash, active: usersTable.active, roleId: usersTable.roleId, theme: usersTable.theme })
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (!user || !user.active) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    let roleName = "Viewer";
    if (user.roleId) {
      const [role] = await db.select({ name: rolesTable.name }).from(rolesTable).where(eq(rolesTable.id, user.roleId)).limit(1);
      if (role) roleName = role.name;
    }

    const token = signToken({ userId: user.id, email: user.email, role: roleName, roleId: user.roleId ?? "" });
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: roleName, roleId: user.roleId, theme: user.theme } });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/auth/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db
      .select({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, mobile: usersTable.mobile, roleId: usersTable.roleId, theme: usersTable.theme, active: usersTable.active })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    let roleName = req.user!.role;
    let permissions: string[] = [];
    if (user.roleId) {
      const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, user.roleId)).limit(1);
      if (role) { roleName = role.name; permissions = role.permissions; }
    }
    res.json({ ...user, role: roleName, permissions });
  } catch {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

export default router;
