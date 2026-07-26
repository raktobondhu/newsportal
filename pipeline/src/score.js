import { tokenOverlap, log } from './util.js';

/**
 * একই খবর একাধিক সোর্সে এলে একটাই রাখি, আর গুনে রাখি কতগুলো সোর্সে এসেছে।
 * এই সংখ্যাটাই "খবরটা কত বড়" তার সবচেয়ে ভালো ইঙ্গিত — বড় ঘটনা সব
 * সংবাদমাধ্যমেই আসে।
 */
/**
 * Jaccard থ্রেশহোল্ড। test/check-dedupe.mjs দিয়ে মেপে বাছা:
 * একই খবরের জোড়ায় ০.২৩–০.৬৭, আলাদা খবরে সর্বোচ্চ ০.১৩।
 *
 * আগে ০.৩ ছিল — নিজের মাপা সর্বনিম্ন (০.২৩) এর *উপরে*, ফলে একটি
 * পরিচিত ডুপ্লিকেট জোড়াও ধরা পড়ত না। বাস্তবে দেখা গেছে ১১৭টি খবরের
 * একটিও মিলছে না, অর্থাৎ duplicateCount সবসময় ১, আর স্কোরিংয়ে
 * "কত সোর্সে এসেছে" সংকেতটা পুরোপুরি অকেজো।
 *
 * ০.১৮ = দুই দলের মাঝামাঝি, দুদিকেই যুক্তিসঙ্গত ব্যবধান।
 */
export const DEDUPE_THRESHOLD = 0.18;

export function dedupe(items, { threshold = DEDUPE_THRESHOLD } = {}) {
  const groups = [];

  for (const item of items) {
    let placed = false;
    for (const g of groups) {
      if (tokenOverlap(g.lead.title, item.title) >= threshold) {
        g.members.push(item);
        // বেশি ওজনের সোর্সের সংস্করণটাই মূল হিসেবে রাখি
        if (item.sourceWeight > g.lead.sourceWeight) g.lead = item;
        placed = true;
        break;
      }
    }
    if (!placed) groups.push({ lead: item, members: [item] });
  }

  return groups.map((g) => ({
    ...g.lead,
    duplicateCount: g.members.length,
    alsoIn: [...new Set(g.members.map((m) => m.sourceName))],
  }));
}

const HOT_WORDS = [
  'নিহত','মৃত্যু','হত্যা','ভূমিকম্প','বন্যা','ঘূর্ণিঝড়','দুর্ঘটনা','আগুন','দাবানল',
  'নির্বাচন','সরকার','প্রধানমন্ত্রী','রাষ্ট্রপতি','আদালত','গ্রেপ্তার','অভিযান',
  'যুদ্ধ','হামলা','বিস্ফোরণ','চুক্তি','অর্থনীতি','বাজেট','ডলার','জ্বালানি',
];

/**
 * স্কোর = সোর্সের ওজন + কতগুলো সোর্সে এসেছে + কত নতুন + শিরোনামে গুরুত্বপূর্ণ শব্দ
 * ফেসবুকে দিনে ২০-৩০টা যাবে, তাই উপরের দিকেরগুলো বাছতে হবে।
 */
/**
 * পাঠক বাংলাদেশের, তাই দেশের খবর আগে।
 *
 * এটা দরকার হলো সোর্স বাড়ানোর পর: একই আন্তর্জাতিক খবর ৭টি সোর্সে আসে,
 * অথচ দেশি খবর সর্বোচ্চ ৩-৪টিতে (দেশি সোর্স কম)। ফলে "কত সোর্সে এসেছে"
 * সংকেতটা আপনাআপনি বিদেশি খবরের পক্ষে ঝুঁকে যায় — মেপে দেখা গেছে
 * শীর্ষ ৬টির সবকটিই আন্তর্জাতিক হয়ে যাচ্ছিল।
 */
const SCOPE_BONUS = {
  national: 1.2,
  business: 0.8,
  mixed: 1.0, // বিবিসি বাংলা — দেশ ও বিদেশ দুটোই দেয়
  regional: 0.3, // প্রতিবেশী দেশ
  technology: 0.3,
  entertainment: 0.3,
  international: 0,
};

export function scoreItem(item, now = Date.now()) {
  let score = 0;

  score += item.sourceWeight * 2;
  score += SCOPE_BONUS[item.scope] ?? 0;

  // একাধিক সোর্সে আসা মানে বড় খবর। সীমা ৪ থেকে ৩-এ নামানো হয়েছে —
  // নাহলে বিদেশি খবরের স্বাভাবিক বেশি কভারেজই তাকে শীর্ষে তুলে দিত।
  score += Math.min(item.duplicateCount ?? 1, 3) * 1.2;

  // সময়: ২ ঘণ্টার মধ্যে হলে পূর্ণ নম্বর, ২৪ ঘণ্টায় শূন্য
  const ageHours = item.publishedAt ? (now - new Date(item.publishedAt).getTime()) / 3600000 : 12;
  if (ageHours <= 2) score += 3;
  else if (ageHours < 24) score += 3 * (1 - (ageHours - 2) / 22);

  const title = item.title || '';
  const hits = HOT_WORDS.filter((w) => title.includes(w)).length;
  score += Math.min(hits, 3) * 0.6;

  // ভবিষ্যতের তারিখ বা ২ দিনের বেশি পুরোনো — সন্দেহজনক, নিচে নামাই
  if (ageHours < -1 || ageHours > 48) score -= 3;

  return Number(score.toFixed(3));
}

