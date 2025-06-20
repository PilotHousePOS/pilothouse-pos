import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";

export function useAuth() {
  const [demoUser, setDemoUser] = useState(null);

  // Check for demo user in localStorage
  useEffect(() => {
    const stored = localStorage.getItem('demoUser');
    if (stored) {
      setDemoUser(JSON.parse(stored));
    }
  }, []);

  const { data: serverUser, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Use demo user if available, otherwise server user
  const user = demoUser || serverUser;

  return {
    user,
    isLoading: isLoading && !demoUser,
    isAuthenticated: !!user,
  };
}
