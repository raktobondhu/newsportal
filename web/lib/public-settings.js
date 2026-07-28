/**
 * পাঠকের সাইট যে সেটিংসগুলো পড়ে — Analytics, Search Console, AdSense।
 *
 * অ্যাডমিন প্যানেলের admin-db.js থেকে আলাদা রাখা হয়েছে, দুটো কারণে:
 *
 *  ১. চাবি। ওটা service key দিয়ে পড়ে, যা RLS বাইপাস করে। পাঠকের পাতায়
 *     ওই ক্ষমতার দরকার নেই — এখানে anon key, আর RLS-এ নাম ধরে কেবল
 *     এই কয়টি কী পড়ার অনুমতি দেওয়া (দেখুন supabase/ads-schema.sql)।
 *
 *  ২. ক্যাশ। ওটা `cache: 'no-store'` দিয়ে পড়ে — প্যানেলে সবসময় সর্বশেষ
 *     অবস্থা চাই। পাঠকের পাতায় সেটা করলে গোটা সাইট ডাইনামিক হয়ে যেত,
 *     প্রতিটি ভিজিটে ডেটাবেসে যেত, আর ISR-এর সুবিধাটাই থাকত না।
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

/** articles.js-এর মতোই — রুট সেগমেন্টের revalidate-এর সঙ্গে মিলিয়ে রাখা */
export const REVALIDATE_SECONDS = 300;

const DEFAULTS = {
  google_analytics_id: '',
  google_site_verification: '',
  adsense_publisher_id: '',
  adsense_slots: {},
  ads_enabled: true,
};

/**
 * সেটিংস আনা। ডেটাবেস না থাকলে বা পড়তে না পারলে ডিফল্ট — অর্থাৎ
 * কোনো তৃতীয় পক্ষের স্ক্রিপ্ট বসে না। বিজ্ঞাপন বা Analytics আনতে
 * ব্যর্থ হলে গোটা সাইট ভেঙে পড়া অযৌক্তিক; খবরই আসল।
 */
export async function getPublicSettings() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { ...DEFAULTS };

  try {
    const keys = Object.keys(DEFAULTS);
    const url =
      `${SUPABASE_URL}/rest/v1/app_settings?select=key,value` +
      `&key=in.(${keys.join(',')})`;

    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);

    const out = { ...DEFAULTS };
    for (const row of await res.json()) {
      if (row.key in out) out[row.key] = row.value;
    }
    return out;
  } catch (err) {
    console.warn('সেটিংস আনা যায়নি, ডিফল্টে চলছি:', err.message);
    return { ...DEFAULTS };
  }
}

/**
 * Google-এর আইডিগুলো যাচাই — মান সরাসরি <script src> ও <meta> এ বসে,
 * তাই এখানে ঢিলেমি দিলে সেটিংসের ঘর দিয়ে যা খুশি HTML-এ ঢোকানো যেত।
 * প্যানেলেও একই যাচাই হয়; এখানেরটা শেষ বেড়া — ডেটাবেসে আগে থেকে
 * বসানো ভুল মানও যেন পাতায় না পৌঁছায়।
 */
export const isGaId = (v) => /^G-[A-Z0-9]{4,20}$/i.test(String(v ?? '').trim());
export const isAdsenseId = (v) => /^ca-pub-\d{10,20}$/i.test(String(v ?? '').trim());
export const isVerificationToken = (v) => /^[\w-]{20,120}$/.test(String(v ?? '').trim());
