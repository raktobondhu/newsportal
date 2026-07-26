import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { log, slugify, hash } from './util.js';
import * as sb from './supabase.js';

/**
 * আর্টিকেল সবসময় লোকাল JSON হিসেবে লেখা হয় (ডিবাগ ও ব্যাকআপের জন্য),
 * আর Supabase কনফিগার করা থাকলে সেখানেও যায়।
 *
 * Supabase লাগে কারণ সাইট Vercel-এ চলবে কিন্তু পাইপলাইন অন্য কোথাও —
 * লোকাল ফাইল ওখানে পৌঁছাবে না। ছবিও তাই Storage-এ যেতে হবে।
 */

async function ensureDirs() {
  await fsp.mkdir(config.paths.articles, { recursive: true });
  await fsp.mkdir(config.paths.cards, { recursive: true });
}

/** আগের রানে কোন লিংকগুলো প্রকাশ হয়েছে — একই খবর দুবার যাওয়া ঠেকাতে */
export async function loadState() {
  // Supabase-ই একমাত্র নির্ভরযোগ্য উৎস: পাইপলাইন CI-তে চললে প্রতিবার
  // নতুন মেশিন পায়, লোকাল state.json সেখানে থাকে না।
  if (sb.supabaseEnabled()) {
    try {
      const [seen, recentHeadlines] = await Promise.all([sb.fetchSeenLinks(), sb.fetchRecentHeadlines()]);
      log('state', `Supabase থেকে ${seen.size} লিংক, ${recentHeadlines.length} শিরোনাম`);
      return {
        seen,
        recentHeadlines,
        pendingSeen: new Set(),
        pendingHeadlines: [],
        lastRunAt: null,
        postedCount: 0,
        fromSupabase: true,
      };
    } catch (err) {
      log('state', `Supabase পড়া যায়নি, লোকাল ফাইলে ফিরছি — ${err.message.slice(0, 80)}`);
    }
  }

  try {
    const raw = await fsp.readFile(config.paths.state, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      seen: new Set(parsed.seen ?? []),
      // রিরাইট-পরবর্তী বাংলা শিরোনাম — পরের রানে একই খবর আবার প্রকাশ ঠেকায়
      recentHeadlines: parsed.recentHeadlines ?? [],
      pendingSeen: new Set(),
      pendingHeadlines: [],
      lastRunAt: parsed.lastRunAt ?? null,
      postedCount: parsed.postedCount ?? 0,
    };
  } catch {
    return {
      seen: new Set(),
      recentHeadlines: [],
      pendingSeen: new Set(),
      pendingHeadlines: [],
      lastRunAt: null,
      postedCount: 0,
    };
  }
}

/** seen-এ যোগ করা এবং Supabase-এ পাঠানোর তালিকায় তোলা — একসাথে */
export function markSeen(state, url) {
  if (state.seen.has(url)) return;
  state.seen.add(url);
  state.pendingSeen.add(url);
}

export function markHeadline(state, headline) {
  state.recentHeadlines.push(headline);
  state.pendingHeadlines.push(headline);
}

/**
 * state সংরক্ষণ। রানের মাঝপথে বারবার ডাকা হয়, তাই কেবল অমীমাংসিত
 * (pending) জিনিসগুলোই পাঠানো হয় — সফল হলে সেই তালিকা খালি করে দেওয়া হয়।
 *
 * আগে পুরো `seen` সেট থেকে শেষ ২০০০টা পাঠানো হতো। সেটা ভুল ছিল দুদিক
 * থেকে: তালিকাটা নতুনতম-আগে ক্রমে আসে, তাই `.slice(-2000)` আসলে
 * সবচেয়ে পুরোনোগুলো নিত; আর প্রতি রানে অকারণে ২০০০ সারি আবার পাঠানো হতো।
 */
