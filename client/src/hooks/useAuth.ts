import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const token = localStorage.getItem('auth_token');
  
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: !!token,
    staleTime: 0, // Always fetch fresh data to get latest admin status
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !!token,
  };
}
