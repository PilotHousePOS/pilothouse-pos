import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

const DEFAULT_CONTENT = `<p class="text-xs text-gray-500">Last Updated: February 10, 2026</p>

<h2>1. Introduction</h2>
<p>PilotHouse ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and mobile application (the "Service").</p>

<h2>2. Information We Collect</h2>
<p><strong>Personal Information:</strong></p>
<ul>
<li>Name, email address, and phone number when you create an account</li>
<li>Pet information (name, breed, type) when you add pets to your profile</li>
<li>Payment information processed securely through Stripe (we do not store card numbers)</li>
<li>Order history and grooming appointment records</li>
<li>Communication preferences (email and SMS opt-in/opt-out)</li>
</ul>
<p><strong>Automatically Collected Information:</strong></p>
<ul>
<li>Device information and browser type</li>
<li>Push notification subscription data (if you opt in)</li>
<li>Usage data such as pages visited and features used</li>
</ul>

<h2>3. How We Use Your Information</h2>
<ul>
<li>To process orders and manage your account</li>
<li>To schedule and manage grooming appointments</li>
<li>To send transactional emails (order confirmations, appointment updates, password resets)</li>
<li>To send marketing communications (only with your consent; you may opt out at any time)</li>
<li>To send abandoned cart reminders (you may opt out of these)</li>
<li>To send SMS notifications about order and appointment status</li>
<li>To manage our loyalty rewards program</li>
<li>To improve our services and customer experience</li>
</ul>

<h2>4. Payment Processing</h2>
<p>All payment transactions are processed through Stripe, a PCI-compliant payment processor. We do not store your full credit card number, expiration date, or CVV on our servers. Please review <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe's Privacy Policy</a> for information about how they handle your payment data.</p>

<h2>5. Communication Preferences</h2>
<p>You can manage your communication preferences at any time through your Profile page:</p>
<ul>
<li><strong>Marketing Emails:</strong> Opt out via your profile settings or the unsubscribe link in any marketing email.</li>
<li><strong>SMS Notifications:</strong> Reply STOP to any text message to opt out.</li>
<li><strong>Push Notifications:</strong> Manage through your browser or device settings.</li>
<li><strong>Transactional Messages:</strong> Order confirmations and appointment updates cannot be opted out of as they are necessary for service delivery.</li>
</ul>

<h2>6. Data Sharing</h2>
<p>We do not sell your personal information. We may share your data with:</p>
<ul>
<li><strong>Stripe:</strong> For payment processing</li>
<li><strong>SendGrid:</strong> For sending emails</li>
<li><strong>Twilio:</strong> For sending SMS messages</li>
<li><strong>Google Calendar:</strong> For appointment scheduling</li>
</ul>
<p>These service providers are bound by their own privacy policies and are only permitted to use your information as necessary to provide services to us.</p>

<h2>7. Data Security</h2>
<p>We implement appropriate technical and organizational security measures to protect your personal information, including encrypted connections (HTTPS), secure password hashing, and token-based authentication. However, no method of transmission over the internet is 100% secure.</p>

<h2>8. Data Retention</h2>
<p>We retain your personal information for as long as your account is active or as needed to provide services. You may request account deletion by contacting us. Order and appointment records may be retained for legal and business purposes.</p>

<h2>9. Children's Privacy</h2>
<p>Our Service is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe we have collected information from a child under 13, please contact us immediately.</p>

<h2>10. Changes to This Policy</h2>
<p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last Updated" date.</p>

<h2>11. Contact Us</h2>
<p>If you have questions about this Privacy Policy, please contact us through the Support page within the app.</p>`;

export default function PrivacyPolicy() {
  const [, navigate] = useLocation();

  const { data: page, isLoading } = useQuery<{ content: string; title: string; updatedAt: string }>({
    queryKey: ['/api/legal', 'privacy-policy'],
    queryFn: async () => {
      const res = await fetch('/api/legal/privacy-policy');
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
          <h1 className="text-lg font-bold">Privacy Policy</h1>
        </div>
      </div>

      <div
        className="p-4 text-sm text-gray-700 leading-relaxed legal-content"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}
