import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Lock, CheckCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Get token from URL query parameters
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('token');
    
    if (!resetToken) {
      toast({
        title: "Invalid link",
        description: "This password reset link is invalid or expired.",
        variant: "destructive",
      });
      setTimeout(() => setLocation('/auth'), 2000);
    } else {
      setToken(resetToken);
    }
  }, [toast, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) {
      toast({
        title: "Invalid token",
        description: "Reset token is missing.",
        variant: "destructive",
      });
      return;
    }

    if (!newPassword.trim() || !confirmPassword.trim()) {
      toast({
        title: "All fields required",
        description: "Please fill in all fields.",
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

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        setResetSuccess(true);
        toast({
          title: "Password reset successful",
          description: "Your password has been successfully reset. You can now log in with your new password.",
        });
        
        // Redirect to login page after 3 seconds
        setTimeout(() => setLocation('/auth'), 3000);
      } else {
        toast({
          title: "Reset failed",
          description: data.message || "Failed to reset password. The link may have expired.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Reset password error:', error);
      toast({
        title: "Error",
        description: "An error occurred. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white flex items-center justify-center p-6">
        <Card className="bg-white/10 backdrop-blur-md border border-white/20 max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-gray-300">Invalid or missing reset token. Redirecting...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {!resetSuccess && (
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setLocation('/auth')}
              className="text-white hover:bg-white/10 mb-4"
              data-testid="button-back-to-login"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Sign In
            </Button>
          </div>
        )}

        <Card className="bg-white/10 backdrop-blur-md border border-white/20">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className={`${resetSuccess ? 'bg-green-500/20' : 'bg-brand-blue/20'} p-4 rounded-full`}>
                {resetSuccess ? (
                  <CheckCircle className="w-8 h-8 text-green-500" />
                ) : (
                  <Lock className="w-8 h-8 text-brand-blue" />
                )}
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-white mb-2">
              {resetSuccess ? "Password Reset Complete" : "Create New Password"}
            </CardTitle>
            <CardDescription className="text-gray-300">
              {resetSuccess 
                ? "You can now sign in with your new password" 
                : "Enter your new password below"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!resetSuccess ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-white">New Password</Label>
                  <PasswordInput
                    id="newPassword"
                    name="newPassword"
                    placeholder="Enter new password (min 6 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                    required
                    data-testid="input-new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-white">Confirm Password</Label>
                  <PasswordInput
                    id="confirmPassword"
                    name="confirmPassword"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                    required
                    data-testid="input-confirm-password"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-brand-blue to-blue-600 hover:from-blue-600 hover:to-brand-blue text-white font-bold py-3"
                  data-testid="button-reset-password"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  {isLoading ? "Resetting..." : "Reset Password"}
                </Button>
              </form>
            ) : (
              <div className="text-center space-y-4">
                <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4">
                  <p className="text-green-200 text-sm">
                    Your password has been successfully reset. Redirecting to sign in...
                  </p>
                </div>
                <Button
                  onClick={() => setLocation('/auth')}
                  className="w-full bg-gradient-to-r from-brand-blue to-blue-600 hover:from-blue-600 hover:to-brand-blue text-white font-bold py-3"
                  data-testid="button-go-to-login"
                >
                  Go to Sign In
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
