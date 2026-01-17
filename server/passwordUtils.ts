import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

// Password requirements effective date: January 23, 2026
const PASSWORD_REQUIREMENTS_EFFECTIVE_DATE = new Date('2026-01-23T00:00:00');

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
  // Handle legacy plain text passwords (temporary for migration)
  if (!hashedPassword.startsWith('$2')) {
    // This is a plain text password, compare directly but log warning
    console.warn('Legacy plain text password detected - user should reset password');
    return plainPassword === hashedPassword;
  }
  return bcrypt.compare(plainPassword, hashedPassword);
}

export function isPasswordComplexEnough(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const now = new Date();
  
  // Basic length requirement (always enforced)
  if (password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }
  
  // New complexity requirements (effective January 23, 2026)
  if (now >= PASSWORD_REQUIREMENTS_EFFECTIVE_DATE) {
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one capital letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export function getPasswordRequirementsMessage(): string {
  const now = new Date();
  
  if (now >= PASSWORD_REQUIREMENTS_EFFECTIVE_DATE) {
    return 'Password must be at least 6 characters and contain at least one capital letter and one number';
  }
  return 'Password must be at least 6 characters';
}

export function areNewRequirementsActive(): boolean {
  return new Date() >= PASSWORD_REQUIREMENTS_EFFECTIVE_DATE;
}
