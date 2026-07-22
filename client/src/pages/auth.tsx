import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Heart } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Auth() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const { toast } = useToast();

  const handleResendVerification = async (email: string) => {
    setResendingVerification(true);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      toast({ title: data.message });
    } catch {
      toast({ title: "Failed to resend. Please try again.", variant: "destructive" });
    } finally {
      setResendingVerification(false);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // Forward the tenant slug from the URL (?tenant=<slug>) so the server
      // knows which store this login originated from.  The login route resolves
      // the user's tenant from their stored record (set at signup), so the header
      // does not override that — but sending it keeps the request consistent with
      // the signup form and allows the server to log or validate the originating
      // store context if needed in the future.
      const tenantSlug = new URLSearchParams(window.location.search).get('tenant') || '';
      const loginHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tenantSlug) {
        loginHeaders['X-Tenant-Slug'] = tenantSlug;
      }
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: loginHeaders,
        body: JSON.stringify({ email, password }),
      });
      
      if (response.ok) {
        const userData = await response.json();
        
        // Store token in localStorage as backup to cookies
        if (userData.token) {
          localStorage.setItem('token', userData.token);
        }
        
        // Force a complete page reload to ensure authentication state is picked up
        window.location.replace('/');
      } else {
        const error = await response.json();
        console.error('Login failed:', error.message);
        if (error.requiresVerification) {
          setPendingEmail(email);
          setVerificationPending(true);
        } else if (error.verificationExpired) {
          setPendingEmail(email);
          setVerificationPending(true);
        } else {
          toast({
            title: "Login Failed",
            description: "Your email or password is incorrect. Please check your information and try again.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Error",
        description: "An error occurred during login. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (email: string, password: string, firstName: string, lastName: string, phoneNumber: string) => {
    setIsLoading(true);
    try {
      // Read the tenant slug from the URL (?tenant=<slug>) so new accounts are
      // scoped to the correct store. Without this header the server returns 400
      // and the user would silently end up in the wrong (or no) store.
      const tenantSlug = new URLSearchParams(window.location.search).get('tenant') || '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tenantSlug) {
        headers['X-Tenant-Slug'] = tenantSlug;
      }
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ email, password, firstName, lastName, phoneNumber }),
      });
      
      if (response.ok) {
        const userData = await response.json();
        if (userData.requiresVerification) {
          // Show verification pending screen
          setPendingEmail(email);
          setVerificationPending(true);
        } else {
          window.location.replace('/');
        }
      } else {
        const error = await response.json();
        console.error('Signup failed:', error.message);
        toast({
          title: "Sign Up Failed",
          description: error.message || "Unable to create account. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Signup error:', error);
      toast({
        title: "Error",
        description: "An error occurred during sign up. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const phoneNumber = formData.get('phoneNumber') as string;
    
    await handleSignUp(email, password, firstName, lastName, phoneNumber);
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    await handleLogin(email, password);
  };

  if (verificationPending) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Card className="bg-white/10 backdrop-blur-md border border-white/20 text-center">
            <CardContent className="pt-8 pb-8 space-y-4">
              <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-3xl mx-auto">✉</div>
              <h2 className="text-2xl font-bold text-white">Check Your Email</h2>
              <p className="text-gray-300">
                We sent a verification link to <strong className="text-white">{pendingEmail}</strong>.
                Click the link in that email to activate your account.
              </p>
              <p className="text-gray-400 text-sm">The link expires in 24 hours.</p>
              <div className="pt-2 space-y-3">
                <Button
                  className="w-full bg-red-600 hover:bg-red-700"
                  onClick={() => handleResendVerification(pendingEmail)}
                  disabled={resendingVerification}
                >
                  {resendingVerification ? "Sending..." : "Resend Verification Email"}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-gray-400 hover:text-white"
                  onClick={() => { setVerificationPending(false); setPendingEmail(""); }}
                >
                  Back to Sign In
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white flex items-start md:items-center justify-center p-6 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation('/')}
            className="text-white hover:bg-white/10 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>

        <Card className="bg-white/10 backdrop-blur-md border border-white/20">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-white mb-2">
              Welcome to PilotHouse
            </CardTitle>
            <p className="text-gray-300">Sign in to manage your account</p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-white/10">
                <TabsTrigger value="signin" className="text-white data-[state=active]:bg-brand-blue data-[state=active]:text-white">
                  Sign In
                </TabsTrigger>
                <TabsTrigger value="signup" className="text-white data-[state=active]:bg-brand-red data-[state=active]:text-white">
                  Sign Up
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="signin" className="space-y-4 mt-6">
                <form onSubmit={handleSignInSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-white">Email</Label>
                    <Input
                      name="email"
                      type="email"
                      placeholder="Enter your email"
                      className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-white">Password</Label>
                    <Input
                      name="password"
                      type="password"
                      placeholder="Enter your password"
                      className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-brand-blue to-blue-600 hover:from-blue-600 hover:to-brand-blue text-white font-bold py-3"
                    data-testid="button-signin"
                  >
                    {isLoading ? "Signing In..." : "Sign In"}
                  </Button>
                  <div className="text-center mt-4 mb-2">
                    <button
                      type="button"
                      onClick={() => setLocation('/forgot-password')}
                      className="text-sm text-blue-400 hover:text-blue-300 underline transition-colors"
                      data-testid="link-forgot-password"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </form>
              </TabsContent>
              
              <TabsContent value="signup" className="space-y-4 mt-6">
                <form onSubmit={handleSignUpSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-white">First Name</Label>
                      <Input
                        name="firstName"
                        placeholder="First name"
                        className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-white">Last Name</Label>
                      <Input
                        name="lastName"
                        placeholder="Last name"
                        className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signupEmail" className="text-white">Email</Label>
                    <Input
                      name="email"
                      type="email"
                      placeholder="Enter your email"
                      className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber" className="text-white">Phone Number</Label>
                    <Input
                      name="phoneNumber"
                      type="tel"
                      placeholder="(555) 123-4567"
                      className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                      required
                      data-testid="input-phone-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signupPassword" className="text-white">Password</Label>
                    <Input
                      name="password"
                      type="password"
                      placeholder="Create a password"
                      className="bg-white/10 border-white/30 text-white placeholder:text-gray-400"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-brand-red to-red-600 hover:from-red-600 hover:to-brand-red text-white font-bold py-3"
                  >
                    <Heart className="w-4 h-4 mr-2" />
                    {isLoading ? "Creating Account..." : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>


          </CardContent>
        </Card>
      </div>
    </div>
  );
}