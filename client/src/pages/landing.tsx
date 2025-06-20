import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Heart, Star, ArrowRight } from "lucide-react";
import animalHouseLogoPath from "@assets/animal house logo full_1750438187184.jpg";
import mascotLogoPath from "@assets/Circle Mascot Logo_1750438195696.jpg";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-blue via-purple-600 to-brand-red text-white overflow-hidden relative">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-20 h-20 bg-white/10 rounded-full animate-pulse"></div>
        <div className="absolute top-40 right-16 w-16 h-16 bg-brand-orange/20 rounded-full animate-bounce"></div>
        <div className="absolute bottom-32 left-20 w-12 h-12 bg-yellow-300/20 rounded-full animate-pulse"></div>
        <div className="absolute bottom-20 right-12 w-24 h-24 bg-pink-300/10 rounded-full animate-bounce"></div>
      </div>

      {/* Status Bar */}
      <div className="bg-black/20 backdrop-blur-sm text-white text-xs py-1 px-4 flex justify-between items-center relative z-10">
        <span>9:41 AM</span>
        <span>100% 📶 📶 🔋</span>
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center relative z-10">
        {/* Logo with Modern Design */}
        <div className="mb-8 relative">
          <div className="relative mb-6">
            <div className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center shadow-2xl mx-auto mb-4 border border-white/30">
              <img 
                src={mascotLogoPath} 
                alt="Animal House Mascot" 
                className="w-16 h-16 rounded-2xl object-cover"
              />
            </div>
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-400 rounded-full border-2 border-white animate-pulse"></div>
          </div>
          <img 
            src={animalHouseLogoPath} 
            alt="Animal House Logo" 
            className="w-40 h-24 object-contain mx-auto opacity-90"
          />
        </div>

        {/* Hero Text with Modern Typography */}
        <div className="mb-10">
          <div className="flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-yellow-300 mr-2 animate-pulse" />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-white via-yellow-100 to-white bg-clip-text text-transparent">
              Animal House
            </h1>
            <Sparkles className="w-6 h-6 text-yellow-300 ml-2 animate-pulse" />
          </div>
          <p className="text-2xl font-semibold text-blue-100 mb-3">Where Pets Find Families</p>
          <p className="text-lg text-blue-200 max-w-xs mx-auto leading-relaxed">
            Discover loving companions, premium supplies, and expert care services
          </p>
        </div>

        {/* Modern Feature Cards */}
        <div className="grid grid-cols-2 gap-4 mb-10 w-full max-w-sm">
          <Card className="bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:scale-105 cursor-pointer">
            <CardContent className="p-4 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl">🐾</span>
              </div>
              <div className="text-sm font-bold text-white">Adopt Pets</div>
              <div className="text-xs text-blue-200 mt-1">Find your soulmate</div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:scale-105 cursor-pointer">
            <CardContent className="p-4 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-red-400 to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl">🛍️</span>
              </div>
              <div className="text-sm font-bold text-white">Premium Supplies</div>
              <div className="text-xs text-blue-200 mt-1">Best quality guaranteed</div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:scale-105 cursor-pointer">
            <CardContent className="p-4 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl">✂️</span>
              </div>
              <div className="text-sm font-bold text-white">Free Grooming</div>
              <div className="text-xs text-blue-200 mt-1">Professional styling</div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:scale-105 cursor-pointer">
            <CardContent className="p-4 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-2xl">🏥</span>
              </div>
              <div className="text-sm font-bold text-white">Expert Vet Care</div>
              <div className="text-xs text-blue-200 mt-1">Health first priority</div>
            </CardContent>
          </Card>
        </div>

        {/* Modern Login Button */}
        <div className="space-y-4">
          <Button 
            onClick={handleLogin}
            className="bg-gradient-to-r from-white to-gray-100 text-brand-blue hover:from-gray-100 hover:to-white px-10 py-4 text-lg font-bold rounded-full shadow-2xl transform hover:scale-105 transition-all duration-300 border-2 border-white/30"
          >
            <Heart className="w-5 h-5 mr-2 text-brand-red" />
            Start Your Journey
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          
          <p className="text-sm text-blue-200">
            Join 10,000+ happy pet families
          </p>
        </div>

        {/* Stats Bar */}
        <div className="mt-10 grid grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-2xl font-bold text-white">500+</div>
            <div className="text-xs text-blue-200">Pets Adopted</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">1000+</div>
            <div className="text-xs text-blue-200">Happy Families</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">5⭐</div>
            <div className="text-xs text-blue-200">Rating</div>
          </div>
        </div>
      </div>
    </div>
  );
}
