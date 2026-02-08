const STORAGE_KEY = 'recently_viewed_products';
const MAX_ITEMS = 10;

interface RecentlyViewedItem {
  id: number;
  viewedAt: number;
}

export function addRecentlyViewed(productId: number) {
  const items = getRecentlyViewedIds();
  const filtered = items.filter(item => item.id !== productId);
  filtered.unshift({ id: productId, viewedAt: Date.now() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_ITEMS)));
}

export function getRecentlyViewedIds(): RecentlyViewedItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function clearRecentlyViewed() {
  localStorage.removeItem(STORAGE_KEY);
}
