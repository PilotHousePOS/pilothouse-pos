import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Startup diagnostic — fires on every app load so we get context data
// even before any component renders. Only runs on iOS to avoid noise.
if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
  const ua = navigator.userAgent;
  const iosMatch = ua.match(/OS (\d+[_\d]*)/);
  const iosVer = iosMatch ? iosMatch[1].replace(/_/g, '.') : 'n/a';
  fetch('/api/log/scanner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'app_start',
      platform: 'ios',
      ios: iosVer,
      secure: window.isSecureContext ? 1 : 0,
      standalone: (navigator as any).standalone ? 1 : 0,
      md: typeof (navigator as any).mediaDevices,
      fp: (document as any).featurePolicy?.allowsFeature?.('camera') ?? 'n/a',
      topFrame: window.top === window ? 1 : 0,
    }),
  }).catch(() => {});
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.update();
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
      
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('SW registered:', registration.scope);
      
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              window.location.reload();
            }
          });
        }
      });
    } catch (error) {
      console.log('SW registration failed:', error);
    }
  });
  
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
