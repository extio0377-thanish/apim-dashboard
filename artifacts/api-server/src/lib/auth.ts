import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET || "fallback-dev-secret-change-in-production";
const JWT_EXPIRES_IN = "8h";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  roleId: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export interface PasswordPolicy {
  minLength: number;
  minUppercase: number;
  minLowercase: number;
  minNumbers: number;
  minSpecial: number;
}

export function validatePassword(password: string, policy: PasswordPolicy): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < policy.minLength) errors.push(`At least ${policy.minLength} characters`);
  if ((password.match(/[A-Z]/g) || []).length < policy.minUppercase)
    errors.push(`At least ${policy.minUppercase} uppercase letter(s)`);
  if ((password.match(/[a-z]/g) || []).length < policy.minLowercase)
    errors.push(`At least ${policy.minLowercase} lowercase letter(s)`);
  if ((password.match(/[0-9]/g) || []).length < policy.minNumbers)
    errors.push(`At least ${policy.minNumbers} number(s)`);
  if ((password.match(/[^A-Za-z0-9]/g) || []).length < policy.minSpecial)
    errors.push(`At least ${policy.minSpecial} special character(s)`);
  return { valid: errors.length === 0, errors };
}
