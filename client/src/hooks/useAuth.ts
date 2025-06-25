import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const hasToken = !!localStorage.getItem('auth_token');
  
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: false, // Disable automatic queries for now
  });

  return {
    user,
    isLoading: false,
    isAuthenticated: hasToken,
  };
}
