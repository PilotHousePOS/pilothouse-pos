import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const hasToken = !!localStorage.getItem('auth_token');
  
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: hasToken, // Only query if token exists
  });

  return {
    user,
    isLoading: hasToken ? isLoading : false,
    isAuthenticated: hasToken && !!user && !error,
  };
}
