import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, passwordPolicyTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, validatePassword } from "../lib/auth";
import { requireAuth, type AuthRequest } from "../middlewares/authMiddleware";

const router = Router();

router.put("/profile", requireAuth, async (req: AuthRequest, res) => {
  const { fullName, mobile, theme } = req.body ?? {};
  type ProfileUpdate = { fullName?: string; mobile?: string; theme?: string; updatedAt: Date; };
  const updates: ProfileUpdate = { updatedAt: new Date() };
  if (fullName) updates.fullName = fullName;
  if (mobile !== undefined) updates.mobile = mobile;
  if (theme) updates.theme = theme;
  try {
    const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.userId)).returning({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, mobile: usersTable.mobile, theme: usersTable.theme });
    if (!updated) { res.status(404).json({ error: "User not found" }); return; }
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.put("/profile/password", requireAuth, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) { res.status(400).json({ error: "currentPassword and newPassword are required" }); return; }
  try {
    const [user] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "Current password is incorrect" }); return; }
    const [policy] = await db.select().from(passwordPolicyTable).limit(1);
    if (policy) {
      const check = validatePassword(newPassword, policy);
      if (!check.valid) { res.status(400).json({ error: "Password policy violation", details: check.errors }); return; }
    }
    const passwordHash = await hashPassword(newPassword);
    await db.update(usersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(usersTable.id, req.user!.userId));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
