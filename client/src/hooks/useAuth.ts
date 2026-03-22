import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: true,
    staleTime: 0, // Always fetch fresh data to get latest admin status
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });



  return {
    user,
    isLoading,
    // User is authenticated if we have user data (either from localStorage token or cookies)
    isAuthenticated: !!user,
  };
}
