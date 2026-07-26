import crypto from 'node:crypto';
import { config } from './config.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** টাইমআউটসহ fetch — কোনো সোর্স ঝুলে গেলে যেন পুরো রান আটকে না যায় */
export async function httpGet(url, { asBuffer = false, timeout = config.limits.requestTimeoutMs, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': config.userAgent, 'Accept-Language': 'bn,en;q=0.8', ...headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (asBuffer) {
      return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || '' };
    }
    return { text: await res.text(), contentType: res.headers.get('content-type') || '' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * RSS-এর নোড কখনো স্ট্রিং, কখনো CDATA/অ্যাট্রিবিউটসহ অবজেক্ট।
 * এটা না সামলালে শিরোনামের জায়গায় '[object Object]' ছাপা হয় —
 * BBC বাংলার ফিডে ঠিক এটাই হয়েছিল।
 */
export function nodeText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return nodeText(node[0]);
  if (typeof node === 'object') return nodeText(node['#text'] ?? node['__cdata'] ?? '');
  return String(node).trim();
}

export function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export const hash = (s) => crypto.createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 12);

/** শিরোনামের মিল বের করার জন্য — যতি, উদ্ধৃতি, বাড়তি ফাঁক সরিয়ে দিই */
export function normalizeForCompare(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[‘’“”'",.!?;:()\[\]{}।—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * দুই শিরোনামের মিল (Jaccard) — একই খবর দুই সোর্সে এলে ধরার জন্য।
 *
 * আগে ভাগ করা হতো ছোট সেটের আকার দিয়ে। তাতে ছোট শিরোনাম বড়টার ভেতরে
 * পড়ে গেলেই স্কোর ১.০ হয়ে যেত — সম্পূর্ণ আলাদা খবরও "ডুপ্লিকেট" গণ্য
 * হয়ে নীরবে বাদ পড়ত। Jaccard-এ দুই দিকের শব্দই হিসাবে আসে।
 *
 * খুব ছোট শিরোনামে অনুপাত অর্থহীন, তাই ৩ শব্দের কম হলে ০।
 */
export function tokenOverlap(a, b) {
  const A = new Set(normalizeForCompare(a).split(' ').filter((w) => w.length > 2));
  const B = new Set(normalizeForCompare(b).split(' ').filter((w) => w.length > 2));
  if (A.size < 3 || B.size < 3) return 0;

  let common = 0;
  for (const w of A) if (B.has(w)) common++;

  const union = A.size + B.size - common;
  return union ? common / union : 0;
}

/** ০-৯ → ০-৯ বাংলা অঙ্ক */
export function toBengaliDigits(s) {
  const d = '০১২৩৪৫৬৭৮৯';
  return String(s).replace(/[0-9]/g, (c) => d[Number(c)]);
}

export function bengaliDate(date = new Date()) {
  const months = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  return `${toBengaliDigits(date.getDate())} ${months[date.getMonth()]} ${toBengaliDigits(date.getFullYear())}`;
}

export function slugify(text, fallback = 'news') {
  const s = (text || '')
    // NFC-তে normalize করা বাধ্যতামূলক।
    // বাংলা ড়/ঢ়/য় দুইভাবে লেখা যায়: একক কোডপয়েন্ট (U+09DC ইত্যাদি) বা
    // ভিত্তি-অক্ষর + নুক্তা। Unicode এগুলোকে composition exclusion ধরে,
    // তাই NFC আসলে ভেঙে দেয়। Next.js রুট প্যারামিটার NFC-তে normalize করে —
    // দুই পাশে দুই রূপ থাকলে slug মেলে না, প্রতিটি আর্টিকেল পেজ ৪০৪ হয়ে যায়।
    .normalize('NFC')
    .trim()
    .replace(/[\s।]+/g, '-')
    // \p{M} অবশ্যই রাখতে হবে: বাংলার কার-চিহ্ন, হসন্ত ও মাত্রা Unicode-এ
    // combining mark, \p{L} নয়। বাদ দিলে গঙ্গাচড়ায় → গঙগচড়য় হয়ে যায়।
    .replace(/[^\p{L}\p{N}\p{M}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
  return s || fallback;
}

export function log(stage, msg) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(`[${t}] ${stage.padEnd(9)} ${msg}`);
}
