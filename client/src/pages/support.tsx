import { ArrowLeft, Phone, Mail, MapPin, Clock, MessageCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function Support() {
  const [, setLocation] = useLocation();

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen">
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/")} className="p-1 rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Support &amp; Help</h1>
      </div>

      <div className="px-4 py-6 space-y-6">
        <div className="text-center pb-2">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <MessageCircle className="w-8 h-8 text-purple-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">How Can We Help?</h2>
          <p className="text-sm text-gray-600 mt-1">We're here for you — reach out any way that works best for you.</p>
        </div>

        {/* Contact Info */}
        <div className="bg-purple-50 rounded-xl p-4 space-y-4">
          <h3 className="font-semibold text-gray-900">Contact Us</h3>

          <a href="tel:+13188554928" className="flex items-center gap-3 text-gray-700 hover:text-purple-600">
            <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
              <Phone className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <div className="font-medium text-sm">Phone</div>
              <div className="text-sm text-gray-600">(318) 855-4928</div>
            </div>
          </a>

          <a href="mailto:support@pilothouse.app" className="flex items-center gap-3 text-gray-700 hover:text-purple-600">
            <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
              <Mail className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <div className="font-medium text-sm">Email</div>
              <div className="text-sm text-gray-600">Contact via email</div>
            </div>
          </a>

          <div className="flex items-center gap-3 text-gray-700">
            <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
              <MapPin className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <div className="font-medium text-sm">Address</div>
              <div className="text-sm text-gray-600">2934 Cypress St, West Monroe, LA 71291</div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-gray-700">
            <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
              <Clock className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <div className="font-medium text-sm">Store Hours</div>
              <div className="text-sm text-gray-600">Mon–Sat: 10:00 AM – 6:00 PM</div>
              <div className="text-sm text-gray-600">Sunday: Closed</div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">Frequently Asked Questions</h3>

          {[
            {
              q: "How do I book a grooming appointment?",
              a: "Open the app, tap 'Book' in the bottom navigation, and follow the steps to choose your pet, service, groomer, and date.",
            },
            {
              q: "How do I cancel or reschedule an appointment?",
              a: "Go to 'My Appointments' in the app to view and manage your upcoming appointments, or call us directly.",
            },
            {
              q: "How does the loyalty rewards program work?",
              a: "You earn points on every qualifying purchase. Redeem them for discounts on future orders. View your balance on your Profile page.",
            },
            {
              q: "Can I order products online for pickup?",
              a: "Yes! Browse our Supplies section, add items to your cart, and complete checkout. In-store pickup is available.",
            },
            {
              q: "How do I reset my password?",
              a: "On the login screen, tap 'Forgot Password' and enter your email. You'll receive a reset link shortly.",
            },
            {
              q: "Who can I contact about a charge or refund?",
              a: "Please call or email us directly and we'll resolve any billing questions as quickly as possible.",
            },
          ].map((item, i) => (
            <div key={i} className="border border-gray-200 rounded-xl p-4">
              <div className="font-medium text-sm text-gray-900 mb-1">{item.q}</div>
              <div className="text-sm text-gray-600">{item.a}</div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 text-center pb-4">
          PilotHouse
        </p>
      </div>
    </div>
  );
}
