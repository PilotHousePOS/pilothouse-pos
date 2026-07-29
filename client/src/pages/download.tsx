import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Monitor, Download, ArrowLeft, CheckCircle2,
  Lock, Wifi, WifiOff, ShoppingCart, Calendar, Users,
  Package, Loader2, Construction,
} from "lucide-react";

interface DesktopDownloadInfo {
  version: string;
  windows: string | null;
  mac:     string | null;
  available: boolean;
  subscriptionStatus: string;
  subscriptionTier:   string;
}

// Simple Apple icon (not in lucide-react v0.x bundled here)
function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

export default function DownloadPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const currentUser = user as any;

  const isAdminOrOwner = !!(currentUser?.isAdmin || currentUser?.isSuperiorManager);

  const { data: info, isLoading } = useQuery<DesktopDownloadInfo>({
    queryKey: ["/api/download/desktop"],
    enabled: isAdminOrOwner,
  });

  const isActive      = ["active", "trial"].includes(info?.subscriptionStatus ?? "");
  const hasWindowsUrl = !!info?.windows;
  const hasMacUrl     = !!info?.mac;
  const hasAnyUrl     = hasWindowsUrl || hasMacUrl;

  if (!isAdminOrOwner) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-3">
        <Lock className="h-10 w-10 mx-auto text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-800">Admin access required</h2>
        <p className="text-sm text-gray-500">Only store owners and managers can download the desktop app.</p>
        <Button variant="outline" size="sm" onClick={() => setLocation("/")}>Go home</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-28">

      {/* Back navigation */}
      <button
        onClick={() => setLocation("/settings/billing")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Billing
      </button>

      {/* Page header */}
      <div className="text-center space-y-2 py-4">
        <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
          <Monitor className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">PilotHouse POS Desktop</h1>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          The full POS system installed on your hardware — loads instantly and works even when the internet is out.
        </p>
        {!isLoading && info?.version && (
          <Badge variant="outline" className="text-xs font-mono">v{info.version}</Badge>
        )}
      </div>

      {/* Subscription lock state */}
      {!isLoading && !isActive && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <Lock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-amber-800">Active subscription required</p>
              <p className="text-xs text-amber-700">
                The desktop app is included with all paid plans. Start a subscription to unlock downloads.
              </p>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => setLocation("/settings/billing")}
              >
                View Plans
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform download cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Windows */}
          <Card className={!isActive ? "opacity-60" : ""}>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                  <Monitor className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Windows</p>
                  <p className="text-xs text-gray-500">Windows 10 or later · x64 / x86</p>
                </div>
              </div>

              {!isActive ? (
                <Button disabled className="w-full gap-2 text-xs">
                  <Lock className="h-3.5 w-3.5" />
                  Subscription required
                </Button>
              ) : hasWindowsUrl ? (
                <a href={info!.windows!} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
                    <Download className="h-4 w-4" />
                    Download Installer (.exe)
                  </Button>
                </a>
              ) : (
                <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                  <Construction className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
                  Not yet built. Push a version tag on GitHub to trigger the CI build, then set <code className="font-mono bg-gray-100 px-0.5 rounded">WINDOWS_DOWNLOAD_URL</code> in Replit Secrets.
                </div>
              )}
            </CardContent>
          </Card>

          {/* macOS */}
          <Card className={!isActive ? "opacity-60" : ""}>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center shadow-sm">
                  <AppleIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">macOS</p>
                  <p className="text-xs text-gray-500">macOS 11 Big Sur+ · Intel & Apple Silicon</p>
                </div>
              </div>

              {!isActive ? (
                <Button disabled className="w-full gap-2 text-xs">
                  <Lock className="h-3.5 w-3.5" />
                  Subscription required
                </Button>
              ) : hasMacUrl ? (
                <a href={info!.mac!} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full gap-2 bg-gray-900 hover:bg-gray-800">
                    <Download className="h-4 w-4" />
                    Download Installer (.dmg)
                  </Button>
                </a>
              ) : (
                <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                  <Construction className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
                  Not yet built. Push a version tag on GitHub to trigger the CI build, then set <code className="font-mono bg-gray-100 px-0.5 rounded">MAC_DOWNLOAD_URL</code> in Replit Secrets.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* What works offline */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
            <WifiOff className="h-4 w-4 text-gray-500" />
            Works without internet
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { Icon: ShoppingCart, label: "Cash sales & receipts" },
              { Icon: Package,      label: "Browse all inventory" },
              { Icon: Calendar,     label: "View appointment schedule" },
              { Icon: Users,        label: "Customer & pet lookup" },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-sm text-gray-700">
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                <Icon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                {label}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
            <Wifi className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            Card payments always require internet · Data syncs automatically when back online
          </div>
        </CardContent>
      </Card>

      {/* Setup instructions shown when subscription is active but URLs not yet configured */}
      {!isLoading && isActive && !hasAnyUrl && (
        <Card className="border-blue-100 bg-blue-50">
          <CardContent className="p-4 space-y-1.5">
            <p className="text-sm font-semibold text-blue-800">How to publish download links</p>
            <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
              <li>Push a version tag to your repo: <code className="font-mono bg-blue-100 px-1 rounded">git tag v1.0.0 &amp;&amp; git push --tags</code></li>
              <li>GitHub Actions builds the Windows installer and macOS DMG automatically.</li>
              <li>In Replit → Secrets, add <code className="font-mono bg-blue-100 px-1 rounded">WINDOWS_DOWNLOAD_URL</code> and <code className="font-mono bg-blue-100 px-1 rounded">MAC_DOWNLOAD_URL</code> pointing to the GitHub Release asset URLs.</li>
              <li>Redeploy — the download buttons will appear instantly.</li>
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Footer note */}
      <p className="text-xs text-gray-400 text-center">
        The desktop app connects to your PilotHouse subscription. Cancelling your plan locks the app on next launch.
      </p>

    </div>
  );
}
