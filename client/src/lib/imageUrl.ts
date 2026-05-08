/**
 * Returns the correct URL for displaying a product image in an <img> tag.
 *
 * Some external CDNs (notably Colgate's pxmshare.colgatepalmolive.com) serve
 * PNG images with Content-Type: application/octet-stream instead of image/png.
 * Browsers refuse to render <img> tags whose response has that content-type,
 * showing a broken icon instead.
 *
 * This utility routes all external https:// image URLs through /api/image-proxy,
 * which fetches the upstream file, sniffs the real content-type from magic bytes,
 * and re-serves it with the correct headers.
 *
 * - Relative paths (/public-objects/, /stock-images/, etc.) are returned as-is
 *   because they are served directly by our own server with correct headers.
 * - blob: and data: URLs (local pastes/uploads) are returned as-is.
 */
export function getProductImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("/")) return url;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}
