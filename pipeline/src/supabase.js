import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { log } from './util.js';

/**
 * Supabase ড্রাইভার — @supabase/supabase-js ব্যবহার করছি না ইচ্ছাকৃতভাবে।
 * আমাদের দরকার মোটে upsert, select আর ফাইল আপলোড; PostgREST ও Storage
 * দুটোই সাধারণ REST। একটা নির্ভরতা কম রাখলে CI-তে ইনস্টলও দ্রুত হয়।
 */

export const supabaseEnabled = () => Boolean(config.supabase.url && config.supabase.serviceKey);

function headers(extra = {}) {
  const key = config.supabase.serviceKey;
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

async function rest(pathname, { method = 'GET', body, prefer, query = '' } = {}) {
  const url = `${config.supabase.url}/rest/v1/${pathname}${query}`;
  const res = await fetch(url, {
    method,
    headers: headers({
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    }),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${method} ${pathname} → ${res.status} ${text.slice(0, 160)}`);
  }
  // 204 বা খালি বডিতে json() ছুঁড়ে বসে
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const CONTENT_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/**
 * ফাইল আপলোড করে পাবলিক URL ফেরত দেয়।
 * upsert: true — একই স্ল্যাগে আবার চালালে যেন ব্যর্থ না হয়ে বদলে যায়।
 */
export async function uploadFile(bucket, objectName, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const body = await fs.readFile(filePath);

  const res = await fetch(
    `${config.supabase.url}/storage/v1/object/${bucket}/${encodeURIComponent(objectName)}`,
    {
      method: 'POST',
      headers: headers({ 'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream', 'x-upsert': 'true' }),
      body,
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Storage আপলোড ব্যর্থ (${bucket}/${objectName}): ${res.status} ${text.slice(0, 120)}`);
  }
  return `${config.supabase.url}/storage/v1/object/public/${bucket}/${encodeURIComponent(objectName)}`;
}

export async function upsertArticle(article) {
  await rest('articles', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [article],
  });
}

/** আগের রানগুলোতে দেখা লিংক। খুব পুরোনো এন্ট্রি টানার দরকার নেই। */
export async function fetchSeenLinks({ days = 14, limit = 5000 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = await rest('seen_links', {
    query: `?select=url&seen_at=gte.${since}&order=seen_at.desc&limit=${limit}`,
  });
  return new Set((rows ?? []).map((r) => r.url));
}

export async function saveSeenLinks(urls) {
  if (!urls.length) return;
  // এক অনুরোধে অনেক সারি — টুকরো করে পাঠাই, নাহলে বড় বডিতে আটকায়
  const CHUNK = 500;
  for (let i = 0; i < urls.length; i += CHUNK) {
    await rest('seen_links', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: urls.slice(i, i + CHUNK).map((url) => ({ url })),
    });
  }
}

export async function fetchRecentHeadlines({ limit = 300 } = {}) {
  const rows = await rest('recent_headlines', {
    query: `?select=headline&order=created_at.desc&limit=${limit}`,
  });
  return (rows ?? []).map((r) => r.headline);
}

export async function saveHeadlines(headlines) {
  if (!headlines.length) return;
  await rest('recent_headlines', {
    method: 'POST',
    prefer: 'return=minimal',
    body: headlines.map((headline) => ({ headline })),
  });
}

/**
 * পুরোনো শিরোনাম ছেঁটে ফেলা। পড়া হয় কেবল শেষ ৩০০টি, তাই তার চেয়ে
 * পুরোনোগুলো রেখে দেওয়ার কোনো মানে নেই — লোকাল ফাইলে ছাঁটাই হলেও
 * ডেটাবেসে হচ্ছিল না, ফলে সারি জমতেই থাকত।
 */
export async function pruneHeadlines({ keepDays = 30 } = {}) {
  const cutoff = new Date(Date.now() - keepDays * 86400000).toISOString();
  await rest('recent_headlines', {
    method: 'DELETE',
    prefer: 'return=minimal',
    query: `?created_at=lt.${cutoff}`,
  });
}

/** ১৪ দিনের পুরোনো seen_link আর পড়াই হয় না (fetchSeenLinks-এর সীমা) */
export async function pruneSeenLinks({ keepDays = 21 } = {}) {
  const cutoff = new Date(Date.now() - keepDays * 86400000).toISOString();
  await rest('seen_links', {
    method: 'DELETE',
    prefer: 'return=minimal',
    query: `?seen_at=lt.${cutoff}`,
  });
}

export async function markPostedToFacebook(slug, postId) {
  await rest('articles', {
    method: 'PATCH',
    prefer: 'return=minimal',
    query: `?slug=eq.${encodeURIComponent(slug)}`,
    body: { facebook_post_id: postId, facebook_posted_at: new Date().toISOString() },
  });
}

/** টেবিল আছে কিনা — স্কিমা না চালিয়ে পাইপলাইন চালালে বোধগম্য বার্তা দিতে */
export async function checkSchema() {
  try {
    await rest('articles', { query: '?select=slug&limit=1' });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

export { log };
