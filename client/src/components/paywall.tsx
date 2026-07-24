// Paywall screen shown to past_due and cancelled tenants
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertTriangle, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface PaywallProps {
  status: "past_due" | "cancelled";
}

export default function Paywall({ status }: PaywallProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isOwner = (user as any)?.isAdmin;

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/billing/portal-session", {
        returnUrl: window.location.href,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to open billing portal");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to open billing portal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isPastDue = status === "past_due";

  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full text-center space-y-6 bg-white rounded-2xl shadow-sm border p-8">
        <div className="flex justify-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            isPastDue ? "bg-yellow-100" : "bg-red-100"
          }`}>
            <AlertTriangle className={`w-8 h-8 ${isPastDue ? "text-yellow-600" : "text-red-600"}`} />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isPastDue ? "Payment Required" : "Subscription Cancelled"}
          </h1>
          <p className="text-gray-600 text-sm">
            {isPastDue
              ? "Your last payment failed and access to PilotHouse has been temporarily suspended. Please update your payment method to restore access."
              : "Your PilotHouse subscription has been cancelled. Reactivate your subscription to regain access to the POS, inventory, and all features."}
          </p>
        </div>

        {isOwner ? (
          <div className="space-y-3">
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              size="lg"
              onClick={() => setLocation("/settings/billing")}
            >
              <CreditCard className="w-4 h-4 mr-2" />
              {isPastDue ? "Update Payment Method" : "Reactivate Subscription"}
            </Button>

            {isPastDue && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
              >
                {portalMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Open Billing Portal
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <p>Please contact your account owner to resolve the billing issue.</p>
          </div>
        )}
      </div>
    </div>
  );
}
