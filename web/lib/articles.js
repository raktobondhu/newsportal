import fs from 'node:fs';
import path from 'node:path';

/**
 * আর্টিকেলের উৎস দুটি:
 *
 *  ১. Supabase — আসল উৎস। Vercel-এ সাইট চলে, পাইপলাইন চলে অন্য কোথাও;
 *     লোকাল ফাইল ওখানে পৌঁছায় না।
 *  ২. লোকাল JSON — Supabase কনফিগার না থাকলে (লোকাল ডেভেলপমেন্ট)।
 *
 * পড়ার জন্য anon key ব্যবহার করা হয়, service key নয় — RLS-এ articles
 * টেবিলে public read পলিসি আছে, বাকি টেবিল বাইরে থেকে পড়া যায় না।
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const ARTICLES_DIR = path.join(process.cwd(), '..', 'output', 'articles');

/**
 * ক্যাশের মেয়াদ। এই ধ্রুবকটি প্রতিটি page.js/layout.js থেকে
 * `export const revalidate` হিসেবে আবার রপ্তানি করতে হয় —
 * Next.js কেবল রুট সেগমেন্ট ফাইলেই এটি খোঁজে, lib থেকে রপ্তানি করলে
 * নীরবে উপেক্ষা করে (পেজ চিরস্থায়ীভাবে স্ট্যাটিক থেকে যায়)।
 */
export const REVALIDATE_SECONDS = 300;

function fromDbRow(r) {
  return {
    slug: r.slug,
    headline: r.headline,
    summary: r.summary,
    body: r.body,
    category: r.category,
    tags: r.tags ?? [],
    isOpinion: r.is_opinion,
    sourceName: r.source_name,
    sourceUrl: r.source_url,
    alsoIn: r.also_in ?? [],
    imageWebPath: r.image_url,
    cardWebPath: r.card_url,
    cardStyle: r.card_style,
    publishedAt: r.published_at,
  };
}

function readLocalArticles() {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  const out = [];
  for (const f of fs.readdirSync(ARTICLES_DIR).filter((x) => x.endsWith('.json'))) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(ARTICLES_DIR, f), 'utf8')));
    } catch {
      // একটা ফাইল নষ্ট হলে পুরো সাইট বিল্ড ভাঙা উচিত নয়
    }
  }
  return out;
}

async function fetchFromSupabase() {
  const url =
    `${SUPABASE_URL}/rest/v1/articles` +
    `?select=slug,headline,summary,body,category,tags,is_opinion,source_name,source_url,also_in,image_url,card_url,card_style,published_at` +
    // অ্যাডমিন প্যানেল থেকে লুকানো খবর সাইটে দেখানো যাবে না।
    // RLS পলিসিও এটা আটকায়, কিন্তু এখানে স্পষ্ট করে রাখলে service key
    // দিয়ে পড়লেও (লোকাল ডেভেলপমেন্টে) একই আচরণ থাকে।
    `&hidden=eq.false` +
    `&order=published_at.desc&limit=500`;

  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return (await res.json()).map(fromDbRow);
}

/**
 * মডিউল-স্তরে ক্যাশ রাখা হয় না — ইচ্ছাকৃতভাবে।
 *
 * আগে `let cache` ছিল, আর তাতে দুটো মারাত্মক সমস্যা হচ্ছিল:
 *  ১. বিল্ডের সময় সব পেজ এক প্রসেসে তৈরি হয়, তাই প্রথম পেজটি ক্যাশ ভরে
 *     ফেলত আর বাকিরা আর কখনো fetch করত না।
 *  ২. চালু সার্ভারে ক্যাশ কোনোদিন খালি হতো না — পাইপলাইনের লেখা নতুন খবর
 *     সাইটে আসত না, আর ফেসবুকে পোস্ট করা লিংক ৪০৪ দিত।
 *
 * Next.js-এর fetch ক্যাশই এই কাজটা ঠিকভাবে করে: এক রেন্ডারের ভেতরে একই
 * অনুরোধ ডিডুপ হয়, আর রেন্ডারের মাঝে REVALIDATE_SECONDS মেনে চলে।
 */