export async function saveState(state) {
  if (sb.supabaseEnabled()) {
    const links = [...(state.pendingSeen ?? [])];
    const heads = [...(state.pendingHeadlines ?? [])];
    try {
      if (links.length) await sb.saveSeenLinks(links);
      if (heads.length) await sb.saveHeadlines(heads);
      state.pendingSeen = new Set();
      state.pendingHeadlines = [];
    } catch (err) {
      // খালি করছি না — পরের saveState-এ আবার চেষ্টা হবে
      log('state', `Supabase-এ state লেখা যায়নি — ${err.message.slice(0, 90)}`);
    }
  }

  await fsp.mkdir(path.dirname(config.paths.state), { recursive: true });
  // পুরোনো এন্ট্রি অসীম বাড়তে দিই না — শেষ ৫০০০টাই যথেষ্ট
  const seen = [...state.seen].slice(-5000);
  const payload = {
    seen,
    // শিরোনাম তুলনা O(n) — তাই এই তালিকা ছোট রাখা জরুরি,
    // আর ৩০০টাই কয়েক দিনের খবর কভার করে
    recentHeadlines: (state.recentHeadlines ?? []).slice(-300),
    lastRunAt: new Date().toISOString(),
    postedCount: state.postedCount ?? 0,
  };
  await fsp.writeFile(config.paths.state, JSON.stringify(payload, null, 2), 'utf8');
}

export function buildSlug(headline, id) {
  // স্ল্যাগের শেষে ছোট হ্যাশ — দুটি খবরের শিরোনাম মিলে গেলেও URL আলাদা থাকবে
  return `${slugify(headline)}-${(id || hash(headline)).slice(0, 6)}`;
}

/** পাইপলাইনের আর্টিকেল অবজেক্ট → ডেটাবেসের কলাম নাম (snake_case) */
function toDbRow(a) {
  return {
    slug: a.slug,
    headline: a.headline,
    // সাইট headline দেখায়, ফেসবুক social_headline — দুটোই রাখি
    social_headline: a.socialHeadline ?? null,
    summary: a.summary,
    body: a.body,
    category: a.category,
    tags: a.tags ?? [],
    is_opinion: a.isOpinion ?? false,
    source_name: a.sourceName,
    source_url: a.sourceUrl,
    also_in: a.alsoIn ?? [],
    score: a.score ?? null,
    provider: a.provider ?? null,
    model: a.model ?? null,
    original_image: a.originalImage ?? null,
    image_url: a.imageUrl ?? null,
    card_url: a.cardUrl ?? null,
    card_style: a.cardStyle ?? null,
    published_at: a.publishedAt,
    source_published_at: a.sourcePublishedAt ?? null,
  };
}

/**
 * Supabase Storage অ-ASCII অবজেক্ট নাম প্রত্যাখ্যান করে ("InvalidKey")।
 * আমাদের slug বাংলা — সাইটের URL-এ সেটাই থাকবে (SEO-র জন্য ভালো), কিন্তু
 * স্টোরেজের চাবি হতে হবে ASCII। slug-এর হ্যাশ ব্যবহার করছি: নির্দিষ্ট,
 * সংঘর্ষহীন, আর একই আর্টিকেল আবার চালালে একই ফাইলেই বসে।
 */
function storageKey(slug, ext) {
  return `${hash(slug)}${ext}`;
}