export function rankItems(items, now = Date.now()) {
  const scored = items.map((i) => ({ ...i, score: scoreItem(i, now) }));
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * কার্ডে ছবি বসবে কিনা।
 * ব্যবহারকারীর নিয়ম: ভালো ছবি থাকলে ছবিসহ; ছবি না থাকলে, স্টক ইলাস্ট্রেশন
 * হলে, বা মতামত/বিশ্লেষণ হলে টেক্সট-অনলি।
 */
/**
 * "সংক্ষিপ্ত সংবাদ"-এর সীমা ৪০০ অক্ষর।
 * বাংলা লিপি ইংরেজির চেয়ে ঘন — স্বাভাবিক ৩ অনুচ্ছেদের খবরই ৫৫০-৬৫০
 * অক্ষরের হয়। সীমা ৭০০ রাখায় প্রায় সব খবরই "সংক্ষিপ্ত" গণ্য হয়ে
 * টেক্সট কার্ড পাচ্ছিল, অথচ ছবি ছিল। এখন কেবল সত্যিকারের ছোট খবরই
 * (এক-দুই অনুচ্ছেদ) টেক্সট কার্ড পাবে।
 */
const SHORT_ARTICLE_CHARS = 400;

export function decideCardStyle(item) {
  if (!item.image) return { style: 'text', reason: 'ছবি নেই' };
  if (item.isOpinion) return { style: 'text', reason: 'মতামত/বিশ্লেষণ' };
  if ((item.body?.length ?? 0) < SHORT_ARTICLE_CHARS) return { style: 'text', reason: 'সংক্ষিপ্ত সংবাদ' };
  return { style: 'photo', reason: 'ছবি আছে' };
}

/**
 * বাছাইয়ে বিভাগভিত্তিক কোটা।
 *
 * কেবল স্কোর দিয়ে বাছলে ভারসাম্য রাখা যায় না — মেপে দেখা গেছে ওজন
 * সামান্য কমালেই শীর্ষ ১০-এর সবকটি আন্তর্জাতিক হয়ে যায়, আর সামান্য
 * বাড়ালে সবকটি দেশি। মাঝামাঝি কোনো মান নেই, কারণ সোর্সের সংখ্যা ও
 * প্রকাশের হার দুই দলে সম্পূর্ণ আলাদা।
 *
 * তাই ওজন নয়, কোটা: প্রতি রানে দেশের খবর সংখ্যাগরিষ্ঠ থাকবে, কিন্তু
 * আন্তর্জাতিক ও বিষয়ভিত্তিক খবরও নিশ্চিতভাবে জায়গা পাবে। কোনো বিভাগে
 * যথেষ্ট খবর না থাকলে সেই কোটা অন্যরা পূরণ করে নেয়।
 */
const SCOPE_GROUP = {
  national: 'দেশ',
  mixed: 'দেশ',
  business: 'দেশ',
  international: 'বিদেশ',
  regional: 'বিদেশ',
  technology: 'বিষয়',
  entertainment: 'বিষয়',
};

const QUOTA_SHARE = { দেশ: 0.6, বিদেশ: 0.3, বিষয়: 0.1 };

export function selectBalanced(ranked, max) {
  const buckets = { দেশ: [], বিদেশ: [], বিষয়: [] };
  for (const item of ranked) {
    buckets[SCOPE_GROUP[item.scope] ?? 'বিদেশ'].push(item);
  }

  const picked = [];
  const taken = { দেশ: 0, বিদেশ: 0, বিষয়: 0 };

  for (const [group, share] of Object.entries(QUOTA_SHARE)) {
    const want = Math.round(max * share);
    const got = buckets[group].slice(0, want);
    picked.push(...got);
    taken[group] = got.length;
  }

  // কোটা পূরণ না হলে (যেমন বিনোদনের খবর কম) বাকি জায়গা স্কোর অনুযায়ী
  if (picked.length < max) {
    const used = new Set(picked.map((x) => x.id));
    for (const item of ranked) {
      if (picked.length >= max) break;
      if (!used.has(item.id)) picked.push(item);
    }
  }

  // শেষে আবার স্কোর অনুযায়ী সাজাই — গুরুত্বপূর্ণ খবর আগে প্রক্রিয়া হবে,
  // কোটা শেষ হয়ে গেলেও যেন সেরাগুলো বাদ না পড়ে
  picked.sort((a, b) => b.score - a.score);
  return { picked: picked.slice(0, max), taken };
}

export function summarizeRanking(items, take) {
  log('rank', `${items.length} টি খবর, শীর্ষ ${take} টি বাছাই`);
  items.slice(0, take).forEach((it, i) => {
    const dup = it.duplicateCount > 1 ? ` [${it.duplicateCount} সোর্স]` : '';
    log('rank', `  ${String(i + 1).padStart(2)}. ${it.score.toFixed(2)}${dup} ${it.title.slice(0, 55)}`);
  });
}
