import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const token = localStorage.getItem('auth_token');
  
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user", Date.now()], // Force fresh data with timestamp
    retry: false,
    enabled: !!token,
    staleTime: 0, // Always fetch fresh data to get latest admin status
    gcTime: 0, // Don't cache at all to prevent mobile caching issues (replaces cacheTime in v5)
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !!token,
  };
}
