import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@shared/schema';

const JWT_SECRET = process.env.SESSION_SECRET || 'fallback-secret-key';
const JWT_EXPIRES = '7d';

// JWT User type - matches what's stored in the token
export interface JWTUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  isAdmin: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface AuthRequest extends Request {
  user?: JWTUser;
}

export function generateToken(user: User): string {
  const { password, ...userWithoutPassword } = user;
  return jwt.sign(userWithoutPassword, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token: string): JWTUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    // Ensure the decoded token has the correct User structure
    if (decoded && typeof decoded === 'object' && decoded.id) {
      return decoded as JWTUser;
    }
    return null;
  } catch (error) {
    return null;
  }
}

export function authMiddleware(req: any, res: Response, next: NextFunction) {
  console.log('Auth check - cookies:', req.cookies);
  console.log('Auth check - authorization header:', req.headers.authorization);
  
  const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '');
  
  console.log('Auth check - token found:', !!token);
  
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = verifyToken(token);
  console.log('Auth check - user verified:', !!user);
  
  if (!user) {
    return res.status(401).json({ message: 'Invalid token' });
  }

  req.user = user;
  next();
}

export function setAuthCookie(res: Response, token: string) {
  console.log('Setting auth cookie with token length:', token.length);
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.cookie('auth_token', token, {
    httpOnly: false,
    secure: isProduction, // true in production (HTTPS), false in development
    sameSite: isProduction ? 'none' : 'lax', // 'none' requires secure=true
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });
}