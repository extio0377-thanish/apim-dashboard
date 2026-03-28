import { Router } from "express";
import { db } from "@workspace/db";
import { passwordPolicyTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/authMiddleware";

const router = Router();

router.get("/password-policy", requireAuth, async (_req, res) => {
  try {
    const [policy] = await db.select().from(passwordPolicyTable).limit(1);
    if (!policy) { res.status(404).json({ error: "Policy not found" }); return; }
    res.json(policy);
  } catch {
    res.status(500).json({ error: "Failed to fetch policy" });
  }
});

router.put("/password-policy", requireAdmin, async (req, res) => {
  const { minLength, minUppercase, minLowercase, minNumbers, minSpecial } = req.body ?? {};
  type PolicyUpdate = { minLength?: number; minUppercase?: number; minLowercase?: number; minNumbers?: number; minSpecial?: number; updatedAt: Date; };
  const updates: PolicyUpdate = { updatedAt: new Date() };
  if (minLength !== undefined) updates.minLength = Number(minLength);
  if (minUppercase !== undefined) updates.minUppercase = Number(minUppercase);
  if (minLowercase !== undefined) updates.minLowercase = Number(minLowercase);
  if (minNumbers !== undefined) updates.minNumbers = Number(minNumbers);
  if (minSpecial !== undefined) updates.minSpecial = Number(minSpecial);
  try {
    const existing = await db.select({ id: passwordPolicyTable.id }).from(passwordPolicyTable).limit(1);
    if (existing.length === 0) {
      const [created] = await db.insert(passwordPolicyTable).values({ id: 1, minLength: updates.minLength ?? 8, minUppercase: updates.minUppercase ?? 1, minLowercase: updates.minLowercase ?? 1, minNumbers: updates.minNumbers ?? 1, minSpecial: updates.minSpecial ?? 1 }).returning();
      res.json(created);
    } else {
      const [updated] = await db.update(passwordPolicyTable).set(updates).where(eq(passwordPolicyTable.id, 1)).returning();
      res.json(updated);
    }
  } catch {
    res.status(500).json({ error: "Failed to update policy" });
  }
});

export default router;
