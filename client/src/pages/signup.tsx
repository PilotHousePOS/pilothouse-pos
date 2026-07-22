import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Signup() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const businessName = (formData.get('businessName') as string).trim();
    const firstName = (formData.get('firstName') as string).trim();
    const lastName = (formData.get('lastName') as string).trim();
    const email = (formData.get('email') as string).trim();
    const password = formData.get('password') as string;
    const phone = (formData.get('phone') as string).trim();

    if (!businessName || !firstName || !lastName || !email || !password) {
      toast({ title: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/tenants/signup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, firstName, lastName, email, password, phone }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
        window.location.replace('/onboarding');
      } else {
        const error = await response.json();
        toast({
          title: "Sign Up Failed",
          description: error.message || "Unable to create account. Please try again.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white flex items-start md:items-center justify-center p-6 py-8">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-brand-red/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-brand-blue/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation('/')}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>

        {/* Logo */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-brand-blue to-brand-red rounded-2xl flex items-center justify-center shadow-2xl mx-auto mb-3 border border-white/20">
            <span className="text-xl font-black text-white">PH</span>
          </div>
          <h1 className="text-2xl font-black text-white">Create your PilotHouse account</h1>
          <p className="text-gray-400 mt-1 text-sm">14-day free trial — no credit card required</p>
        </div>

        <Card className="bg-white/10 backdrop-blur-md border border-white/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-orange" />
              Tell us about your business
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Business name */}
              <div className="space-y-1.5">
                <Label className="text-white font-semibold">Business Name <span className="text-red-400">*</span></Label>
                <Input
                  name="businessName"
                  placeholder="e.g. Animal House Pet Store"
                  className="bg-white/10 border-white/30 text-white placeholder:text-gray-500"
                  required
                />
              </div>

              <div className="border-t border-white/10 pt-4">
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-3">Owner Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-white font-semibold">First Name <span className="text-red-400">*</span></Label>
                    <Input
                      name="firstName"
                      placeholder="Jane"
                      className="bg-white/10 border-white/30 text-white placeholder:text-gray-500"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white font-semibold">Last Name <span className="text-red-400">*</span></Label>
                    <Input
                      name="lastName"
                      placeholder="Smith"
                      className="bg-white/10 border-white/30 text-white placeholder:text-gray-500"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-white font-semibold">Email <span className="text-red-400">*</span></Label>
                <Input
                  name="email"
                  type="email"
                  placeholder="jane@yourbusiness.com"
                  className="bg-white/10 border-white/30 text-white placeholder:text-gray-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-white font-semibold">Password <span className="text-red-400">*</span></Label>
                <Input
                  name="password"
                  type="password"
                  placeholder="Create a strong password"
                  className="bg-white/10 border-white/30 text-white placeholder:text-gray-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-white font-semibold">
                  Phone <span className="text-gray-400 font-normal text-xs">(optional)</span>
                </Label>
                <Input
                  name="phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  className="bg-white/10 border-white/30 text-white placeholder:text-gray-500"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-brand-red to-brand-blue hover:from-red-600 hover:to-blue-600 text-white font-bold py-3 rounded-xl mt-2"
              >
                {isLoading ? "Creating your account..." : (
                  <>
                    Create Account & Start Trial
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-gray-400 pt-1">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setLocation('/auth')}
                  className="text-brand-blue hover:underline font-semibold"
                >
                  Sign in
                </button>
              </p>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-500 mt-4">
          By creating an account you agree to our{' '}
          <a href="/terms-of-service" className="underline hover:text-white">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy-policy" className="underline hover:text-white">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
