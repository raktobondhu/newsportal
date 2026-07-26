import { getAllArticles, getCategories } from '../lib/articles.js';

export const revalidate = 300;

const BASE = (process.env.SITE_URL || '').replace(/\/$/, '');

export default async function sitemap() {
  const articles = await getAllArticles();

  return [
    { url: `${BASE}/`, lastModified: new Date(), changeFrequency: 'hourly', priority: 1 },
    ...(await getCategories()).map((c) => ({
      url: `${BASE}/category/${encodeURIComponent(c.name)}`,
      changeFrequency: 'hourly',
      priority: 0.7,
    })),
    ...articles.map((a) => ({
      url: `${BASE}/news/${a.slug}`,
      lastModified: new Date(a.publishedAt),
      changeFrequency: 'daily',
      priority: 0.8,
    })),
  ];
}
