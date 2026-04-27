import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@shared/schema';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required but not set. The application cannot start without a secure signing secret.');
}

const JWT_SECRET = process.env.SESSION_SECRET;
const JWT_EXPIRES = '7d';

// JWT User type - matches what's stored in the token
export interface JWTUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  isAdmin: boolean | null;
  isGroomer: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  tokenVersion: number;
}

export interface AuthRequest extends Request {
  user?: JWTUser;
}

type SafeUserPayload = Omit<User, 'password' | 'stripeCustomerId' | 'stripeDefaultPaymentMethod'>;

export function generateToken(user: User): string {
  const { password: _pw, stripeCustomerId: _sc, stripeDefaultPaymentMethod: _sdpm, ...safePayload } = user;
  const payload: SafeUserPayload = safePayload;
  return jwt.sign(payload as Record<string, unknown>, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token: string): JWTUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && typeof decoded === 'object' && 'id' in decoded && typeof (decoded as Record<string, unknown>).id === 'string') {
      return decoded as JWTUser;
    }
    return null;
  } catch {
    return null;
  }
}

export async function authMiddleware(req: any, res: Response, next: NextFunction) {
  const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ message: 'Invalid token' });
  }

  try {
    const { storage } = await import('./storage');
    const dbUser = await storage.getUser(decoded.id);

    if (!dbUser) {
      return res.status(401).json({ message: 'Account not found' });
    }

    const dbTokenVersion: number = dbUser.tokenVersion ?? 0;
    const tokenVersion: number = decoded.tokenVersion ?? 0;
    if (tokenVersion !== dbTokenVersion) {
      return res.status(401).json({ message: 'Session has been invalidated. Please log in again.' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('authMiddleware DB check error:', error);
    return res.status(500).json({ message: 'Authentication check failed' });
  }
}

export function setAuthCookie(res: Response, token: string) {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}
