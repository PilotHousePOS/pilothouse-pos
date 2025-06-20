import { Button } from "@/components/ui/button";
import animalHouseLogoPath from "@assets/animal house logo full_1750438187184.jpg";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-blue to-brand-red text-white">
      {/* Status Bar */}
      <div className="bg-brand-blue text-white text-xs py-1 px-4 flex justify-between items-center">
        <span>9:41 AM</span>
        <span>100% 📶 📶 🔋</span>
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        {/* Logo */}
        <div className="mb-8">
          <img 
            src={animalHouseLogoPath} 
            alt="Animal House Logo" 
            className="w-48 h-32 object-contain mx-auto mb-4"
          />
        </div>

        {/* Hero Text */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Welcome to Animal House</h1>
          <p className="text-xl text-blue-100 mb-2">Your Premier Pet Store</p>
          <p className="text-lg text-blue-200">Find your perfect companion, book services, and shop supplies</p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-2 gap-4 mb-8 w-full max-w-sm">
          <div className="bg-white bg-opacity-20 rounded-xl p-4 text-center">
            <div className="text-3xl mb-2">🐕</div>
            <div className="text-sm font-semibold">Adopt Pets</div>
          </div>
          <div className="bg-white bg-opacity-20 rounded-xl p-4 text-center">
            <div className="text-3xl mb-2">🛍️</div>
            <div className="text-sm font-semibold">Pet Supplies</div>
          </div>
          <div className="bg-white bg-opacity-20 rounded-xl p-4 text-center">
            <div className="text-3xl mb-2">✂️</div>
            <div className="text-sm font-semibold">Grooming</div>
          </div>
          <div className="bg-white bg-opacity-20 rounded-xl p-4 text-center">
            <div className="text-3xl mb-2">🏥</div>
            <div className="text-sm font-semibold">Vet Care</div>
          </div>
        </div>

        {/* CTA Button */}
        <Button 
          onClick={handleLogin}
          className="bg-white text-brand-blue hover:bg-gray-100 px-8 py-4 text-lg font-bold rounded-full shadow-lg w-full max-w-xs"
        >
          Get Started
        </Button>

        {/* Footer */}
        <div className="mt-8 text-sm text-blue-200">
          <p>Join thousands of happy pet owners</p>
        </div>
      </div>
    </div>
  );
}
