import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  const { data: user, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    // Poll every 30 s while the user is authenticated but has no tenant assigned
    // so the screen clears automatically once a super-admin links them to a store.
    refetchInterval: (data: any) => {
      const u = data as any;
      return (u && !u.tenantId && !u.isSuperAdmin) ? 30 * 1000 : false;
    },
  });

  return {
    user,
    isLoading,
    isFetching,
    refetch,
    isAuthenticated: !!user,
  };
}
