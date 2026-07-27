import { useEffect, useState } from 'react';
import { WifiOff, Wifi, Loader2 } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { countPendingOfflineSales } from '@/lib/offline-db';

interface Props { className?: string }

/**
 * Persistent banner that appears whenever the device goes offline.
 * - Red bar while offline: tells staff only cash sales work, shows queued count.
 * - Green bar briefly after reconnect: confirms sync is in progress / complete.
 * - Invisible when fully online with nothing pending.
 */
export function OfflineBanner({ className = '' }: Props) {
  const isOnline              = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [showBack, setShowBack] = useState(false);

  // Poll pending count every 2 s so the number counts down as sales sync
  useEffect(() => {
    const refresh = () => countPendingOfflineSales().then(setPending).catch(() => {});
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, []);

  // Show "back online" bar for 6 s on reconnect
  useEffect(() => {
    if (isOnline) {
      setShowBack(true);
      const t = setTimeout(() => setShowBack(false), 6000);
      return () => clearTimeout(t);
    } else {
      setShowBack(false);
    }
  }, [isOnline]);

  // ── Offline ──
  if (!isOnline) {
    return (
      <div className={`flex items-center gap-2 bg-red-900 border-b border-red-800 px-4 py-2 text-white text-xs select-none ${className}`}>
        <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="font-bold">Offline</span>
        <span className="text-red-300">
          — cash sales only. Card payments disabled. Everything syncs automatically when connection returns.
        </span>
        {pending > 0 && (
          <span className="ml-auto bg-red-800 border border-red-600 px-2 py-0.5 rounded font-mono font-semibold whitespace-nowrap">
            {pending} queued
          </span>
        )}
      </div>
    );
  }

  // ── Back online / syncing ──
  if (showBack || pending > 0) {
    return (
      <div className={`flex items-center gap-2 bg-green-900 border-b border-green-800 px-4 py-2 text-white text-xs select-none ${className}`}>
        <Wifi className="h-3.5 w-3.5 flex-shrink-0 text-green-400" />
        <span className="font-bold text-green-300">Back online</span>
        {pending > 0 ? (
          <span className="text-green-300 flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Syncing {pending} offline {pending === 1 ? 'sale' : 'sales'}…
          </span>
        ) : (
          <span className="text-green-400">All sales synced.</span>
        )}
      </div>
    );
  }

  return null;
}
