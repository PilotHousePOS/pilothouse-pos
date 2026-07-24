import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

const DEFAULT_CONTENT = `<p class="text-xs text-gray-500">Last Updated: July 24, 2026</p>

<h2>1. Acceptance of Terms</h2>
<p>By accessing or using the PilotHouse platform, website, or any associated applications (the "Service"), you ("Subscriber," "you," or "your") agree to be bound by these Terms of Service ("Terms"). If you are accepting these Terms on behalf of a business or other legal entity, you represent that you have the authority to bind that entity. If you do not agree, do not use the Service.</p>

<h2>2. Description of Service</h2>
<p>PilotHouse is a white-label business management platform that provides small businesses with tools including point-of-sale (POS), inventory management, loyalty reward programs, appointment and service booking, customer management, and business reporting. Access to the Service is provided on a subscription basis.</p>

<h2>3. Account Registration</h2>
<ul>
<li>You must provide accurate, complete, and current information when registering an account.</li>
<li>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.</li>
<li>You must be at least 18 years old and legally authorized to enter into contracts on behalf of your business.</li>
<li>You agree to notify us immediately of any unauthorized use of your account.</li>
<li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
</ul>

<h2>4. Subscriptions and Billing</h2>
<ul>
<li>Access to PilotHouse requires a paid subscription after the free trial period ends.</li>
<li>Subscription fees are billed in advance on a monthly or annual basis as selected at signup.</li>
<li>All fees are in US Dollars and are non-refundable except as required by law or as expressly stated in these Terms.</li>
<li>A 14-day free trial is offered to new accounts. No credit card is required to begin a trial.</li>
<li>We reserve the right to change subscription pricing with at least 30 days' notice to active subscribers.</li>
<li>Failure to pay may result in suspension or termination of your account and loss of access to your data.</li>
<li>All payment transactions are processed securely through Stripe.</li>
</ul>

<h2>5. Platform Use and Acceptable Use</h2>
<ul>
<li>You may use the Service only for lawful business purposes and in accordance with these Terms.</li>
<li>You may not use the Service to transmit spam, engage in fraudulent transactions, or violate any applicable laws or regulations.</li>
<li>You are solely responsible for the accuracy of data you enter into the platform, including product listings, pricing, customer records, and appointment information.</li>
<li>You may not attempt to reverse engineer, decompile, or extract the source code of the Service.</li>
<li>You may not resell, sublicense, or transfer access to the Service to third parties without our written consent.</li>
</ul>

<h2>6. Tenant Data and Content</h2>
<ul>
<li>You retain full ownership of all business data, customer records, and content you input into the Service ("Tenant Data").</li>
<li>By using the Service, you grant PilotHouse a limited license to store, process, and display your Tenant Data solely as necessary to provide the Service.</li>
<li>PilotHouse will not sell or share your Tenant Data with third parties except as required to operate the Service (e.g., payment processing, email delivery) or as required by law.</li>
<li>You are responsible for ensuring that your collection and use of customer data through the platform complies with all applicable privacy laws.</li>
</ul>

<h2>7. Appointments and Service Bookings</h2>
<ul>
<li>The appointment and booking features are tools provided to help you manage your own service scheduling.</li>
<li>PilotHouse is not a party to any service agreement between you and your customers.</li>
<li>Appointment availability, pricing, and confirmation are entirely within your control as a Subscriber.</li>
<li>Automated reminders and notifications are sent on your behalf using the contact information your customers have provided.</li>
</ul>

<h2>8. Loyalty Rewards Program</h2>
<ul>
<li>The loyalty rewards feature allows you to configure and operate a points-based rewards program for your customers.</li>
<li>You are responsible for setting loyalty credit values, redemption rules, and communicating program terms to your customers.</li>
<li>PilotHouse is not responsible for disputes between you and your customers regarding loyalty credits.</li>
<li>We reserve the right to modify platform features supporting loyalty programs with reasonable notice.</li>
</ul>

<h2>9. Communications</h2>
<p>By creating an account, you agree to receive:</p>
<ul>
<li><strong>Transactional messages:</strong> Account confirmations, billing receipts, subscription notices, and security alerts. These cannot be opted out of.</li>
<li><strong>Platform updates:</strong> Feature announcements and service notifications. You may manage preferences in your account settings.</li>
<li><strong>SMS messages:</strong> If you provide a phone number. You may opt out by replying STOP.</li>
</ul>

<h2>10. Uptime and Service Availability</h2>
<p>PilotHouse strives for high availability but does not guarantee uninterrupted access to the Service. Scheduled maintenance, updates, and events outside our control may cause temporary downtime. We will make reasonable efforts to notify Subscribers of planned maintenance in advance.</p>

<h2>11. Intellectual Property</h2>
<p>All content, software, trademarks, and technology comprising the PilotHouse platform are the property of PilotHouse or its licensors and are protected by applicable intellectual property laws. These Terms do not grant you any rights to our intellectual property beyond the limited license to use the Service as described herein.</p>

<h2>12. Disclaimer of Warranties</h2>
<p>The Service is provided "as is" and "as available" without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Service will be error-free or uninterrupted.</p>

<h2>13. Limitation of Liability</h2>
<p>To the maximum extent permitted by law, PilotHouse shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service, including loss of profits, data, or business opportunities. Our total aggregate liability shall not exceed the total fees you paid to PilotHouse in the 12 months preceding the claim.</p>

<h2>14. Termination</h2>
<ul>
<li>You may cancel your subscription at any time through your account settings.</li>
<li>Upon cancellation, your access to the Service will continue through the end of the current billing period.</li>
<li>We may terminate or suspend your account for material violation of these Terms, non-payment, or conduct that harms the platform or other users.</li>
<li>Upon termination, you may request an export of your Tenant Data within 30 days. After that period, data may be permanently deleted.</li>
</ul>

<h2>15. Governing Law</h2>
<p>These Terms shall be governed by and construed in accordance with the laws of the State of Louisiana, without regard to conflict of law principles. Any disputes shall be resolved in the courts of Ouachita Parish, Louisiana.</p>

<h2>16. Changes to Terms</h2>
<p>We reserve the right to modify these Terms at any time. We will provide at least 14 days' notice of material changes via email or an in-app notice. Continued use of the Service after the effective date constitutes acceptance of the updated Terms.</p>

<h2>17. Contact Us</h2>
<p>If you have questions about these Terms, please contact us through the Support page within the app.</p>`;

export default function TermsOfService() {
  const [, navigate] = useLocation();

  const { data: page } = useQuery<{ content: string; title: string; updatedAt: string }>({
    queryKey: ['/api/legal', 'terms-of-service'],
    queryFn: async () => {
      const res = await fetch('/api/legal/terms-of-service');
      if (!res.ok) return null;
      return res.json();
    },
  });

  const content = page?.content || DEFAULT_CONTENT;

  return (
    <div className="w-full min-h-screen bg-white pb-20">
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
