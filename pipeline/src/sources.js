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
/**
 * ওজন (weight) স্কোরিংয়ে সোর্সের গুরুত্ব ঠিক করে। পাঠক বাংলাদেশের,
 * তাই দেশীয় সোর্স সবার উপরে — নাহলে আন্তর্জাতিক খবরের ভিড়ে দেশের
 * খবর চাপা পড়ে যেত (সোর্স সংখ্যায় বিদেশিরাই বেশি)।
 *
 * প্রতিটি ফিড যোগ করার আগে চালিয়ে দেখা হয়েছে: খোলে কিনা, কতটা আইটেম
 * দেয়, ছবি আছে কিনা, আর আর্টিকেল পেজ থেকে যথেষ্ট লেখা বেরোয় কিনা।
 * test/check-sources.mjs দিয়ে যেকোনো সময় আবার যাচাই করা যায়।
 */
export const SOURCES = [
  // ================= বাংলাদেশ =================
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
    id: 'jagonews',
    name: 'জাগোনিউজ২৪',
    url: 'https://www.jagonews24.com/rss/rss.xml',
    lang: 'bn',
    weight: 0.95,
    scope: 'national',
  },
  {
    id: 'ajkerpatrika',
    name: 'আজকের পত্রিকা',
    url: 'https://www.ajkerpatrika.com/feed',
    lang: 'bn',
    weight: 0.9,
    scope: 'national',
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
    id: 'tbsnews',
    name: 'The Business Standard',
    url: 'https://www.tbsnews.net/rss.xml',
    lang: 'en',
    weight: 0.8,
    scope: 'business',
  },

  // ================= আন্তর্জাতিক =================
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
  {
    id: 'guardian',
    name: 'The Guardian',
    url: 'https://www.theguardian.com/world/rss',
    lang: 'en',
    weight: 0.85,
    scope: 'international',
  },
  {
    id: 'cnnworld',
    name: 'CNN World',
    url: 'http://rss.cnn.com/rss/edition_world.rss',
    lang: 'en',
    weight: 0.8,
    scope: 'international',
  },
  {
    id: 'france24',
    name: 'France 24',
    url: 'https://www.france24.com/en/rss',
    lang: 'en',
    weight: 0.75,
    scope: 'international',
  },
  {
    id: 'anadolu',
    // মধ্যপ্রাচ্য ও মুসলিম বিশ্বের খবরে পশ্চিমা সোর্সের চেয়ে বিস্তারিত
    name: 'Anadolu Agency',
    url: 'https://www.aa.com.tr/en/rss/default?cat=world',
    lang: 'en',
    weight: 0.75,
    scope: 'international',
  },

  // ================= দক্ষিণ এশিয়া =================
  // প্রতিবেশী দেশের খবর বাংলাদেশি পাঠকের কাছে গুরুত্বপূর্ণ
  {
    id: 'thehindu',
    name: 'The Hindu',
    url: 'https://www.thehindu.com/news/international/feeder/default.rss',
    lang: 'en',
    weight: 0.75,
    scope: 'regional',
  },
  {
    id: 'toi',
    name: 'Times of India',
    url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
    lang: 'en',
    weight: 0.7,
    scope: 'regional',
  },

  // ================= বিষয়ভিত্তিক =================
  // প্রযুক্তি ও বিনোদন বিভাগে সাধারণ সোর্স থেকে যথেষ্ট খবর আসে না
  {
    id: 'theverge',
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    lang: 'en',
    weight: 0.7,
    scope: 'technology',
  },
  {
    id: 'variety',
    name: 'Variety',
    url: 'https://variety.com/feed/',
    lang: 'en',
    weight: 0.65,
    scope: 'entertainment',
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
