import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function SmsConsent() {
  const [, navigate] = useLocation();

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen">
      <div className="bg-blue-800 text-white p-4 flex items-center gap-3">
        <button onClick={() => navigate("/")} className="text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-bold text-lg">SMS Messaging Consent</h1>
          <p className="text-blue-200 text-sm">PilotHouse</p>
        </div>
      </div>

      <div className="p-5 space-y-6 text-sm text-gray-700 leading-relaxed">
        <section>
          <h2 className="font-bold text-base text-gray-900 mb-2">SMS / Text Message Communications</h2>
          <p>
            PilotHouse sends SMS text messages to customers who have provided their mobile phone number
            and consented to receive text communications.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-base text-gray-900 mb-2">How We Collect Consent</h2>
          <p>Consent is collected at the following points:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              <strong>Account Registration</strong> — During sign-up, customers provide their
              phone number and acknowledge they may receive transactional SMS messages
              related to their orders and grooming appointments.
            </li>
            <li>
              <strong>Grooming Appointment Booking</strong> — When booking a grooming
              appointment, customers provide their phone number and agree to receive
              appointment status updates via text.
            </li>
            <li>
              <strong>Guest Booking</strong> — Customers who book as guests provide their
              phone number and agree to receive grooming status notifications for that
              appointment.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-base text-gray-900 mb-2">Types of Messages Sent</h2>
          <p>We send the following transactional SMS messages only — we do not send promotional or marketing texts:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Grooming appointment confirmation and status updates</li>
            <li>"Your pet is ready for pick-up" notifications</li>
            <li>Order status updates (order ready, out for delivery)</li>
            <li>Appointment reminders</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-base text-gray-900 mb-2">Message Frequency</h2>
          <p>
            Message frequency varies based on your activity. You will only receive a message
            when there is a relevant update to your appointment or order. Typically 1–3
            messages per appointment or order.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-base text-gray-900 mb-2">How to Opt Out</h2>
          <p>
            You can opt out at any time by replying <strong>STOP</strong> to any text message
            from us. After opting out, you will receive one final confirmation message and
            then no further SMS messages.
          </p>
          <p className="mt-2">
            You can also opt out by logging into your account, going to your Profile, and
            disabling SMS notifications in your communication preferences.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-base text-gray-900 mb-2">Help</h2>
          <p>
            Reply <strong>HELP</strong> to any text message for assistance, or contact us
            directly at <strong>(318) 322-3023</strong>.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-base text-gray-900 mb-2">Message & Data Rates</h2>
          <p>
            Message and data rates may apply depending on your mobile carrier and plan.
            PilotHouse does not charge for SMS messages; however, standard
            carrier rates may apply.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-base text-gray-900 mb-2">Carriers</h2>
          <p>
            Supported carriers include but are not limited to: AT&amp;T, Verizon, T-Mobile,
            Sprint, Boost, Cricket, MetroPCS, and most major US carriers. Carriers are not
            liable for delayed or undelivered messages.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-base text-gray-900 mb-2">Privacy</h2>
          <p>
            Your mobile number and consent status are stored securely and are never sold or
            shared with third parties for marketing purposes. For full details see our{" "}
            <a href="/privacy-policy" className="text-blue-600 underline">Privacy Policy</a>.
          </p>
        </section>

        <div className="border-t pt-4 text-xs text-gray-500">
          <p><strong>PilotHouse</strong></p>
          <p className="mt-1">Last Updated: June 2026</p>
        </div>
      </div>
    </div>
  );
}