export async function saveArticle(article) {
  await ensureDirs();

  // Supabase কনফিগার করা না থাকলে লোকাল ফাইলই যথেষ্ট — কিন্তু কেবল
  // ডেভেলপমেন্টে। CI-তে secret ভুল হলে supabaseEnabled() false হতো,
  // published true হয়ে যেত, আর খবর ফেসবুকে চলে যেত এমন লিংকসহ যা
  // কোনোদিন খুলবে না। তাই CI-তে Supabase বাধ্যতামূলক।
  if (!sb.supabaseEnabled() && process.env.CI) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY নেই — CI-তে এগুলো ছাড়া চালানো যাবে না');
  }
  let published = !sb.supabaseEnabled();

  if (sb.supabaseEnabled()) {
    try {
      // ছবি আগে আপলোড — URL গুলো সারিতে বসাতে হবে
      if (article.cardFile) {
        article.cardUrl = await sb.uploadFile('cards', storageKey(article.slug, '.png'), article.cardFile);
      }
      if (article.imageLocalFile) {
        const ext = path.extname(article.imageLocalFile);
        article.imageUrl = await sb.uploadFile('images', storageKey(article.slug, ext), article.imageLocalFile);
      }
      await sb.upsertArticle(toDbRow(article));
      published = true;
    } catch (err) {
      // Supabase ব্যর্থ হলেও লোকাল কপিটা লিখে রাখি — কাজ হারিয়ে যাবে না।
      // কিন্তু published=false থাকায় কলার জানবে খবরটি সাইটে নেই, তাই
      // ফেসবুকে পোস্ট করা হবে না — নাহলে ক্যাপশনের লিংক ৪০৪ দিত।
      log('store', `Supabase-এ লেখা যায়নি (${article.slug.slice(0, 30)}) — ${err.message.slice(0, 90)}`);
    }
  }

  const file = path.join(config.paths.articles, `${article.slug}.json`);
  await fsp.writeFile(file, JSON.stringify(article, null, 2), 'utf8');
  return { file, published };
}

export async function listArticles({ limit = 100 } = {}) {
  await ensureDirs();
  const files = (await fsp.readdir(config.paths.articles)).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await fsp.readFile(path.join(config.paths.articles, f), 'utf8')));
    } catch {
      log('store', `পড়া গেল না: ${f}`);
    }
  }
  out.sort((a, b) => new Date(b.publishedAt ?? 0) - new Date(a.publishedAt ?? 0));
  return out.slice(0, limit);
}

/** সাইট বিল্ডের জন্য একটাই ইনডেক্স ফাইল */
export async function writeIndex() {
  const articles = await listArticles({ limit: 5000 });
  const index = articles.map((a) => ({
    slug: a.slug,
    headline: a.headline,
    summary: a.summary,
    category: a.category,
    tags: a.tags,
    image: a.cardWebPath ?? null,
    sourceName: a.sourceName,
    sourceUrl: a.sourceUrl,
    publishedAt: a.publishedAt,
  }));
  const file = path.join(config.paths.output, 'index.json');
  await fsp.writeFile(file, JSON.stringify(index, null, 2), 'utf8');
  log('store', `ইনডেক্স লেখা হয়েছে: ${index.length} টি আর্টিকেল`);
  return file;
}

/** পুরোনো seen_links ও recent_headlines ছেঁটে ফেলা — টেবিল অসীম বাড়া ঠেকাতে */
export async function pruneOldState() {
  if (!sb.supabaseEnabled()) return;
  try {
    await sb.pruneSeenLinks();
    await sb.pruneHeadlines();
  } catch (err) {
    // পরিচ্ছন্নতার কাজ — ব্যর্থ হলে রান থামানোর কারণ নয়
    log('store', `পুরোনো state ছাঁটা যায়নি — ${err.message.slice(0, 80)}`);
  }
}

/** ফেসবুকে পোস্ট হওয়ার তথ্য ডেটাবেসে তুলে রাখা */
export async function markArticlePosted(slug, postId) {
  if (!sb.supabaseEnabled() || !postId) return;
  try {
    await sb.markPostedToFacebook(slug, postId);
  } catch (err) {
    // পোস্ট তো হয়ে গেছে — শুধু নথিভুক্ত করা যায়নি, রান থামানোর কারণ নয়
    log('store', `facebook_post_id লেখা যায়নি — ${err.message.slice(0, 80)}`);
  }
}

export function articleExists(slug) {
  return fs.existsSync(path.join(config.paths.articles, `${slug}.json`));
}
