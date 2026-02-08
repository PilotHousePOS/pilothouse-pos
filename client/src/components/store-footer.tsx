import { MapPin, Clock, Phone } from "lucide-react";

export default function StoreFooter() {
  return (
    <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 mt-4">
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-gray-600">
          <Clock className="w-4 h-4 flex-shrink-0 text-gray-400" />
          <span className="text-xs">Mon-Sat 9:00 AM - 6:00 PM · Sunday Closed</span>
        </div>
        <div className="flex items-center space-x-2 text-gray-600">
          <Phone className="w-4 h-4 flex-shrink-0 text-gray-400" />
          <a href="tel:318-323-6090" className="text-xs text-brand-blue hover:underline font-medium">
            318-323-6090
          </a>
        </div>
        <div className="flex items-center space-x-2 text-gray-600">
          <MapPin className="w-4 h-4 flex-shrink-0 text-gray-400" />
          <span className="text-xs">Animal House Pet Store</span>
        </div>
      </div>
    </div>
  );
}
