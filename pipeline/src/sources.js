import { pathToFileURL } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { httpGet, nodeText, stripHtml, hash, log } from './util.js';

/**
 * সোর্স তালিকা।
 * weight — স্কোরিংয়ে সোর্সের নির্ভরযোগ্যতা/গুরুত্ব।
 * lang   — 'bn' হলে অনুবাদ লাগবে না, শুধু রিরাইট।
 *
 * bd-pratidin, kalerkantho, bdnews24, jugantor ইচ্ছাকৃতভাবে বাদ:
 * ওদের ফিড Cloudflare-এ 403 দেয় (২০২৬-০৭ এ যাচাই করা)।
 */
export const SOURCES = [
  {
    id: 'prothomalo',
    name: 'প্রথম আলো',
    url: 'https://www.prothomalo.com/feed/',
    lang: 'bn',
    weight: 1.0,
    scope: 'national',
  },
  {
    id: 'bbcbangla',
    name: 'বিবিসি বাংলা',
    url: 'https://feeds.bbci.co.uk/bengali/rss.xml',
    lang: 'bn',
    weight: 1.0,
    scope: 'mixed',
  },
  {
    id: 'dailystar',
    name: 'The Daily Star',
    url: 'https://www.thedailystar.net/rss.xml',
    lang: 'en',
    weight: 0.85,
    scope: 'national',
  },
  {
    id: 'bbcworld',
    name: 'BBC World',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    lang: 'en',
    weight: 0.9,
    scope: 'international',
  },
  {
    id: 'aljazeera',
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    lang: 'en',
    weight: 0.85,
    scope: 'international',
  },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  cdataPropName: '__cdata',
  trimValues: true,
  // ডিফল্ট maxTotalExpansions=1000 বৈধ ফিডের জন্যই কম — Daily Star-এর ফিড
  // এতে পার্স হয় না (1200 > 1000)। তবে সীমা একেবারে তুলে দিচ্ছি না:
  // অচেনা সোর্স থেকে XML নিচ্ছি, তাই entity-expansion বোমার (billion laughs)
  // বিরুদ্ধে একটা ছাদ থাকা দরকার।
  processEntities: {
    enabled: true,
    maxTotalExpansions: 200000,
    maxExpandedLength: 5000000,
  },
});

function parsePubDate(raw) {
  const t = nodeText(raw);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** RSS আইটেমের ভেতরে যেখানেই ছবি লুকিয়ে থাকুক, বের করার চেষ্টা */
function imageFromItem(item) {
  const candidates = [
    item['media:thumbnail']?.['@url'],
    item['media:content']?.['@url'],
    item.thumbnail?.['@url'],
    item.enclosure?.['@url'],
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//.test(c)) return c;
  }
  return '';
}

export async function fetchFeed(source) {
  const { text } = await httpGet(source.url);
  const doc = parser.parse(text);

  let items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
  if (!Array.isArray(items)) items = [items];

  const out = [];
  for (const item of items) {
    const title = nodeText(item.title);
    // Atom ফিডে link অ্যাট্রিবিউটে থাকে, RSS-এ টেক্সট নোডে
    const link = nodeText(item.link) || item.link?.['@href'] || '';
    if (!title || !link) continue;

    out.push({
      id: hash(link),
      sourceId: source.id,
      sourceName: source.name,
      sourceLang: source.lang,
      sourceWeight: source.weight,
      scope: source.scope,
      title,
      link,
      summary: stripHtml(nodeText(item.description) || nodeText(item['content:encoded'])).slice(0, 600),
      publishedAt: parsePubDate(item.pubDate ?? item.published ?? item.updated),
      rssImage: imageFromItem(item),
      categories: []
        .concat(item.category ?? [])
        .map(nodeText)
        .filter(Boolean)
        .slice(0, 4),
    });
  }
  return out;
}

/** সব সোর্স সমান্তরালে — একটা ব্যর্থ হলে বাকিগুলো চলতে থাকবে */
export async function fetchAllFeeds(sources = SOURCES) {
  const results = await Promise.allSettled(sources.map((s) => fetchFeed(s)));
  const all = [];
  results.forEach((r, i) => {
    const s = sources[i];
    if (r.status === 'fulfilled') {
      log('rss', `${s.name}: ${r.value.length} টি আইটেম`);
      all.push(...r.value);
    } else {
      log('rss', `${s.name}: ব্যর্থ — ${r.reason?.message ?? r.reason}`);
    }
  });
  return all;
}

// সরাসরি চালালে ফিডের অবস্থা দেখায়: node src/sources.js
// pathToFileURL ব্যবহার করছি — Windows-এ পাথে স্পেস থাকলে URL-এনকোড হয়,
// হাতে স্ট্রিং জোড়া দিলে তুলনা কখনোই মেলে না।
// argv[1] না-ও থাকতে পারে (যেমন `node -e`), তাই আগে পরীক্ষা
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const items = await fetchAllFeeds();
  log('rss', `মোট ${items.length} টি আইটেম`);
  for (const it of items.slice(0, 5)) console.log(`  - [${it.sourceName}] ${it.title}`);
}
