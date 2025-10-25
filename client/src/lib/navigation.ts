export function safeGoBack() {
  if (window.history.length <= 1) {
    window.location.href = '/';
    return;
  }

  const authPages = ['/auth', '/login', '/', '/landing'];
  const currentPath = window.location.pathname;
  
  const previousEntries = window.performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  const navigationEntry = previousEntries[0];
  
  if (navigationEntry) {
    try {
      const referrerUrl = new URL(document.referrer);
      const referrerPath = referrerUrl.pathname;
      
      if (authPages.includes(referrerPath) && currentPath !== '/') {
        window.location.href = '/';
        return;
      }
    } catch (e) {
    }
  }
  
  window.history.back();
}
