import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Heart, Star, ArrowRight } from "lucide-react";
import animalHouseLogoPath from "@assets/animal house logo full_1750438187184.jpg";
import mascotLogoPath from "@assets/Circle Mascot Logo_1750438195696.jpg";

export default function Landing() {
  // Don't redirect from landing page - let the router handle it

  const handleLogin = () => {
    // Navigate to dedicated auth page
    window.location.href = '/auth';
  };

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
        {/* Logo with Bold Design */}
        <div className="mb-8 relative">
          <div className="relative mb-6">
            <div className="w-28 h-28 bg-gradient-to-br from-brand-red to-brand-blue rounded-3xl flex items-center justify-center shadow-2xl mx-auto mb-4 border-2 border-white">
              <img 
                src={mascotLogoPath} 
                alt="Animal House Mascot" 
                className="w-20 h-20 rounded-2xl object-cover"
              />
            </div>
            <div className="absolute -top-3 -right-3 w-8 h-8 bg-green-500 rounded-full border-3 border-white animate-pulse shadow-lg"></div>
          </div>
          <img 
            src={animalHouseLogoPath} 
            alt="Animal House Logo" 
            className="w-48 h-28 object-contain mx-auto drop-shadow-2xl"
          />
        </div>

        {/* Hero Text with Bold Typography */}
        <div className="mb-10">
          <div className="flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-brand-orange mr-3 animate-pulse" />
            <h1 className="text-6xl font-black bg-gradient-to-r from-brand-red via-white to-brand-blue bg-clip-text text-transparent drop-shadow-2xl">
              ANIMAL HOUSE
            </h1>
            <Sparkles className="w-8 h-8 text-brand-orange ml-3 animate-pulse" />
          </div>
          <p className="text-3xl font-bold text-white mb-4 drop-shadow-lg">WHERE PETS FIND FAMILIES</p>
          <p className="text-xl font-semibold text-gray-200 max-w-sm mx-auto leading-relaxed">
            Premium companions, expert care, unmatched quality
          </p>
        </div>

        {/* Bold Feature Cards */}
        <div className="grid grid-cols-2 gap-6 mb-12 w-full max-w-md">
          <Card className="bg-gradient-to-br from-brand-blue to-blue-700 border-2 border-white/30 hover:border-white/60 transition-all duration-300 transform hover:scale-110 cursor-pointer shadow-2xl">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl border-2 border-white">
                <span className="text-3xl">🐾</span>
              </div>
              <div className="text-lg font-black text-white">ADOPT PETS</div>
              <div className="text-sm font-bold text-blue-100 mt-2">Sharing The Love Through Astro (Discounts and Specials Available at Checkout)</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-brand-red to-red-700 border-2 border-white/30 hover:border-white/60 transition-all duration-300 transform hover:scale-110 cursor-pointer shadow-2xl">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl border-2 border-white">
                <span className="text-3xl">🛍️</span>
              </div>
              <div className="text-lg font-black text-white">PREMIUM GEAR</div>
              <div className="text-sm font-bold text-red-100 mt-2">Top-tier quality</div>
              <div className="text-sm font-bold text-red-100 mt-1">Bedding Bowls Bones Brushs and So Much More!!!</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-600 to-green-800 border-2 border-white/30 hover:border-white/60 transition-all duration-300 transform hover:scale-110 cursor-pointer shadow-2xl">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl border-2 border-white">
                <span className="text-3xl">✂️</span>
              </div>
              <div className="text-lg font-black text-white">GROOMING</div>
              <div className="text-sm font-bold text-green-100 mt-2">From Baths to Full Grooms and All Your Needs Inbetween</div>
              <div className="text-sm font-bold text-green-100 mt-1">With Extra Options Like Flea Packages Nail Grinds/Polish and Teeth Brushing</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-600 to-orange-800 border-2 border-white/30 hover:border-white/60 transition-all duration-300 transform hover:scale-110 cursor-pointer shadow-2xl">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl border-2 border-white">
                <span className="text-3xl">🦎</span>
              </div>
              <div className="text-lg font-black text-white">EXOTIC REPTILES</div>
              <div className="text-sm font-bold text-orange-100 mt-2">From Leopard Geckos to Leachie Geckos Snakes Frogs and Spiders All Your Reptile Needs</div>
            </CardContent>
          </Card>
        </div>

        {/* Bold CTA Button */}
        <div className="space-y-6">
          <Button 
            onClick={handleLogin}
            className="bg-gradient-to-r from-brand-red to-brand-blue hover:from-red-700 hover:to-blue-700 text-white px-12 py-6 text-xl font-black rounded-2xl shadow-2xl transform hover:scale-110 transition-all duration-300 border-3 border-white uppercase tracking-wider"
          >
            <Heart className="w-6 h-6 mr-3 text-white" />
            START NOW
            <ArrowRight className="w-6 h-6 ml-3" />
          </Button>
          
          <p className="text-lg font-bold text-white">
            JOIN 10,000+ ELITE PET FAMILIES
          </p>
        </div>

        {/* Bold Stats Bar */}
        <div className="mt-12 grid grid-cols-3 gap-8 text-center">
          <div className="bg-black/50 rounded-xl p-4 border border-white/30">
            <div className="text-3xl font-black text-brand-red">500+</div>
            <div className="text-sm font-bold text-white uppercase">Pets Adopted</div>
          </div>
          <div className="bg-black/50 rounded-xl p-4 border border-white/30">
            <div className="text-3xl font-black text-brand-blue">1000+</div>
            <div className="text-sm font-bold text-white uppercase">Happy Families</div>
          </div>
          <div className="bg-black/50 rounded-xl p-4 border border-white/30">
            <div className="text-3xl font-black text-brand-orange">5⭐</div>
            <div className="text-sm font-bold text-white uppercase">Rating</div>
          </div>
        </div>
      </div>
    </div>
  );
}
