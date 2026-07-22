/**
 * Tenant resolution middleware.
 *
 * Reads the authenticated user's tenantId from their DB record and attaches
 * it to req.tenantId for use by downstream route handlers.
 *
 * Usage:
 *   app.use('/api/admin', tenantMiddleware, requireAdminMiddleware, ...)
 *   // req.tenantId is now available in every handler after this point
 *
 * Also exposes requireSuperAdmin middleware for platform-level routes.
 */
import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "./auth";

declare global {
  namespace Express {
    interface Request {
      tenantId?: number;
      isSuperAdmin?: boolean;
    }
  }
}

/**
 * Resolves the tenant for the current request.
 *
 * Resolution order:
 *  1. Authenticated user's tenantId (from JWT → DB user record)
 *  2. X-Tenant-Slug request header (for public/unauthenticated routes)
 *  3. ?tenant= query parameter
 *  4. Default to tenant 1 (single-tenant / development fallback)
 *
 * Attaches req.tenantId (number) for all downstream handlers.
 * Does NOT block unauthenticated requests — that's auth middleware's job.
 */
export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { storage } = await import("./storage");

    // 1. Try authenticated user
    const token =
      (req as any).cookies?.auth_token ||
      req.headers.authorization?.replace("Bearer ", "");

    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        const user = await storage.getUser(decoded.id);
        if (user) {
          req.isSuperAdmin = user.isSuperAdmin ?? false;
          if (user.tenantId) {
            // Happy path: authenticated user with a tenant
            req.tenantId = user.tenantId;
            return next();
          }
          // Authenticated but no tenant assigned — try slug; if no slug, reject (fail-closed).
          // Super-admins are exempt because they need platform-wide access.
          const slugHeader = req.headers["x-tenant-slug"] as string | undefined;
          const slugQuery = req.query["tenant"] as string | undefined;
          const slug = slugHeader || slugQuery;
          if (slug) {
            const tenant = await storage.getTenantBySlug(slug);
            if (tenant) {
              req.tenantId = tenant.id;
              return next();
            }
          }
          // Authenticated user with no tenant and no slug:
          // Super-admins proceed (they have platform-wide access).
          // Regular users get 403 — fail closed prevents leaking cross-tenant data.
          if (user.isSuperAdmin) {
            return next();
          }
          res.status(403).json({ message: "Tenant not configured for this account. Contact support." });
          return;
        }
      }
    }

    // 2. Unauthenticated request: try X-Tenant-Slug header or ?tenant= query param
    const slugHeader = req.headers["x-tenant-slug"] as string | undefined;
    const slugQuery = req.query["tenant"] as string | undefined;
    const slug = slugHeader || slugQuery;

    if (slug) {
      const tenant = await storage.getTenantBySlug(slug);
      if (tenant) {
        req.tenantId = tenant.id;
        return next();
      }
    }

    // 3. Public unauthenticated request with no slug — default to tenant 1
    //    (single-tenant / development fallback for public endpoints like store-hours,
    //    booking availability, hiring-open, etc.)
    req.tenantId = 1;
    next();
  } catch {
    // Tenant resolution error — reject the request instead of proceeding with undefined
    // tenant context, which would silently degrade into cross-tenant/global data access.
    res.status(503).json({ message: "Tenant resolution failed. Please try again." });
    return;
  }
}

/**
 * Middleware that requires the caller to be a platform super-admin.
 * Must be used AFTER authMiddleware.
 */
export async function requireSuperAdminMiddleware(
  req: any,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token =
      req.cookies?.auth_token ||
      req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      res.status(401).json({ message: "Invalid token" });
      return;
    }

    const { storage } = await import("./storage");
    const user = await storage.getUser(decoded.id);

    if (!user) {
      res.status(401).json({ message: "Account not found" });
      return;
    }

    if (!user.isSuperAdmin) {
      res.status(403).json({ message: "Super-admin access required" });
      return;
    }

    req.user = decoded;
    req.tenantId = user.tenantId ?? undefined;
    req.isSuperAdmin = true;
    next();
  } catch (error) {
    console.error("requireSuperAdminMiddleware error:", error);
    res.status(500).json({ message: "Authentication check failed" });
  }
}
