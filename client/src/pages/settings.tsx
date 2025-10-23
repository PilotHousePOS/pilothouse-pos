import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { ArrowLeft, Mail, Save, User as UserIcon } from "lucide-react";
import type { User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { z } from "zod";

const updateEmailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export default function Settings() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const hasToken = !!localStorage.getItem('token');
  const [email, setEmail] = useState("");

  const { data: currentUser, isLoading: userLoading, error: userError } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    enabled: hasToken,
    retry: false,
    staleTime: 5 * 60 * 1000,
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

  const updateEmailMutation = useMutation({
    mutationFn: async (newEmail: string) => {
      const result = updateEmailSchema.safeParse({ email: newEmail });
      if (!result.success) {
        throw new Error(result.error.errors[0].message);
      }
      
      const response = await apiRequest("PATCH", "/api/auth/update-email", { email: newEmail });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to update email: ${response.statusText}`);
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
        title: "Email updated",
        description: "Your email address has been successfully updated.",
      });
      setEmail("");
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update email. Please try again.",
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

  const handleUpdateEmail = () => {
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter a new email address.",
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

    updateEmailMutation.mutate(email);
  };

  return (
    <div className="px-6 py-4 pb-20">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/profile')}
          className="mb-4 -ml-2"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Profile
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account settings</p>
      </div>

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
          {currentUser.isAdmin && (
            <div>
              <Label className="text-sm text-gray-500">Account Type</Label>
              <p className="text-brand-blue font-semibold" data-testid="text-admin-status">Administrator</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="w-5 h-5" />
            Update Email Address
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <Button
            onClick={handleUpdateEmail}
            disabled={updateEmailMutation.isPending || !email.trim()}
            className="w-full bg-brand-blue hover:bg-blue-600"
            data-testid="button-update-email"
          >
            <Save className="w-4 h-4 mr-2" />
            {updateEmailMutation.isPending ? "Updating..." : "Update Email"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
