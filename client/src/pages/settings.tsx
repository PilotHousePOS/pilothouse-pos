import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { ArrowLeft, Mail, Save, User as UserIcon, Lock, Phone, CreditCard, Trash2, Star, Plus, Loader2, Receipt, ChevronRight, Link as LinkIcon, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { z } from "zod";
import { safeGoBack } from "@/lib/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

// Module-level singleton — Stripe docs require loadStripe to be called outside
// of component renders so the same instance is reused across mounts/remounts.
let _stripePromise: ReturnType<typeof loadStripe> | null = null;
function getStripePromise(publishableKey: string) {
  if (!_stripePromise) {
    _stripePromise = loadStripe(publishableKey);
  }
  return _stripePromise;
}

const updateNameSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

const updatePhoneSchema = z.object({
  phoneNumber: z.string().min(10, "Phone number must be at least 10 digits").regex(/^[\d\s\-\(\),]+$/, "Please enter valid phone number(s)"),
});

const updateEmailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

function AddCardForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [cardReady, setCardReady] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);

    try {
      const setupResponse = await apiRequest("POST", "/api/stripe/setup-intent", {});
      if (!setupResponse.ok) {
        throw new Error("Failed to create setup intent");
      }
      const { clientSecret } = await setupResponse.json();

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error("Card element not found");
      }

      const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to save card");
      }

      if (setupIntent?.status === "succeeded" && setAsDefault && setupIntent.payment_method) {
        await apiRequest("POST", "/api/stripe/default-payment-method", {
          paymentMethodId: setupIntent.payment_method,
        });
      }

      toast({
        title: "Card saved",
        description: "Your payment method has been saved successfully.",
      });
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Failed to save card",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 border rounded-md bg-white min-h-[42px] relative">
        {!cardReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          </div>
        )}
        <CardElement
          onReady={() => setCardReady(true)}
          options={{
            style: {
              base: {
                fontSize: "16px",
                color: "#424770",
                "::placeholder": {
                  color: "#aab7c4",
                },
              },
              invalid: {
                color: "#9e2146",
              },
            },
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="set-default"
          checked={setAsDefault}
          onChange={(e) => setSetAsDefault(e.target.checked)}
          className="rounded border-gray-300"
        />
        <Label htmlFor="set-default" className="text-sm">Set as default payment method</Label>
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1 bg-brand-blue hover:bg-blue-600"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Card"
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const hasToken = !!localStorage.getItem('token');
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailPendingToken, setEmailPendingToken] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phonePassword, setPhonePassword] = useState("");
  const [phonePendingToken, setPhonePendingToken] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showAddCard, setShowAddCard] = useState(false);

  // Store URL (slug) state
  const [newSlug, setNewSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<null | { available: boolean; suggestions: string[] }>(null);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Business name state
  const [newBusinessName, setNewBusinessName] = useState("");

  const { data: currentUser, isLoading: userLoading, error: userError } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    enabled: hasToken,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: stripeConfig } = useQuery<{ configured: boolean; publishableKey?: string }>({
    queryKey: ["/api/stripe/config"],
    enabled: hasToken,
  });

  const { data: currentTenant } = useQuery<{ id: number; name: string; slug: string }>({
    queryKey: ["/api/tenants/current"],
    enabled: hasToken,
    staleTime: 5 * 60 * 1000,
  });

  const updateSlugMutation = useMutation({
    mutationFn: async (slug: string) => {
      const response = await apiRequest("PATCH", "/api/tenants/current", { slug });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to update store URL");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants/current"] });
      setNewSlug("");
      setSlugStatus(null);
      toast({
        title: "Store URL updated",
        description: `Your store URL is now: ${data.slug}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update store URL. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateBusinessNameMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("PATCH", "/api/tenants/current", { name });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to update business name");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants/current"] });
      setNewBusinessName("");
      toast({
        title: "Business name updated",
        description: `Your business name is now: ${data.name}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update business name. Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: paymentMethodsData, isLoading: paymentMethodsLoading } = useQuery<{
    paymentMethods: PaymentMethod[];
    defaultPaymentMethod: string | null;
  }>({
    queryKey: ["/api/stripe/payment-methods"],
    enabled: hasToken && !!stripeConfig?.configured,
  });


  const deletePaymentMethodMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const response = await apiRequest("DELETE", `/api/stripe/payment-methods/${paymentMethodId}`, {});
      if (!response.ok) throw new Error("Failed to delete payment method");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stripe/payment-methods"] });
      toast({
        title: "Card removed",
        description: "Your payment method has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove card",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const setDefaultPaymentMethodMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const response = await apiRequest("POST", "/api/stripe/default-payment-method", {
        paymentMethodId,
      });
      if (!response.ok) throw new Error("Failed to set default payment method");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stripe/payment-methods"] });
      toast({
        title: "Default card updated",
        description: "Your default payment method has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update default",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (userError && !userLoading) {
      console.error("Settings page authentication error:", userError);
      toast({
        title: "Session expired",
        description: "Please sign in again.",
        variant: "destructive",
      });
      localStorage.removeItem('token');
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    }
  }, [userError, userLoading, toast]);

  const updateNameMutation = useMutation({
    mutationFn: async (names: { firstName: string; lastName: string }) => {
      const result = updateNameSchema.safeParse(names);
      if (!result.success) {
        throw new Error(result.error.errors[0].message);
      }
      
      const response = await apiRequest("PATCH", "/api/auth/update-name", names);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to update name: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Name updated",
        description: "Your name has been successfully updated.",
      });
      setFirstName("");
      setLastName("");
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update name. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateEmailMutation = useMutation({
    mutationFn: async ({ newEmail, password }: { newEmail: string; password: string }) => {
      const result = updateEmailSchema.safeParse({ email: newEmail });
      if (!result.success) {
        throw new Error(result.error.errors[0].message);
      }
      
      const response = await apiRequest("PATCH", "/api/auth/update-email", { email: newEmail, currentPassword: password });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to update email: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      if (data.pendingToken) {
        setEmailPendingToken(data.pendingToken);
        setEmailOtp("");
        toast({
          title: "Check your new email",
          description: data.message || "A verification code has been sent to your new email address.",
        });
      } else {
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        toast({
          title: "Email updated",
          description: "Your email address has been successfully updated.",
        });
        setEmail("");
        setEmailPassword("");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update email. Please try again.",
        variant: "destructive",
      });
    },
  });

  const confirmEmailMutation = useMutation({
    mutationFn: async ({ pendingToken, otp }: { pendingToken: string; otp: string }) => {
      const response = await apiRequest("POST", "/api/auth/confirm-email-change", { pendingToken, otp });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to confirm email change: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Email updated",
        description: "Your email address has been successfully updated.",
      });
      setEmail("");
      setEmailPassword("");
      setEmailPendingToken("");
      setEmailOtp("");
    },
    onError: (error: Error) => {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid verification code. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async (passwords: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
      const result = updatePasswordSchema.safeParse(passwords);
      if (!result.success) {
        throw new Error(result.error.errors[0].message);
      }
      
      const response = await apiRequest("PATCH", "/api/auth/update-password", {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to update password: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Password updated",
        description: "Your password has been successfully updated.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update password. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updatePhoneMutation = useMutation({
    mutationFn: async ({ newPhone, password }: { newPhone: string; password: string }) => {
      const result = updatePhoneSchema.safeParse({ phoneNumber: newPhone });
      if (!result.success) {
        throw new Error(result.error.errors[0].message);
      }
      
      const response = await apiRequest("PATCH", "/api/auth/update-phone", { phoneNumber: newPhone, currentPassword: password });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to update phone: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      if (data.pendingToken) {
        setPhonePendingToken(data.pendingToken);
        setPhoneOtp("");
        toast({
          title: "Check your email",
          description: data.message || "A verification code has been sent to your email address.",
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        toast({
          title: "Phone updated",
          description: "Your phone number has been successfully updated.",
        });
        setPhoneNumber("");
        setPhonePassword("");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update phone number. Please try again.",
        variant: "destructive",
      });
    },
  });

  const confirmPhoneMutation = useMutation({
    mutationFn: async ({ pendingToken, otp }: { pendingToken: string; otp: string }) => {
      const response = await apiRequest("POST", "/api/auth/confirm-phone-change", { pendingToken, otp });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to confirm phone change: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Phone updated",
        description: "Your phone number has been successfully updated.",
      });
      setPhoneNumber("");
      setPhonePassword("");
      setPhonePendingToken("");
      setPhoneOtp("");
    },
    onError: (error: Error) => {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid verification code. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (!hasToken) {
    setLocation("/");
    return null;
  }

  if (userLoading || !currentUser) {
    return (
      <div className="px-6 py-4 pb-20">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const handleUpdateName = () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: "All fields required",
        description: "Please enter both first and last name.",
        variant: "destructive",
      });
      return;
    }

    if (firstName === currentUser.firstName && lastName === currentUser.lastName) {
      toast({
        title: "No change",
        description: "The new name is the same as your current name.",
        variant: "destructive",
      });
      return;
    }

    updateNameMutation.mutate({ firstName, lastName });
  };

  const handleUpdateEmail = () => {
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter a new email address.",
        variant: "destructive",
      });
      return;
    }

    if (!emailPassword.trim()) {
      toast({
        title: "Password required",
        description: "Please enter your current password to change your email.",
        variant: "destructive",
      });
      return;
    }

    if (email === currentUser.email) {
      toast({
        title: "No change",
        description: "The new email is the same as your current email.",
        variant: "destructive",
      });
      return;
    }

    updateEmailMutation.mutate({ newEmail: email, password: emailPassword });
  };

  const handleUpdatePassword = () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      toast({
        title: "All fields required",
        description: "Please fill in all password fields.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "New password and confirm password must match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    updatePasswordMutation.mutate({ currentPassword, newPassword, confirmPassword });
  };

  const handleSlugChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setNewSlug(sanitized);
    setSlugStatus(null);

    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);

    if (!sanitized || sanitized === currentTenant?.slug) {
      setIsCheckingSlug(false);
      return;
    }

    setIsCheckingSlug(true);
    slugDebounceRef.current = setTimeout(async () => {
      try {
        const response = await apiRequest("GET", `/api/tenants/slug-check?slug=${encodeURIComponent(sanitized)}`);
        if (response.ok) {
          const data = await response.json();
          setSlugStatus({ available: data.available, suggestions: data.suggestions || [] });
        }
      } catch {
        // silently ignore check failures
      } finally {
        setIsCheckingSlug(false);
      }
    }, 400);
  };

  const handleUpdateSlug = () => {
    if (!newSlug.trim() || newSlug === currentTenant?.slug) return;
    if (slugStatus && !slugStatus.available) return;
    updateSlugMutation.mutate(newSlug);
  };

  const handleUpdatePhone = () => {
    if (!phoneNumber.trim()) {
      toast({
        title: "Phone number required",
        description: "Please enter a phone number.",
        variant: "destructive",
      });
      return;
    }

    if (!phonePassword.trim()) {
      toast({
        title: "Password required",
        description: "Please enter your current password to change your phone number.",
        variant: "destructive",
      });
      return;
    }

    // Remove non-digit characters for validation
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    if (digitsOnly.length < 10) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number with at least 10 digits.",
        variant: "destructive",
      });
      return;
    }

    updatePhoneMutation.mutate({ newPhone: phoneNumber, password: phonePassword });
  };

  return (
    <div className="pb-20">
      {/* Fixed Back Button */}
      <div className="fixed top-4 left-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={safeGoBack}
          className="bg-white shadow-lg hover:bg-gray-100 rounded-full"
          data-testid="button-back"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
      </div>

      {/* Header */}
      <div className="px-6 pt-16 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account settings</p>
      </div>

      <div className="px-6">{/* Content continues */}

        {/* Current User Info */}
        <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserIcon className="w-5 h-5" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-sm text-gray-500">Name</Label>
            <p className="text-gray-900 font-medium" data-testid="text-current-name">
              {currentUser.firstName && currentUser.lastName
                ? `${currentUser.firstName} ${currentUser.lastName}`
                : "Not set"}
            </p>
          </div>
          <div>
            <Label className="text-sm text-gray-500">Current Email</Label>
            <p className="text-gray-900 font-medium" data-testid="text-current-email">{currentUser.email}</p>
          </div>
          <div>
            <Label className="text-sm text-gray-500">Phone Number</Label>
            <p className="text-gray-900 font-medium" data-testid="text-current-phone">
              {currentUser.phoneNumber || "Not set"}
            </p>
          </div>
          {currentUser.isAdmin && (
            <div>
              <Label className="text-sm text-gray-500">Account Type</Label>
              <p className="text-brand-blue font-semibold" data-testid="text-admin-status">Administrator</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Methods */}
      {stripeConfig?.configured && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="w-5 h-5" />
              Payment Methods
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              Save a card for faster checkout. Your saved card will be automatically charged when orders are approved.
            </p>
            
            {paymentMethodsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : paymentMethodsData?.paymentMethods && paymentMethodsData.paymentMethods.length > 0 ? (
              <div className="space-y-3">
                {paymentMethodsData.paymentMethods.map((pm) => (
                  <div
                    key={pm.id}
                    className={`flex items-center justify-between p-3 border rounded-lg ${
                      pm.id === paymentMethodsData.defaultPaymentMethod
                        ? "border-brand-blue bg-blue-50"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-6 h-6 text-gray-600" />
                      <div>
                        <p className="font-medium capitalize">
                          {pm.brand} ending in {pm.last4}
                        </p>
                        <p className="text-sm text-gray-500">
                          Expires {pm.expMonth}/{pm.expYear}
                        </p>
                      </div>
                      {pm.id === paymentMethodsData.defaultPaymentMethod && (
                        <span className="text-xs bg-brand-blue text-white px-2 py-1 rounded-full flex items-center gap-1">
                          <Star className="w-3 h-3" /> Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {pm.id !== paymentMethodsData.defaultPaymentMethod && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefaultPaymentMethodMutation.mutate(pm.id)}
                          disabled={setDefaultPaymentMethodMutation.isPending}
                        >
                          Set Default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deletePaymentMethodMutation.mutate(pm.id)}
                        disabled={deletePaymentMethodMutation.isPending}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm py-2">No saved payment methods</p>
            )}

            {showAddCard && stripeConfig?.publishableKey ? (
              <Elements stripe={getStripePromise(stripeConfig.publishableKey)}>
                <AddCardForm
                  onSuccess={() => {
                    setShowAddCard(false);
                    queryClient.invalidateQueries({ queryKey: ["/api/stripe/payment-methods"] });
                  }}
                  onCancel={() => setShowAddCard(false)}
                />
              </Elements>
            ) : (
              <Button
                onClick={() => setShowAddCard(true)}
                variant="outline"
                className="w-full"
                disabled={!stripeConfig?.publishableKey}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Payment Method
              </Button>
            )}
          </CardContent>
        </Card>
      )}

        {/* Update Name */}
        <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserIcon className="w-5 h-5" />
            Update Name
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="first-name">First Name</Label>
            <Input
              id="first-name"
              type="text"
              placeholder="Enter first name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1"
              data-testid="input-first-name"
            />
          </div>
          <div>
            <Label htmlFor="last-name">Last Name</Label>
            <Input
              id="last-name"
              type="text"
              placeholder="Enter last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1"
              data-testid="input-last-name"
            />
          </div>
          <Button
            onClick={handleUpdateName}
            disabled={updateNameMutation.isPending || !firstName.trim() || !lastName.trim()}
            className="w-full bg-brand-blue hover:bg-blue-600"
            data-testid="button-update-name"
          >
            <Save className="w-4 h-4 mr-2" />
            {updateNameMutation.isPending ? "Updating..." : "Update Name"}
          </Button>
        </CardContent>
      </Card>

      {/* Store URL — admins only */}
      {currentUser.isAdmin && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LinkIcon className="w-5 h-5" />
              Store URL
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm text-gray-500">Current Business Name</Label>
              <p className="text-gray-900 font-medium" data-testid="text-current-business-name">
                {currentTenant?.name || "—"}
              </p>
            </div>

            <div>
              <Label htmlFor="new-business-name">New Business Name</Label>
              <Input
                id="new-business-name"
                type="text"
                placeholder={currentTenant?.name || "Your Business Name"}
                value={newBusinessName}
                onChange={(e) => setNewBusinessName(e.target.value)}
                className="mt-1"
                data-testid="input-new-business-name"
              />
            </div>

            <Button
              onClick={() => updateBusinessNameMutation.mutate(newBusinessName.trim())}
              disabled={
                updateBusinessNameMutation.isPending ||
                !newBusinessName.trim() ||
                newBusinessName.trim() === currentTenant?.name
              }
              className="w-full bg-brand-blue hover:bg-blue-600"
              data-testid="button-update-business-name"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateBusinessNameMutation.isPending ? "Updating..." : "Update Business Name"}
            </Button>

            <div className="border-t pt-4">
              <Label className="text-sm text-gray-500">Current Store URL</Label>
              <p className="text-gray-900 font-medium font-mono" data-testid="text-current-slug">
                {currentTenant?.slug ? `/${currentTenant.slug}` : "—"}
              </p>
            </div>

            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 flex gap-2 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Changing your store URL will break any existing links or bookmarks that use the old address.
              </span>
            </div>

            <div>
              <Label htmlFor="new-slug">New Store URL</Label>
              <div className="relative mt-1">
                <Input
                  id="new-slug"
                  type="text"
                  placeholder={currentTenant?.slug || "your-store-name"}
                  value={newSlug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  className="pr-8 font-mono"
                  data-testid="input-new-slug"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {isCheckingSlug && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                  {!isCheckingSlug && slugStatus?.available === true && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                  {!isCheckingSlug && slugStatus?.available === false && (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Only lowercase letters, numbers, and hyphens. Example: <span className="font-mono">my-pet-shop</span>
              </p>
              {slugStatus?.available === true && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> This URL is available.
                </p>
              )}
              {slugStatus?.available === false && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> This URL is already taken.
                  </p>
                  {slugStatus.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="text-xs text-gray-500">Suggestions:</span>
                      {slugStatus.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleSlugChange(s)}
                          className="text-xs font-mono text-brand-blue hover:underline px-1 py-0.5 rounded bg-blue-50 border border-blue-200"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button
              onClick={handleUpdateSlug}
              disabled={
                updateSlugMutation.isPending ||
                !newSlug.trim() ||
                newSlug === currentTenant?.slug ||
                isCheckingSlug ||
                slugStatus?.available === false ||
                slugStatus === null
              }
              className="w-full bg-brand-blue hover:bg-blue-600"
              data-testid="button-update-slug"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateSlugMutation.isPending ? "Updating..." : "Update Store URL"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Update Phone */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="w-5 h-5" />
            Update Phone Number
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {phonePendingToken ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                A 6-digit verification code has been sent to your email. Enter it below to confirm the phone number change.
              </p>
              <div>
                <Label htmlFor="phone-otp">Verification Code</Label>
                <Input
                  id="phone-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={phoneOtp}
                  onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 text-center text-xl tracking-widest"
                  data-testid="input-phone-otp"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => { setPhonePendingToken(""); setPhoneOtp(""); }}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => confirmPhoneMutation.mutate({ pendingToken: phonePendingToken, otp: phoneOtp })}
                  disabled={confirmPhoneMutation.isPending || phoneOtp.length !== 6}
                  className="flex-1 bg-brand-blue hover:bg-blue-600"
                  data-testid="button-confirm-phone"
                >
                  {confirmPhoneMutation.isPending ? "Verifying..." : "Confirm Change"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="phone-number">Phone Number(s)</Label>
                <Input
                  id="phone-number"
                  type="tel"
                  placeholder="e.g., 555-123-4567 or 555-123-4567, 555-987-6543"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="mt-1"
                  data-testid="input-phone-number"
                />
                <p className="text-xs text-gray-500 mt-1">For notifications. Separate multiple numbers with commas.</p>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  By providing your phone number, you agree to receive order status text messages from PilotHouse (e.g. order approved, ready for pickup, picked up). Msg &amp; data rates may apply. Reply <strong>STOP</strong> to opt out at any time.
                </p>
              </div>
              <div>
                <Label htmlFor="phone-current-password">Current Password</Label>
                <Input
                  id="phone-current-password"
                  type="password"
                  placeholder="Enter your current password to confirm"
                  value={phonePassword}
                  onChange={(e) => setPhonePassword(e.target.value)}
                  className="mt-1"
                  data-testid="input-phone-current-password"
                />
              </div>
              <Button
                onClick={handleUpdatePhone}
                disabled={updatePhoneMutation.isPending || !phoneNumber.trim() || !phonePassword.trim()}
                className="w-full bg-brand-blue hover:bg-blue-600"
                data-testid="button-update-phone"
              >
                <Save className="w-4 h-4 mr-2" />
                {updatePhoneMutation.isPending ? "Sending code..." : "Update Phone"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Update Email */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="w-5 h-5" />
            Update Email Address
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailPendingToken ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                A 6-digit verification code has been sent to your new email address. Enter it below to confirm the change.
              </p>
              <div>
                <Label htmlFor="email-otp">Verification Code</Label>
                <Input
                  id="email-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 text-center text-xl tracking-widest"
                  data-testid="input-email-otp"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => { setEmailPendingToken(""); setEmailOtp(""); }}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => confirmEmailMutation.mutate({ pendingToken: emailPendingToken, otp: emailOtp })}
                  disabled={confirmEmailMutation.isPending || emailOtp.length !== 6}
                  className="flex-1 bg-brand-blue hover:bg-blue-600"
                  data-testid="button-confirm-email"
                >
                  {confirmEmailMutation.isPending ? "Verifying..." : "Confirm Change"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="new-email">New Email Address</Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="Enter new email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1"
                  data-testid="input-new-email"
                />
              </div>
              <div>
                <Label htmlFor="email-current-password">Current Password</Label>
                <Input
                  id="email-current-password"
                  type="password"
                  placeholder="Enter your current password to confirm"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  className="mt-1"
                  data-testid="input-email-current-password"
                />
              </div>
              <Button
                onClick={handleUpdateEmail}
                disabled={updateEmailMutation.isPending || !email.trim() || !emailPassword.trim()}
                className="w-full bg-brand-blue hover:bg-blue-600"
                data-testid="button-update-email"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateEmailMutation.isPending ? "Sending code..." : "Update Email"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Update Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="w-5 h-5" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              placeholder="Enter current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1"
              data-testid="input-current-password"
            />
          </div>
          <div>
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Enter new password (min 6 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1"
              data-testid="input-new-password"
            />
          </div>
          <div>
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1"
              data-testid="input-confirm-password"
            />
          </div>
          <Button
            onClick={handleUpdatePassword}
            disabled={updatePasswordMutation.isPending || !currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()}
            className="w-full bg-brand-blue hover:bg-blue-600"
            data-testid="button-update-password"
          >
            <Save className="w-4 h-4 mr-2" />
            {updatePasswordMutation.isPending ? "Updating..." : "Update Password"}
          </Button>
        </CardContent>
      </Card>

      {/* Subscription Billing — visible to admins (tenant owners) */}
      {currentUser.isAdmin && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="w-5 h-5" />
              Subscription & Billing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-3">
              Manage your PilotHouse subscription, update payment methods, and view your billing history.
            </p>
            <Button
              variant="outline"
              className="w-full flex items-center justify-between"
              onClick={() => setLocation("/settings/billing")}
            >
              <span>View Billing Settings</span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Button>
          </CardContent>
        </Card>
      )}

      </div>
    </div>
  );
}
