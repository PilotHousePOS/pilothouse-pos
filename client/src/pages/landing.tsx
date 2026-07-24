import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, Briefcase, ShoppingCart, Calendar, BarChart3, Users, Star, Package, CheckCircle, LogIn } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

export default function Landing() {
  const [, setLocation] = useLocation();

  const { data: hiringData } = useQuery<{ open: boolean }>({
    queryKey: ['/api/settings/hiring-open'],
  });
  const hiringOpen = hiringData?.open ?? false;

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white overflow-x-hidden">
      {/* Animated background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-brand-red/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-60 right-10 w-72 h-72 bg-brand-blue/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-40 left-1/3 w-56 h-56 bg-purple-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-brand-blue to-brand-red rounded-xl flex items-center justify-center shadow-lg border border-white/20">
            <span className="text-sm font-black text-white">PH</span>
          </div>
          <span className="text-xl font-black text-white tracking-wide">PILOTHOUSE</span>
        </div>
        <nav className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => setLocation('/auth')}
            className="text-white/80 hover:text-white hover:bg-white/10 font-semibold"
          >
            <LogIn className="w-4 h-4 mr-1.5" />
            Sign In
          </Button>
          <Button
            onClick={() => setLocation('/signup')}
            className="bg-gradient-to-r from-brand-red to-brand-blue hover:from-red-600 hover:to-blue-600 text-white font-bold px-5 py-2 rounded-xl shadow-lg border border-white/20"
          >
            Start Free Trial
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 text-center px-6 pt-16 pb-20 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6 text-sm font-semibold text-white/80">
          <Sparkles className="w-4 h-4 text-brand-orange" />
          14-day free trial — no credit card required
        </div>
        <h1 className="text-5xl md:text-6xl font-black mb-6 leading-tight">
          <span className="bg-gradient-to-r from-red-400 via-pink-300 to-blue-400 bg-clip-text text-transparent">
            Your Business,
          </span>
          <br />
          <span className="text-white drop-shadow-lg">Fully Equipped.</span>
        </h1>
        <p className="text-xl text-gray-200 max-w-2xl mx-auto mb-10 leading-relaxed">
          PilotHouse gives small businesses everything they need — POS, inventory, loyalty rewards, service bookings, and powerful reporting — all in one platform.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            onClick={() => setLocation('/signup')}
            size="lg"
            className="bg-gradient-to-r from-brand-red to-brand-blue hover:from-red-600 hover:to-blue-600 text-white px-10 py-6 text-lg font-black rounded-2xl shadow-2xl border border-white/20 transform hover:scale-105 transition-all duration-200"
          >
            Start Free Trial
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => setLocation('/auth')}
            size="lg"
            className="text-white/70 hover:text-white hover:bg-white/10 px-8 py-6 text-lg font-semibold rounded-2xl"
          >
            Sign In to Your Account
          </Button>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="relative z-10 px-6 pb-20 max-w-5xl mx-auto">
        <h2 className="text-center text-3xl font-black text-white mb-3">Everything you need to run your business</h2>
        <p className="text-center text-gray-400 mb-12">One platform. No juggling five different tools.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: ShoppingCart,
              color: 'from-brand-blue to-blue-700',
              title: 'Point of Sale',
              desc: 'Fast checkout with inventory sync, receipt printing, and cash drawer support.',
            },
            {
              icon: Package,
              color: 'from-green-600 to-emerald-700',
              title: 'Inventory',
              desc: 'Track stock levels, set low-stock alerts, and import products in bulk.',
            },
            {
              icon: Star,
              color: 'from-brand-red to-red-700',
              title: 'Loyalty Rewards',
              desc: 'Keep customers coming back with automatic points and reward programs.',
            },
            {
              icon: Calendar,
              color: 'from-purple-600 to-purple-800',
              title: 'Appointments',
              desc: 'Service bookings with automated reminders and groomer scheduling.',
            },
            {
              icon: BarChart3,
              color: 'from-brand-orange to-orange-700',
              title: 'Reporting',
              desc: 'Daily sales reports, revenue trends, and top-product insights delivered automatically.',
            },
            {
              icon: Users,
              color: 'from-pink-600 to-rose-700',
              title: 'Team Management',
              desc: 'Manage staff roles, admin access, and permissions from one place.',
            },
          ].map(({ icon: Icon, color, title, desc }) => (
            <div
              key={title}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 hover:border-white/20 transition-all duration-200 group"
            >
              <div className={`w-12 h-12 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-200`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social Proof */}
      <section className="relative z-10 px-6 pb-20 max-w-4xl mx-auto">
        <div className="bg-white/5 border border-white/10 rounded-3xl p-10 text-center">
          <div className="flex justify-center gap-2 mb-4">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-6 h-6 text-yellow-400 fill-yellow-400" />
            ))}
          </div>
          <blockquote className="text-xl text-white font-medium mb-4 max-w-xl mx-auto">
            "PilotHouse replaced three separate tools and saved us hours every week. The POS and loyalty program alone paid for it in the first month."
          </blockquote>
          <p className="text-gray-400 text-sm font-semibold">— Small business owner, joined 2024</p>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="relative z-10 px-6 pb-20 max-w-3xl mx-auto">
        <h2 className="text-center text-3xl font-black text-white mb-3">Simple, transparent pricing</h2>
        <p className="text-center text-gray-400 mb-10">Start free for 14 days. No credit card required.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {[
            {
              name: 'Starter',
              price: '$49',
              features: ['POS & Inventory', 'Loyalty Program', 'Online Store', 'Appointments', 'Basic Reports'],
              highlight: false,
            },
            {
              name: 'Pro',
              price: '$99',
              features: ['Everything in Starter', 'Advanced Analytics', 'AI Invoice Scanning', 'Priority Support', 'Multi-user Management'],
              highlight: true,
            },
          ].map(({ name, price, features, highlight }) => (
            <div
              key={name}
              className={`rounded-2xl p-6 border ${highlight ? 'bg-gradient-to-br from-brand-blue/20 to-brand-red/20 border-brand-blue/40' : 'bg-white/5 border-white/10'}`}
            >
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-black text-white">{price}</span>
                <span className="text-gray-400">/mo</span>
              </div>
              <div className="text-lg font-bold text-white mb-4">{name}</div>
              <ul className="space-y-2">
                {features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Button
            onClick={() => setLocation('/signup')}
            size="lg"
            className="bg-gradient-to-r from-brand-red to-brand-blue hover:from-red-600 hover:to-blue-600 text-white px-10 py-6 text-lg font-black rounded-2xl shadow-2xl border border-white/20"
          >
            Start Your Free 14-Day Trial
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* Now Hiring Banner */}
      {hiringOpen && (
        <div className="relative z-10 max-w-3xl mx-auto px-6 pb-8">
          <div
            className="bg-black/50 border border-red-600 rounded-2xl p-4 flex items-center gap-4 cursor-pointer active:scale-95 transition-transform"
            onClick={() => window.location.href = '/apply'}
          >
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-white font-bold text-sm">Now Hiring!</span>
                <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">Apply Now</span>
              </div>
              <p className="text-white/60 text-xs">Join the PilotHouse team — tap to apply.</p>
            </div>
            <ArrowRight className="w-4 h-4 text-red-500 flex-shrink-0" />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 px-6 py-8 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-brand-blue to-brand-red rounded-lg flex items-center justify-center">
              <span className="text-xs font-black text-white">PH</span>
            </div>
            <span className="text-sm font-bold text-white/70">PilotHouse</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-white/50">
            <a href="/privacy-policy" className="hover:text-white/80 transition-colors">Privacy Policy</a>
            <span>•</span>
            <a href="/terms-of-service" className="hover:text-white/80 transition-colors">Terms of Service</a>
            <span>•</span>
            <a href="/support" className="hover:text-white/80 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
