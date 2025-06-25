import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@shared/schema';

const JWT_SECRET = process.env.SESSION_SECRET || 'fallback-secret-key';
const JWT_EXPIRES = '7d';

export interface AuthRequest extends Request {
  user?: User;
}

export function generateToken(user: User): string {
  const { password, ...userWithoutPassword } = user;
  return jwt.sign(userWithoutPassword, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token: string): User | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    // Ensure the decoded token has the correct User structure
    if (decoded && typeof decoded === 'object' && decoded.id) {
      return decoded as User;
    }
    return null;
  } catch (error) {
    return null;
  }
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
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
  res.cookie('auth_token', token, {
    httpOnly: false,
    secure: false,
    sameSite: 'none', // Allow cross-site cookies
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });
}