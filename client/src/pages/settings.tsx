import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { ArrowLeft, Mail, Save, User as UserIcon, Lock, Phone } from "lucide-react";
import type { User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { z } from "zod";
import { safeGoBack } from "@/lib/navigation";

const updateNameSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

const updatePhoneSchema = z.object({
  phoneNumber: z.string().min(10, "Phone number must be at least 10 digits").regex(/^[\d\s\-\(\)]+$/, "Please enter a valid phone number"),
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

export default function Settings() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const hasToken = !!localStorage.getItem('token');
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
    mutationFn: async (newPhone: string) => {
      const result = updatePhoneSchema.safeParse({ phoneNumber: newPhone });
      if (!result.success) {
        throw new Error(result.error.errors[0].message);
      }
      
      const response = await apiRequest("PATCH", "/api/auth/update-phone", { phoneNumber: newPhone });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to update phone: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Phone updated",
        description: "Your phone number has been successfully updated.",
      });
      setPhoneNumber("");
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update phone number. Please try again.",
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

  const handleUpdatePhone = () => {
    if (!phoneNumber.trim()) {
      toast({
        title: "Phone number required",
        description: "Please enter a phone number.",
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

    updatePhoneMutation.mutate(phoneNumber);
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

      {/* Update Phone */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="w-5 h-5" />
            Update Phone Number
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="phone-number">Phone Number</Label>
            <Input
              id="phone-number"
              type="tel"
              placeholder="Enter phone number (e.g., 555-123-4567)"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="mt-1"
              data-testid="input-phone-number"
            />
            <p className="text-xs text-gray-500 mt-1">Required for grooming appointments and order notifications</p>
          </div>
          <Button
            onClick={handleUpdatePhone}
            disabled={updatePhoneMutation.isPending || !phoneNumber.trim()}
            className="w-full bg-brand-blue hover:bg-blue-600"
            data-testid="button-update-phone"
          >
            <Save className="w-4 h-4 mr-2" />
            {updatePhoneMutation.isPending ? "Updating..." : "Update Phone"}
          </Button>
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
      </div>
    </div>
  );
}
