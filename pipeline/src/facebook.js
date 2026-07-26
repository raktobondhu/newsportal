import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { log } from './util.js';

const GRAPH = 'https://graph.facebook.com';

function apiUrl(pathname) {
  return `${GRAPH}/${config.facebook.apiVersion}/${pathname}`;
}

async function graphError(res) {
  const body = await res.json().catch(() => null);
  const e = body?.error;
  const err = new Error(e?.message || `HTTP ${res.status}`);
  err.status = res.status;
  err.fbCode = e?.code;
  err.fbSubcode = e?.error_subcode;
  return err;
}

/**
 * ক্যাপশন।
 *
 * প্রথম লাইনে socialHeadline — সাইটের নিরপেক্ষ শিরোনামের বদলে ফিডের
 * জন্য লেখা সংস্করণটি। মডেল সেটা না দিলে সাধারণ শিরোনামেই ফিরি।
 *
 * লিংক ক্যাপশনে নেই, ইচ্ছাকৃতভাবে — ফেসবুক ছবি-পোস্টের ভেতরে বাইরের
 * লিংক থাকলে রিচ কমায়। লিংকটা পোস্টের পরে কমেন্টে যায় (postComment)।
 */
export function buildCaption(article) {
  const parts = [article.socialHeadline || article.headline];

  if (article.summary) parts.push('', article.summary);

  const tags = (article.tags || [])
    .map((t) => '#' + String(t).trim().replace(/\s+/g, '_'))
    .slice(0, 5);
  if (tags.length) parts.push('', tags.join(' '));

  return parts.join('\n');
}

/**
 * ছবিসহ পোস্ট। /photos এন্ডপয়েন্ট ব্যবহার করছি, /feed নয় —
 * /feed-এ শুধু লিংক দিলে ফেসবুক নিজে থাম্বনেইল বানায়, আমাদের
 * ব্র্যান্ডেড কার্ডটা দেখায় না।
 */
export async function postPhoto({ imagePath, caption }) {
  const { pageId, pageToken } = config.facebook;
  if (!pageId || !pageToken) throw new Error('FB_PAGE_ID / FB_PAGE_TOKEN নেই');
  if (!fs.existsSync(imagePath)) throw new Error(`ছবি নেই: ${imagePath}`);

  const form = new FormData();
  const bytes = await fs.promises.readFile(imagePath);
  form.append('source', new Blob([bytes], { type: 'image/png' }), path.basename(imagePath));
  form.append('message', caption);
  form.append('access_token', pageToken);

  // টাইমআউট ছাড়া আপলোড আটকে গেলে পুরো রান ঝুলে থাকত যতক্ষণ না CI
  // জব টাইমআউটে মারা পড়ে — আর তখন state সংরক্ষণের সুযোগও থাকত না।
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  let res;
  try {
    res = await fetch(apiUrl(`${pageId}/photos`), { method: 'POST', body: form, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw await graphError(res);

  const json = await res.json();
  return { photoId: json.id, postId: json.post_id ?? null };
}

/**
 * পোস্টের নিচে কমেন্ট — সাইটের লিংক এখানে যায়।
 *
 * এর জন্য টোকেনে pages_manage_engagement লাগে, যা pages_manage_posts
 * থেকে আলাদা পারমিশন। না থাকলে Graph API 403 / code 200 দেয়।
 */
export async function postComment({ postId, message }) {
  const { pageToken } = config.facebook;
  if (!pageToken) throw new Error('FB_PAGE_TOKEN নেই');
  if (!postId) throw new Error('postId নেই');

  const form = new URLSearchParams({ message, access_token: pageToken });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  let res;
  try {
    res = await fetch(apiUrl(`${postId}/comments`), { method: 'POST', body: form, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw await graphError(res);

  const json = await res.json();
  return { commentId: json.id };
}

/** পোস্ট মুছে ফেলা — টেস্ট পোস্ট পরিষ্কার করার জন্য */
export async function deletePost(postId) {
  const res = await fetch(`${apiUrl(postId)}?access_token=${encodeURIComponent(config.facebook.pageToken)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw await graphError(res);
  return await res.json();
}

export async function verifyToken() {
  const { pageId, pageToken } = config.facebook;
  const res = await fetch(apiUrl(`${pageId}?fields=id,name&access_token=${encodeURIComponent(pageToken)}`));
  if (!res.ok) throw await graphError(res);
  return await res.json();
}

/**
 * ফেসবুকের স্প্যাম ডিটেকশন প্রকাশিত থ্রেশহোল্ড মানে না — একসাথে ২০-৩০টা
 * পোস্ট গেলে নতুন পেজের রিচ কমে যেতে পারে বা পেজ সীমিত হতে পারে।
 * তাই পোস্টগুলোর মাঝে ব্যবধান রাখা হয়। এটা সতর্কতা, নিশ্চয়তা নয়।
 */
export function postingSchedule(count, gapMinutes = config.limits.facebookGapMinutes) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => new Date(now + i * gapMinutes * 60000));
}

/**
 * @param {object} err
 * @param {{action?: 'post'|'comment'}} [opts] কোন কাজটি ব্যর্থ হয়েছে।
 *   কমেন্টের জন্য আলাদা পারমিশন লাগে (pages_manage_engagement) — কোড ২০০
 *   দুই ক্ষেত্রেই আসে, তাই কাজ না জানলে বার্তাটা ভুল পারমিশনের দিকে পাঠায়
 *   আর ব্যবহারকারী ঘণ্টার পর ঘণ্টা ভুল জায়গায় খোঁজেন।
 */
export function describeFacebookError(err, { action = 'post' } = {}) {
  // ১৯০ = টোকেন অকার্যকর, ২০০/১০ = পারমিশন নেই, ৩৬৮ = সাময়িক ব্লক
  if (err.fbCode === 190) return 'Page token অকার্যকর হয়ে গেছে — নতুন করে নিতে হবে।';
  if (err.fbCode === 200 || err.fbCode === 10) {
    return action === 'comment'
      ? 'কমেন্ট করার পারমিশন নেই — Page token-এ pages_manage_engagement স্কোপ যোগ করে নতুন টোকেন নিন।'
      : 'পারমিশন নেই (pages_manage_posts যাচাই করুন)।';
  }
  if (err.fbCode === 368) return 'ফেসবুক সাময়িকভাবে পোস্টিং আটকে দিয়েছে — ব্যবধান বাড়ান।';
  if (err.fbCode === 4 || err.fbCode === 17) return 'রেট লিমিট ছাড়িয়ে গেছে — পরে চেষ্টা করুন।';
  return err.message;
}

/**
 * এই ভুলগুলোর পরে বাকি পোস্টগুলোও নিশ্চিতভাবে ব্যর্থ হবে, তাই লুপ থামানো উচিত।
 *
 * fbCode না থাকলেও থামি: নেটওয়ার্ক ত্রুটি বা টাইমআউটে fbCode থাকে না,
 * অথচ আগে সেই অবস্থায় লুপ চলতেই থাকত এবং প্রতিটি ব্যর্থ চেষ্টার মাঝে
 * পুরো ব্যবধান ঘুমিয়ে কাটাত।
 */
export function isFatalFacebookError(err) {
  const FATAL = [190, 200, 10, 368, 4, 17, 613];
  if (FATAL.includes(err.fbCode)) return true;
  return err.fbCode === undefined;
}

export { log };
