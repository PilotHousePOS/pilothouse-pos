import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function DeleteAccount() {
  const [, setLocation] = useLocation();

  return (
    <div className="w-full min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-lg mx-auto w-full">
        <Button
          variant="ghost"
          className="text-gray-400 hover:text-white mb-6"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to App
        </Button>

        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Delete Your Account</h1>
            <p className="text-gray-400 text-sm">PilotHouse</p>
          </div>

          <p className="text-gray-300">
            You can permanently delete your PilotHouse account and all associated data directly from within the app at any time.
          </p>

          <div>
            <h2 className="text-lg font-semibold text-white mb-3">How to delete your account:</h2>
            <ol className="space-y-3 text-gray-300">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                <span>Sign in to your PilotHouse account at <a href="https://pilothouse.app" className="text-red-400 underline">pilothouse.app</a></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                <span>Tap the <strong className="text-white">Profile</strong> icon in the bottom navigation bar</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                <span>Scroll to the bottom of your profile page</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-sm font-bold">4</span>
                <span>Tap <strong className="text-white">"Delete my account"</strong> below the Sign Out button</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-sm font-bold">5</span>
                <span>Type the word <strong className="text-white">delete</strong> in the confirmation box and tap <strong className="text-white">"Delete Account"</strong></span>
              </li>
            </ol>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="font-semibold text-white mb-2">What gets deleted:</h3>
            <ul className="text-gray-300 text-sm space-y-1">
              <li>• Your name, email address, and phone number</li>
              <li>• Order history and purchase records</li>
              <li>• Grooming appointments</li>
              <li>• Saved pets and wishlist items</li>
              <li>• Loyalty credits and rewards balance</li>
              <li>• Push notification subscriptions</li>
            </ul>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="font-semibold text-white mb-2">What is retained:</h3>
            <ul className="text-gray-300 text-sm space-y-1">
              <li>• Completed transaction records (required for tax and legal compliance) — retained for 7 years and not linked to your identity after account deletion</li>
            </ul>
          </div>

          <p className="text-gray-500 text-sm">
            Need help? Contact us at{" "}
            <a href="tel:3183226090" className="text-red-400 underline">(318) 322-3023</a> or visit us at 2934 Cypress St, West Monroe, LA 71291.
          </p>

          <Button
            className="w-full bg-red-600 hover:bg-red-700"
            onClick={() => setLocation("/profile")}
          >
            Go to My Profile to Delete Account
          </Button>
        </div>
      </div>
    </div>
  );
}
