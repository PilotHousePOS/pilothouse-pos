// ─── Server Unreachable Banner ────────────────────────────────────────────────
// Shown in the Electron desktop app when the PilotHouse server cannot be
// reached (network outage, server restart, etc.).
// Invisible in the web browser — web apps handle offline state differently.

import { WifiOff, RefreshCw } from 'lucide-react';
import { useServerReachable }  from '@/hooks/useServerReachable';

interface Props { className?: string }

export function ServerUnreachableBanner({ className = '' }: Props) {
  const { reachable, checking } = useServerReachable();

  // Always hidden in web browser context
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  if (!isElectron) return null;

  // Still checking — don't flash the error banner yet
  if (checking) return null;

  // Server is reachable — nothing to show
  if (reachable) return null;

  return (
    <div
      className={`flex items-center gap-2 bg-orange-900 border-b border-orange-800 px-4 py-2 text-white text-xs select-none ${className}`}
      role="alert"
    >
      <WifiOff className="h-3.5 w-3.5 flex-shrink-0 text-orange-300" />
      <span className="font-bold text-orange-200">Server unreachable</span>
      <span className="text-orange-300">
        — PilotHouse cannot connect to the server. Check your internet connection.
        Retrying automatically…
      </span>
      <RefreshCw className="h-3 w-3 ml-auto text-orange-400 animate-spin" />
    </div>
  );
}
