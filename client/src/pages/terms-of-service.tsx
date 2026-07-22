import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

const DEFAULT_CONTENT = `<p class="text-xs text-gray-500">Last Updated: February 10, 2026</p>

<h2>1. Acceptance of Terms</h2>
<p>By accessing or using the PilotHouse website and mobile application (the "Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.</p>

<h2>2. Account Registration</h2>
<ul>
<li>You must provide accurate and complete information when creating an account.</li>
<li>You are responsible for maintaining the security of your account credentials.</li>
<li>You must be at least 18 years old to create an account and make purchases.</li>
<li>We reserve the right to suspend or terminate accounts that violate these terms.</li>
</ul>

<h2>3. Orders and Purchases</h2>
<ul>
<li>All orders are subject to availability and approval by our staff.</li>
<li>Prices are listed in US Dollars and are subject to applicable sales tax.</li>
<li>Orders must be picked up at our store location. We do not offer shipping at this time.</li>
<li>Payment is processed securely through Stripe at the time of order approval.</li>
<li>We reserve the right to refuse or cancel any order for any reason.</li>
</ul>

<h2>4. Live Animals</h2>
<ul>
<li>Live animals displayed on the Service are for viewing purposes only and cannot be purchased online.</li>
<li>To purchase a live animal, you must visit our store in person.</li>
<li>Animal availability is subject to change without notice.</li>
<li>We are committed to the ethical treatment and sale of all animals in our care.</li>
</ul>

<h2>5. Grooming Services</h2>
<ul>
<li>Grooming appointments are subject to availability and confirmation by our staff.</li>
<li>Appointments cannot be booked on Sundays or after 1:30 PM.</li>
<li>If you need to cancel or reschedule, please contact us as soon as possible.</li>
<li>Grooming prices vary based on pet size, breed, coat condition, and service selected.</li>
<li>We reserve the right to refuse service if a pet poses a safety risk to our staff.</li>
<li>Certain large breeds (Poodles, Doodles, German Shepherds, Large Mix Breeds) cannot be scheduled after 12:00 PM.</li>
</ul>

<h2>6. Loyalty Rewards</h2>
<ul>
<li>Loyalty credits are earned based on product purchases (excluding tax and fees).</li>
<li>Credits are applied to your account when orders are picked up.</li>
<li>Loyalty credits may be applied toward future purchases.</li>
<li>We reserve the right to modify or discontinue the loyalty program at any time.</li>
<li>Loyalty credits have no cash value and are non-transferable.</li>
</ul>

<h2>7. Refunds and Returns</h2>
<ul>
<li>Refund requests are handled on a case-by-case basis by our staff.</li>
<li>Refunds are processed back to the original payment method via Stripe.</li>
<li>Loyalty credits earned from refunded orders will be deducted from your account.</li>
<li>Please contact us directly for any return or refund inquiries.</li>
</ul>

<h2>8. Communications</h2>
<p>By creating an account, you agree to receive:</p>
<ul>
<li><strong>Transactional messages:</strong> Order confirmations, status updates, appointment notifications, and password resets. These cannot be opted out of.</li>
<li><strong>Marketing communications:</strong> Promotional offers and store updates. You may opt out at any time via your profile settings or the unsubscribe link in emails.</li>
<li><strong>SMS messages:</strong> If you provide a phone number. You may opt out by replying STOP.</li>
</ul>

<h2>9. Intellectual Property</h2>
<p>All content on the Service, including text, graphics, logos, images, and software, is the property of PilotHouse or its content suppliers and is protected by intellectual property laws. You may not reproduce, distribute, or create derivative works without our written consent.</p>

<h2>10. Limitation of Liability</h2>
<p>PilotHouse shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability shall not exceed the amount you paid for products or services in the preceding 12 months.</p>

<h2>11. Governing Law</h2>
<p>These Terms shall be governed by and construed in accordance with the laws of the State of Louisiana, without regard to conflict of law principles. Any disputes shall be resolved in the courts of Ouachita Parish, Louisiana.</p>

<h2>12. Changes to Terms</h2>
<p>We reserve the right to modify these Terms at any time. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>

<h2>13. Contact Us</h2>
<p>If you have questions about these Terms, please contact us through the Support page within the app.</p>`;

export default function TermsOfService() {
  const [, navigate] = useLocation();

  const { data: page, isLoading } = useQuery<{ content: string; title: string; updatedAt: string }>({
    queryKey: ['/api/legal', 'terms-of-service'],
    queryFn: async () => {
      const res = await fetch('/api/legal/terms-of-service');
      if (!res.ok) return null;
      return res.json();
    },
  });

  const content = page?.content || DEFAULT_CONTENT;

  return (
    <div className="min-h-screen bg-white pb-20">
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1 as any)} className="p-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Terms of Service</h1>
        </div>
      </div>

      <div
        className="p-4 text-sm text-gray-700 leading-relaxed legal-content"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}
