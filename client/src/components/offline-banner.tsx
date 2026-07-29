import { useEffect, useState } from 'react';
import { WifiOff, Wifi, Loader2 } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { countPendingOfflineSales } from '@/lib/offline-db';

interface Props { className?: string }

/**
 * Persistent banner that appears whenever the device goes offline.
 *
 * Tracks two independent queues:
 *  • IndexedDB offline sales (POS cash sales queued while offline)
 *  • Local-store mutation queue (other writes queued in the Electron main
 *    process — appointment updates, supply adjustments, etc.)
 *
 * - Red bar while offline: shows combined queued count, tells staff cash-only.
 * - Green bar briefly after reconnect: shows sync progress / completion.
 * - Invisible when fully online with nothing pending.
 */
export function OfflineBanner({ className = '' }: Props) {
  const isOnline = useOnlineStatus();

  // ── IndexedDB pending sales ──────────────────────────────────────────────
  const [pendingSales, setPendingSales] = useState(0);

  useEffect(() => {
    const refresh = () => countPendingOfflineSales().then(setPendingSales).catch(() => {});
    refresh();
    const id = setInterval(refresh, 2_000);
    return () => clearInterval(id);
  }, []);

  // ── Electron local-store pending mutations ───────────────────────────────
  // Only available inside the Electron desktop app (window.electronAPI defined).
  const [pendingMutations, setPendingMutations] = useState(0);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // Load initial count
    api.getPendingMutationCount().then(setPendingMutations).catch(() => {});

    // Update whenever a new mutation is queued
    const unsubQ = api.onMutationQueued((count) => setPendingMutations(count));

    // Update (decrement) as mutations are drained on reconnect
    const unsubS = api.onMutationsSynced(() => {
      api.getPendingMutationCount().then(setPendingMutations).catch(() => {});
    });

    return () => { unsubQ(); unsubS(); };
  }, []);

  // Combined pending count shown in the banner
  const totalPending = pendingSales + pendingMutations;

  // ── "Back online" flash ──────────────────────────────────────────────────
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    if (isOnline) {
      setShowBack(true);
      const t = setTimeout(() => setShowBack(false), 6_000);
      return () => clearTimeout(t);
    } else {
      setShowBack(false);
    }
  }, [isOnline]);

  // ── Offline bar ───────────────────────────────────────────────────────────
  if (!isOnline) {
    return (
      <div className={`flex items-center gap-2 bg-red-900 border-b border-red-800 px-4 py-2 text-white text-xs select-none ${className}`}>
        <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="font-bold">Offline</span>
        <span className="text-red-300">
          — cash sales only. Card payments disabled. All changes sync automatically when connection returns.
        </span>
        {totalPending > 0 && (
          <span className="ml-auto bg-red-800 border border-red-600 px-2 py-0.5 rounded font-mono font-semibold whitespace-nowrap">
            {totalPending} queued
          </span>
        )}
      </div>
    );
  }

  // ── Back-online / syncing bar ─────────────────────────────────────────────
  if (showBack || totalPending > 0) {
    return (
      <div className={`flex items-center gap-2 bg-green-900 border-b border-green-800 px-4 py-2 text-white text-xs select-none ${className}`}>
        <Wifi className="h-3.5 w-3.5 flex-shrink-0 text-green-400" />
        <span className="font-bold text-green-300">Back online</span>
        {totalPending > 0 ? (
          <span className="text-green-300 flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Syncing {totalPending} queued {totalPending === 1 ? 'change' : 'changes'}…
          </span>
        ) : (
          <span className="text-green-400">All changes synced.</span>
        )}
      </div>
    );
  }

  return null;
}
