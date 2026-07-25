import { useQuery } from "@tanstack/react-query";

type PlanTier = "starter" | "pro" | "enterprise";

interface TenantPlanInfo {
  subscriptionTier?: string;
  subscriptionStatus?: string;
}

export function usePlan() {
  const { data: tenantInfo } = useQuery<TenantPlanInfo>({
    queryKey: ["/api/tenants/current"],
  });

  const tier = (tenantInfo?.subscriptionTier ?? "starter") as PlanTier;
  const status = tenantInfo?.subscriptionStatus ?? "trial";

  return {
    tier,
    /** True if on Pro or Enterprise */
    isPro: tier === "pro" || tier === "enterprise",
    /** True if on Starter (the base paid plan) */
    isStarter: tier === "starter",
    /** True if subscription is active or in trial */
    isActive: status === "active" || status === "trial",
    status,
  };
}
