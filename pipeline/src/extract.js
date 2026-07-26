import * as cheerio from 'cheerio';
import { httpGet, log } from './util.js';

/**
 * BBC-র og:image URL-এ 'branded_*' রূপ থাকে — ছবির গায়েই BBC-র জলছাপ বসানো।
 * সেটা আমাদের কার্ডে বসালে দেখতে খারাপ, আর অন্যের ব্র্যান্ড বহন করা হয়।
 * 'ace/ws/1024/cpsprodpb/' রূপটি একই ছবির জলছাপহীন সংস্করণ দেয় (যাচাই করা)।
 */
export function normalizeImageUrl(url) {
  if (!url) return '';

  // ১৯২০ চাওয়ার কারণ: কার্ড ১০৮০x১০৮০ বর্গাকার, আর সোর্সের ছবি ১৬:৯।
  // ১৯২০x১০৮০ হলে উচ্চতা ঠিক মিলে যায় — একটুও টেনে বড় করতে হয় না।
  // og:image-এর ১২০০x৬৩০ নিলে ১.৭ গুণ টানতে হতো, তাতেই ছবি ঘোলা দেখাত।
  // ichef ২৫৬০ পর্যন্ত দেয়, কিন্তু তাতে ফাইল বড় হয় অকারণে।
  const m = url.match(/ichef\.bbci\.co\.uk\/.*?([0-9a-f]{4}\/live\/[0-9a-f-]+\.(?:jpg|jpeg|png|webp))/i);
  if (m) return `https://ichef.bbci.co.uk/ace/ws/1920/cpsprodpb/${m[1]}`;

  // প্রথম আলো জলছাপটা CDN প্যারামিটার দিয়ে বসায়:
  //   ...&overlay=<banner>.jpg&overlay_position=bottom&overlay_width_pct=1
  // প্যারামিটারগুলো ফেলে দিলেই মূল ছবি পাওয়া যায়। RSS-এর ছবিটা ব্যবহার করা
  // যেত না — সেটা w=280, কার্ডের জন্য বড্ড ছোট।
  if (/media\.prothomalo\.com/i.test(url)) {
    try {
      const u = new URL(url);
      for (const p of ['overlay', 'overlay_position', 'overlay_width_pct', 'ogImage']) {
        u.searchParams.delete(p);
      }
      // ১৬০০-ই এদের সর্বোচ্চ — ২০০০ বা ২৪০০ চাইলেও ১৬০০x১০৬৭ ফেরত দেয়
      u.searchParams.set('w', '1600');
      return u.toString();
    } catch {
      return url;
    }
  }

  return url;
}

/**
 * ভিডিও, লাইভব্লগ, গ্যালারি, পডকাস্ট — এসব পেজে লেখা প্রায় থাকেই না,
 * রিরাইট করার মতো কিছু পাওয়া যায় না। Al Jazeera-র ফিডে ২৫টির মধ্যে ৯টিই
 * ভিডিও পেজ, এগুলো না ছাঁটলে খালি আর্টিকেল তৈরি হয়।
 */
export function isUnsuitableUrl(url) {
  if (!url) return true;
  return /\/(video|videos|gallery|galleries|liveblog|live-blog|podcasts?|program|programmes|audio)\//i.test(url);
}

/** ছবিটা কার্ডে বসানোর যোগ্য কিনা — ছোট, লোগো, ব্যাজ, প্লেসহোল্ডার বাদ */
export function looksLikeBadImage(url) {
  if (!url) return true;
  const u = url.toLowerCase();
  return /logo|placeholder|default|badge|avatar|icon|sprite|blank|1x1|spacer/.test(u);
}

const META_IMAGE_SELECTORS = [
  'meta[property="og:image"]',
  'meta[name="og:image"]',
  'meta[property="twitter:image"]',
  'meta[name="twitter:image"]',
];

// নির্দিষ্ট কনটেইনার আগে, সাধারণগুলো পরে — 'article'/'main' আগে রাখলে
// পাশের "সম্পর্কিত খবর" ব্লকও ঢুকে পড়ে।
const ARTICLE_SELECTORS = [
  '[itemprop="articleBody"]',
  '.wysiwyg--all-content', // Al Jazeera
  '.wysiwyg',
  '[data-testid="article-body"]',
  '.story-element-text', // প্রথম আলো
  '.story-content',
  '.article-body',
  '.entry-content',
  '#content-detail',
  'article',
  'main',
];

/**
 * আর্টিকেল পেজ থেকে মূল টেক্সট ও ছবি।
 * Readability/jsdom ব্যবহার করিনি — ভারী নির্ভরতা, আর আমাদের দরকার
 * কেবল কয়েকটি নির্দিষ্ট সাইটের অনুচ্ছেদ। cheerio-ই যথেষ্ট।
 */
export async function extractArticle(url) {
  const { text: html } = await httpGet(url);
  const $ = cheerio.load(html);

  let image = '';
  for (const sel of META_IMAGE_SELECTORS) {
    const c = $(sel).attr('content');
    if (c && /^https?:\/\//.test(c)) {
      image = c;
      break;
    }
  }
  image = normalizeImageUrl(image);
  if (looksLikeBadImage(image)) image = '';

  // নেভিগেশন/ফুটার/বিজ্ঞাপন সরিয়ে দিই, নাহলে মেনুর লেখা ঢুকে যায়
  $('script, style, nav, header, footer, aside, form, iframe, figure figcaption, .related, .ad, .advertisement').remove();

  let paragraphs = [];
  for (const sel of ARTICLE_SELECTORS) {
    const node = $(sel).first();
    if (!node.length) continue;
    paragraphs = node
      .find('p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((p) => p.length > 40);
    if (paragraphs.length >= 3) break;
  }

  // কোনো কনটেইনারেই না পেলে পুরো পেজের <p> নিই
  if (paragraphs.length < 3) {
    paragraphs = $('p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((p) => p.length > 40);
  }

  const body = paragraphs.join('\n\n').replace(/\s+\n/g, '\n').slice(0, 6000);

  return {
    image,
    body,
    paragraphCount: paragraphs.length,
    ok: body.length >= 200,
  };
}

/** একটা ব্যর্থ হলে পুরো রান যেন না থামে */
export async function safeExtract(url) {
  try {
    return await extractArticle(url);
  } catch (err) {
    log('extract', `ব্যর্থ ${url.slice(0, 60)} — ${err.message}`);
    return { image: '', body: '', paragraphCount: 0, ok: false };
  }
}
