import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const token = localStorage.getItem('token');
  
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: !!token,
    staleTime: 0, // Always fetch fresh data to get latest admin status
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !!token,
  };
}
