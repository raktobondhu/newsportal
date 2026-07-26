const BASE = (process.env.SITE_URL || '').replace(/\/$/, '');

export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: BASE ? `${BASE}/sitemap.xml` : undefined,
  };
}
