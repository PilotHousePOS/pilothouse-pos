import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Sparkles, CheckCircle, AlertTriangle, Loader2, Pencil } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

function toSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function Signup() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Slug state
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false); // true once user manually edits slug
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [slugSuggestions, setSlugSuggestions] = useState<string[]>([]);
  const slugCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When business name changes, auto-update slug unless user manually edited it
  useEffect(() => {
    if (!slugEdited) {
      setSlug(toSlug(businessName));
    }
  }, [businessName, slugEdited]);

  // Debounced slug availability check
  useEffect(() => {
    if (!slug) {
      setSlugStatus('idle');
      setSlugSuggestions([]);
      return;
    }
    if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current);
    setSlugStatus('checking');
    slugCheckTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tenants/slug-check?slug=${encodeURIComponent(slug)}`);
        if (res.ok) {
          const data = await res.json();
          setSlugStatus(data.available ? 'available' : 'taken');
          setSlugSuggestions(data.suggestions || []);
        } else {
          setSlugStatus('idle');
        }
      } catch {
        setSlugStatus('idle');
      }
    }, 400);
    return () => {
      if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current);
    };
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const firstName = (formData.get('firstName') as string).trim();
    const lastName = (formData.get('lastName') as string).trim();
    const email = (formData.get('email') as string).trim();
    const password = formData.get('password') as string;
    const phone = (formData.get('phone') as string).trim();

    if (!businessName || !firstName || !lastName || !email || !password) {
      toast({ title: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    if (slugStatus === 'taken') {
      toast({ title: "Slug is already taken", description: "Please choose a different URL slug before continuing.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/tenants/signup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, firstName, lastName, email, password, phone, slug: slug || undefined }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
        window.location.replace('/onboarding');
      } else if (response.status === 409) {
        // Slug was taken between the availability check and submission.
        const error = await response.json();
        setSlugStatus('taken');
        setSlugSuggestions(error.suggestions || []);
        setSlugEdited(true);
        toast({
          title: "URL just taken",
          description: error.message || "That store URL was just claimed. Please pick one of the suggestions or enter your own.",
          variant: "destructive",
        });
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
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="e.g. Animal House Pet Store"
                  className="bg-white/10 border-white/30 text-white placeholder:text-gray-500"
                  required
                />
              </div>

              {/* Slug preview / editor */}
              {businessName.trim() && (
                <div className="space-y-1.5">
                  <Label className="text-white font-semibold flex items-center gap-1.5">
                    Your store URL
                    {!slugEdited && (
                      <button
                        type="button"
                        onClick={() => setSlugEdited(true)}
                        className="text-gray-400 hover:text-white transition-colors"
                        title="Edit URL"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </Label>
                  <div className="flex items-center rounded-lg border border-white/30 bg-white/10 overflow-hidden">
                    <span className="pl-3 pr-1 text-gray-400 text-sm whitespace-nowrap select-none">pilothouse.app/</span>
                    <input
                      type="text"
                      value={slug}
                      readOnly={!slugEdited}
                      onChange={e => {
                        setSlug(toSlug(e.target.value));
                      }}
                      className={`flex-1 bg-transparent text-white text-sm py-2 pr-3 outline-none ${slugEdited ? 'cursor-text' : 'cursor-default select-all'}`}
                      placeholder="your-business"
                      aria-label="Store URL slug"
                    />
                    <span className="pr-3 pl-1">
                      {slugStatus === 'checking' && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                      {slugStatus === 'available' && <CheckCircle className="w-4 h-4 text-green-400" />}
                      {slugStatus === 'taken' && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                    </span>
                  </div>

                  {slugStatus === 'available' && (
                    <p className="text-green-400 text-xs flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> This URL is available
                    </p>
                  )}

                  {slugStatus === 'taken' && (
                    <div className="space-y-1.5">
                      <p className="text-yellow-400 text-xs flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> This URL is already taken. Try one of these or type your own:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {slugSuggestions.map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => { setSlug(s); setSlugEdited(true); }}
                            className="text-xs px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                disabled={isLoading || slugStatus === 'taken' || slugStatus === 'checking'}
                className="w-full bg-gradient-to-r from-brand-red to-brand-blue hover:from-red-600 hover:to-blue-600 text-white font-bold py-3 rounded-xl mt-2 disabled:opacity-60"
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
