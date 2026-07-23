import { QueryClient, QueryFunction } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Active tenant slug helpers
//
// The server requires an X-Tenant-Slug header (or ?tenant= query parameter)
// for any unauthenticated request that targets a specific store.  For
// authenticated requests the server can fall back to the JWT-derived tenantId,
// but sending the header anyway is harmless and defensive.
//
// Call setActiveTenantSlug() as soon as the slug is known (e.g. after fetching
// /api/tenants/current).  Both apiRequest() and getQueryFn() read it
// automatically so all call sites get the header for free.
// ---------------------------------------------------------------------------

const TENANT_SLUG_KEY = "active_tenant_slug";

export function setActiveTenantSlug(slug: string | null): void {
  try {
    if (slug) {
      localStorage.setItem(TENANT_SLUG_KEY, slug);
    } else {
      localStorage.removeItem(TENANT_SLUG_KEY);
    }
  } catch {
    // localStorage unavailable (e.g. private browsing restrictions) — ignore.
  }
}

export function getActiveTenantSlug(): string | null {
  try {
    const stored = localStorage.getItem(TENANT_SLUG_KEY);
    if (stored) return stored;
  } catch {
    // fall through to URL param fallback
  }

  // Fallback: read directly from the ?tenant= query parameter so that public
  // pages work even before the authenticated TenantSlugSync has run.
  try {
    const params = new URLSearchParams(window.location.search);
    const tenantParam = params.get("tenant");
    if (tenantParam) return tenantParam;
  } catch {
    // ignore
  }

  return null;
}

/**
 * Seed the active tenant slug from the ?tenant= query parameter as early as
 * possible (call at module scope in App.tsx).  This ensures that the very
 * first API calls made by public-facing pages always include the
 * X-Tenant-Slug header, even before the authenticated TenantSlugSync
 * component has had a chance to run.
 *
 * The value is only written to localStorage if one isn't already stored so
 * that an authenticated user's slug is never overwritten by a URL parameter.
 */
export function seedSlugFromUrl(): void {
  try {
    if (localStorage.getItem(TENANT_SLUG_KEY)) return; // already set — nothing to do
  } catch {
    // If localStorage is unavailable we still skip — getActiveTenantSlug()
    // will read the URL param on the fly instead.
    return;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const tenantParam = params.get("tenant");
    if (tenantParam) {
      localStorage.setItem(TENANT_SLUG_KEY, tenantParam);
    }
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function safeGetToken(): string | null {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

/**
 * Build the standard request headers, including:
 *  - Authorization (if a JWT is present)
 *  - X-Tenant-Slug (if a slug has been stored via setActiveTenantSlug)
 *  - Content-Type (when a body is being sent)
 */
function buildHeaders(includeContentType = false): Record<string, string> {
  const headers: Record<string, string> = {};

  const token = safeGetToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const slug = getActiveTenantSlug();
  if (slug) {
    headers["X-Tenant-Slug"] = slug;
  }

  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message: string;
    try {
      const data = JSON.parse(text);
      message = data.message || data.error || res.statusText;
    } catch {
      // Not JSON — if it's an HTML page (proxy/CDN error), use a clean status message
      if (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('<title>')) {
        message = res.statusText || `Request failed (${res.status})`;
      } else {
        message = text;
      }
    }
    throw new Error(`${res.status}: ${message}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = buildHeaders(!!data);
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers = buildHeaders();
    
    // Construct URL with query parameters
    let url = queryKey[0] as string;
    if (queryKey[1] && typeof queryKey[1] === 'object') {
      const params = new URLSearchParams();
      Object.entries(queryKey[1]).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }
    
    const res = await fetch(url, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 30000,
      retry: 1,
    },
    mutations: {
      retry: false,
    },
  },
});
