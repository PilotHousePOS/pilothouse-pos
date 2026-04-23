import { QueryClient, QueryFunction } from "@tanstack/react-query";

function safeGetToken(): string | null {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = safeGetToken();
  const headers: HeadersInit = data ? { "Content-Type": "application/json" } : {};
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  
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
    const token = safeGetToken();
    const headers: HeadersInit = {};
    
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
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
