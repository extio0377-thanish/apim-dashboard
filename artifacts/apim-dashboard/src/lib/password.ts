export interface PasswordPolicy {
  minLength: number;
  minUppercase: number;
  minLowercase: number;
  minNumbers: number;
  minSpecial: number;
}

export const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 8,
  minUppercase: 1,
  minLowercase: 1,
  minNumbers: 1,
  minSpecial: 1,
};

export interface PolicyCheck {
  valid: boolean;
  errors: string[];
  score: number;
}

export function validatePassword(password: string, policy: PasswordPolicy = DEFAULT_POLICY): PolicyCheck {
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

  const total = 5;
  const passed = total - errors.length;
  const score = Math.round((passed / total) * 100);
  return { valid: errors.length === 0, errors, score };
}

export function getStrengthLabel(score: number): { label: string; color: string } {
  if (score >= 100) return { label: "Strong", color: "#16a34a" };
  if (score >= 60)  return { label: "Moderate", color: "#d97706" };
  return { label: "Weak", color: "#dc2626" };
}