export async function getAllArticles() {
  let items = [];
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      items = await fetchFromSupabase();
    } catch (err) {
      console.warn('Supabase থেকে আর্টিকেল আনা যায়নি, লোকাল ফাইলে ফিরছি:', err.message);
      items = readLocalArticles();
    }
  } else {
    items = readLocalArticles();
  }

  items.sort((a, b) => new Date(b.publishedAt ?? 0) - new Date(a.publishedAt ?? 0));
  return items;
}

/**
 * Next.js ডাইনামিক রুট প্যারামিটার percent-encoded অবস্থায় দেয় — বাংলা
 * slug-এ সেটা '%E0%A6%85...' হয়ে আসে, কাঁচা তুলনা কখনোই মেলে না এবং
 * প্রতিটি আর্টিকেল নীরবে ৪০৪ হয় (বিল্ড সফল দেখায়, তাই ধরা কঠিন)।
 * সেই সঙ্গে NFC — বাংলা ড়/ঢ়/য় একাধিক রূপে লেখা যায়।
 */
function canonicalSlug(value) {
  let s = String(value ?? '');
  try {
    s = decodeURIComponent(s);
  } catch {
    // ভাঙা এনকোডিং হলে যা আছে তা-ই ব্যবহার করি
  }
  return s.normalize('NFC');
}

/**
 * একটি নির্দিষ্ট খবর।
 *
 * পুরো তালিকা এনে খোঁজা হয় না — ইচ্ছাকৃতভাবে। তালিকার fetch-টি
 * REVALIDATE_SECONDS ধরে ক্যাশ থাকে, তাই বিল্ডের পরে পাইপলাইন যে খবর
 * লিখেছে সেটি তালিকায় না থাকায় পেজটি ৪০৪ দিত — অথচ ফেসবুকে ঠিক সেই
 * লিংকই পোস্ট করা হয়। স্ল্যাগ ধরে আলাদা অনুরোধের ক্যাশ-কী আলাদা,
 * তাই নতুন খবর সঙ্গে সঙ্গেই খোলে।
 */
export async function getArticle(slug) {
  const want = canonicalSlug(slug);

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const url =
        `${SUPABASE_URL}/rest/v1/articles` +
        `?select=slug,headline,summary,body,category,tags,is_opinion,source_name,source_url,also_in,image_url,card_url,card_style,published_at` +
        `&slug=eq.${encodeURIComponent(want)}&hidden=eq.false&limit=1`;

      const res = await fetch(url, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        next: { revalidate: REVALIDATE_SECONDS },
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows.length) return fromDbRow(rows[0]);
      }
    } catch {
      // নিচের তালিকা-স্ক্যানে পড়ে যাই
    }
  }

  // লোকাল ফাইল মোড, অথবা স্ল্যাগের রূপ ডেটাবেসের চেয়ে আলাদা হলে
  return (await getAllArticles()).find((a) => canonicalSlug(a.slug) === want) ?? null;
}

export async function getCategories() {
  const counts = new Map();
  for (const a of await getAllArticles()) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getByCategory(category) {
  return (await getAllArticles()).filter((a) => a.category === category);
}

/**
 * সাইটে দেখানোর ছবি — কেবল মূল ছবি, কার্ড নয়।
 *
 * কার্ডের ভেতরে শিরোনাম আঁকা থাকে। আগে ছবিহীন খবরে fallback হিসেবে
 * কার্ড দেখানো হতো, ফলে থাম্বনেইলে একবার আর তার নিচে আবার — একই
 * শিরোনাম দুবার। দেখতে অপেশাদার লাগে।
 *
 * null ফেরত এলে পেজ একটি পরিচ্ছন্ন প্লেসহোল্ডার দেখায় (.thumb-empty),
 * যাতে গ্রিডের উচ্চতাও ঠিক থাকে।
 */
export const thumbFor = (a) => a.imageWebPath || null;

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const toBn = (s) => String(s).replace(/[0-9]/g, (c) => BN_DIGITS[Number(c)]);

const MONTHS = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${toBn(d.getDate())} ${MONTHS[d.getMonth()]} ${toBn(d.getFullYear())}`;
}

export function relativeTime(iso) {
  if (!iso) return '';
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'এইমাত্র';
  if (diffMin < 60) return `${toBn(diffMin)} মিনিট আগে`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${toBn(h)} ঘণ্টা আগে`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${toBn(d)} দিন আগে`;
  return formatDate(iso);
}
