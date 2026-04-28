/**
 * Returns the canonical public base URL for this deployment.
 *
 * REPLIT_DOMAINS is a comma-separated list, e.g.:
 *   "animalhouseexperience.replit.app,animalhousepetstore.com"
 *
 * We prefer the custom domain (anything that is NOT a *.replit.app / *.replit.dev
 * subdomain) so that links sent in emails always use the production custom domain.
 * If no custom domain is configured we fall back to the first domain in the list,
 * and in local development we fall back to http://localhost:5000.
 */
export function getBaseUrl(): string {
  const raw = process.env.REPLIT_DOMAINS || '';
  const domains = raw.split(',').map(d => d.trim()).filter(Boolean);

  // Prefer a custom domain over the default replit subdomains
  const customDomain = domains.find(
    d => !d.includes('.replit.app') && !d.includes('.replit.dev')
  );

  const domain = customDomain || domains[0];
  return domain ? `https://${domain}` : 'http://localhost:5000';
}
