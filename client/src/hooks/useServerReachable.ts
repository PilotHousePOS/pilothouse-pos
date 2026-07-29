// ─── Server Reachability Hook ─────────────────────────────────────────────────
// Polls the server health endpoint every 10 seconds and returns whether the
// server is currently reachable.
//
// Only meaningful in the Electron desktop app: the web app handles offline
// state via the service worker and navigator.onLine.  In the Electron shell the
// page is loaded from a remote server, so a dropped connection means a broken
// app — staff need an explicit "Server unreachable — reconnecting…" banner.

import { useState, useEffect, useRef } from 'react';

const POLL_INTERVAL_MS   = 10_000; // check every 10 seconds
const INITIAL_CHECK_MS   = 1_500;  // first check shortly after mount
const HEALTH_ENDPOINT    = '/health';
const FETCH_TIMEOUT_MS   = 5_000;  // give up after 5 s

export interface ServerReachableState {
  reachable: boolean;
  /** True while the very first check is still in-flight (avoids a flash of the error banner on load). */
  checking:  boolean;
}

/**
 * Returns the server reachability state.
 *
 * Always returns `{ reachable: true, checking: false }` outside of Electron
 * (web browsers handle connectivity differently via navigator.onLine).
 */
export function useServerReachable(): ServerReachableState {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  // Outside Electron the hook is a no-op
  const [state, setState] = useState<ServerReachableState>({
    reachable: true,
    checking:  isElectron, // start as "checking" in Electron until first probe
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isElectron) return;

    let mounted = true;

    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout    = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const resp       = await fetch(HEALTH_ENDPOINT, {
          signal: controller.signal,
          cache:  'no-store',
        });
        clearTimeout(timeout);
        if (!mounted) return;
        setState({ reachable: resp.ok, checking: false });
      } catch {
        if (!mounted) return;
        setState({ reachable: false, checking: false });
      } finally {
        if (mounted) {
          timerRef.current = setTimeout(check, POLL_INTERVAL_MS);
        }
      }
    };

    // Run the first check shortly after mount (gives the app time to render before
    // potentially showing the banner)
    timerRef.current = setTimeout(check, INITIAL_CHECK_MS);

    return () => {
      mounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isElectron]);

  return state;
}
