import { db } from "@workspace/db";
import { rolesTable, usersTable, passwordPolicyTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "./auth";
import { logger } from "./logger";

const DEFAULT_ROLES = [
  {
    name: "Admin",
    permissions: ["manage_users", "manage_roles", "manage_policy", "view_metrics", "sync_metrics"],
  },
  {
    name: "Operator",
    permissions: ["view_metrics", "sync_metrics"],
  },
  {
    name: "Viewer",
    permissions: ["view_metrics"],
  },
];

export async function seedDatabase(): Promise<void> {
  try {
    for (const role of DEFAULT_ROLES) {
      const existing = await db.select().from(rolesTable).where(eq(rolesTable.name, role.name)).limit(1);
      if (existing.length === 0) {
        await db.insert(rolesTable).values(role);
        logger.info(`Seeded role: ${role.name}`);
      }
    }

    const [adminRole] = await db.select().from(rolesTable).where(eq(rolesTable.name, "Admin")).limit(1);
    if (!adminRole) return;

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, "admin@apim.local")).limit(1);
    if (existing.length === 0) {
      const passwordHash = await hashPassword("Admin@1234");
      await db.insert(usersTable).values({
        fullName: "System Administrator",
        email: "admin@apim.local",
        mobile: "",
        passwordHash,
        roleId: adminRole.id,
        theme: "red",
        active: true,
      });
      logger.info("Seeded default admin user: admin@apim.local / Admin@1234");
    }

    const policy = await db.select().from(passwordPolicyTable).limit(1);
    if (policy.length === 0) {
      await db.insert(passwordPolicyTable).values({
        id: 1,
        minLength: 8,
        minUppercase: 1,
        minLowercase: 1,
        minNumbers: 1,
        minSpecial: 1,
      });
      logger.info("Seeded default password policy");
    }
  } catch (err) {
    logger.warn({ err }, "Seed failed (tables may not exist yet)");
  }
}
