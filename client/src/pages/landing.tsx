import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Star, ArrowRight, Briefcase, ShoppingCart, Calendar, BarChart3, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = '/auth';
  };

  const { data: hiringData } = useQuery<{ open: boolean }>({
    queryKey: ['/api/settings/hiring-open'],
  });
  const hiringOpen = hiringData?.open ?? false;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white overflow-hidden relative">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-20 h-20 bg-brand-red/30 rounded-full animate-pulse shadow-2xl"></div>
        <div className="absolute top-40 right-16 w-16 h-16 bg-brand-blue/40 rounded-full animate-bounce shadow-xl"></div>
        <div className="absolute bottom-32 left-20 w-12 h-12 bg-brand-orange/30 rounded-full animate-pulse shadow-xl"></div>
        <div className="absolute bottom-20 right-12 w-24 h-24 bg-purple-600/20 rounded-full animate-bounce shadow-2xl"></div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center relative z-10">
        {/* Logo / Wordmark */}
        <div className="mb-8 relative">
          <div className="w-20 h-20 bg-gradient-to-br from-brand-blue to-brand-red rounded-3xl flex items-center justify-center shadow-2xl mx-auto mb-4 border-2 border-white">
            <span className="text-3xl font-black text-white">PH</span>
          </div>
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full border-2 border-white animate-pulse shadow-lg"></div>
        </div>

        {/* Hero Text */}
        <div className="mb-10">
          <div className="flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-brand-orange mr-3 animate-pulse" />
            <h1 className="text-5xl font-black bg-gradient-to-r from-brand-red via-white to-brand-blue bg-clip-text text-transparent drop-shadow-2xl">
              PILOTHOUSE
            </h1>
            <Sparkles className="w-8 h-8 text-brand-orange ml-3 animate-pulse" />
          </div>
          <p className="text-2xl font-bold text-white mb-4 drop-shadow-lg">YOUR BUSINESS, FULLY EQUIPPED</p>
          <p className="text-lg font-semibold text-gray-200 max-w-sm mx-auto leading-relaxed">
            POS, inventory, loyalty rewards, appointments, and reporting — all in one platform.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-2 gap-6 mb-12 w-full max-w-md">
          <Card className="bg-gradient-to-br from-brand-blue to-blue-700 border-2 border-white/30 hover:border-white/60 transition-all duration-300 transform hover:scale-110 cursor-pointer shadow-2xl">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl border-2 border-white">
                <ShoppingCart className="w-8 h-8 text-white" />
              </div>
              <div className="text-lg font-black text-white">POS & SALES</div>
              <div className="text-sm font-bold text-blue-100 mt-2">Fast checkout, inventory sync, and receipt printing</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-brand-red to-red-700 border-2 border-white/30 hover:border-white/60 transition-all duration-300 transform hover:scale-110 cursor-pointer shadow-2xl">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl border-2 border-white">
                <Star className="w-8 h-8 text-white" />
              </div>
              <div className="text-lg font-black text-white">LOYALTY</div>
              <div className="text-sm font-bold text-red-100 mt-2">Keep customers coming back with rewards programs</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-600 to-green-800 border-2 border-white/30 hover:border-white/60 transition-all duration-300 transform hover:scale-110 cursor-pointer shadow-2xl">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl border-2 border-white">
                <Calendar className="w-8 h-8 text-white" />
              </div>
              <div className="text-lg font-black text-white">BOOKINGS</div>
              <div className="text-sm font-bold text-green-100 mt-2">Service appointments with automated reminders</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-600 to-orange-800 border-2 border-white/30 hover:border-white/60 transition-all duration-300 transform hover:scale-110 cursor-pointer shadow-2xl">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl border-2 border-white">
                <BarChart3 className="w-8 h-8 text-white" />
              </div>
              <div className="text-lg font-black text-white">REPORTING</div>
              <div className="text-sm font-bold text-orange-100 mt-2">Daily and periodic sales reports delivered automatically</div>
            </CardContent>
          </Card>
        </div>

        {/* CTA Button */}
        <div className="space-y-6">
          <Button 
            onClick={handleLogin}
            className="bg-gradient-to-r from-brand-red to-brand-blue hover:from-red-700 hover:to-blue-700 text-white px-12 py-6 text-xl font-black rounded-2xl shadow-2xl transform hover:scale-110 transition-all duration-300 border-3 border-white uppercase tracking-wider"
          >
            <Users className="w-6 h-6 mr-3 text-white" />
            GET STARTED
            <ArrowRight className="w-6 h-6 ml-3" />
          </Button>
          
          <p className="text-lg font-bold text-white">
            BUILT FOR SMALL BUSINESSES
          </p>
        </div>

        {/* Stats Bar */}
        <div className="mt-12 grid grid-cols-3 gap-8 text-center">
          <div className="bg-black/50 rounded-xl p-4 border border-white/30">
            <div className="text-3xl font-black text-brand-red">POS</div>
            <div className="text-sm font-bold text-white uppercase">Integrated</div>
          </div>
          <div className="bg-black/50 rounded-xl p-4 border border-white/30">
            <div className="text-3xl font-black text-brand-blue">24/7</div>
            <div className="text-sm font-bold text-white uppercase">Online Store</div>
          </div>
          <div className="bg-black/50 rounded-xl p-4 border border-white/30">
            <div className="text-3xl font-black text-brand-orange">5⭐</div>
            <div className="text-sm font-bold text-white uppercase">Rating</div>
          </div>
        </div>

        {/* Now Hiring Banner — only shown when hiring is open */}
        {hiringOpen && <div
          className="mt-8 bg-black/50 border border-red-600 rounded-2xl p-4 flex items-center gap-4 cursor-pointer active:scale-95 transition-transform"
          onClick={() => window.location.href = '/apply'}
        >
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-white font-bold text-sm">Now Hiring!</span>
              <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">Apply Now</span>
            </div>
            <p className="text-white/60 text-xs">Join the PilotHouse team — tap to apply.</p>
          </div>
          <ArrowRight className="w-4 h-4 text-red-500 flex-shrink-0" />
        </div>}

        {/* Footer Links */}
        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-white/60">
          <a href="/privacy-policy" className="hover:text-white/90 underline">Privacy Policy</a>
          <span>•</span>
          <a href="/terms-of-service" className="hover:text-white/90 underline">Terms of Service</a>
        </div>
      </div>
    </div>
  );
}
