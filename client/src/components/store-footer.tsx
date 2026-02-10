import { MapPin, Clock, Phone, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

function formatTime12h(time24: string) {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function buildHoursDisplay(hours: Record<string, { open: boolean; openTime: string; closeTime: string }>) {
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const DAY_SHORT: Record<string, string> = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
    thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
  };

  const groups: { days: string[]; time: string }[] = [];
  for (const day of DAYS) {
    const h = hours[day];
    if (!h) continue;
    const timeStr = h.open ? `${formatTime12h(h.openTime)} - ${formatTime12h(h.closeTime)}` : 'Closed';
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.time === timeStr) {
      lastGroup.days.push(DAY_SHORT[day]);
    } else {
      groups.push({ days: [DAY_SHORT[day]], time: timeStr });
    }
  }

  return groups.map(g => {
    const dayRange = g.days.length > 2
      ? `${g.days[0]}-${g.days[g.days.length - 1]}`
      : g.days.join(', ');
    return `${dayRange} ${g.time}`;
  }).join(' · ');
}

export default function StoreFooter() {
  const { data: storeHours } = useQuery({
    queryKey: ['/api/settings/store-hours'],
    staleTime: 5 * 60 * 1000,
  });

  const hoursText = storeHours
    ? buildHoursDisplay(storeHours as Record<string, { open: boolean; openTime: string; closeTime: string }>)
    : 'Mon-Sat 7:00 AM - 6:00 PM · Sun 1:00 PM - 6:00 PM';

  return (
    <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 mt-4">
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-gray-600">
          <Clock className="w-4 h-4 flex-shrink-0 text-gray-400" />
          <span className="text-xs">{hoursText}</span>
        </div>
        <div className="flex items-center space-x-2 text-gray-600">
          <Phone className="w-4 h-4 flex-shrink-0 text-gray-400" />
          <a href="tel:318-323-6090" className="text-xs text-brand-blue hover:underline font-medium">
            318-323-6090
          </a>
        </div>
        <div className="flex items-center space-x-2 text-gray-600">
          <MapPin className="w-4 h-4 flex-shrink-0 text-gray-400" />
          <a
            href="https://www.google.com/maps/search/?api=1&query=Animal+House+Pet+Store+2934+Cypress+St+West+Monroe+LA+71291"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-blue hover:underline font-medium"
          >
            Animal House Pet Store
          </a>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2 border-t border-gray-200 mt-2">
          <a href="/privacy-policy" className="text-xs text-gray-500 hover:text-brand-blue hover:underline">
            Privacy Policy
          </a>
          <span className="text-gray-300">•</span>
          <a href="/terms-of-service" className="text-xs text-gray-500 hover:text-brand-blue hover:underline">
            Terms of Service
          </a>
        </div>
      </div>
    </div>
  );
}
