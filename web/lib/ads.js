/**
 * বিজ্ঞাপন পড়া — পাঠকের সাইটের দিক।
 *
 * anon key দিয়ে, RLS-এ কেবল `active = true` সারিগুলো বাইরে যায়
 * (supabase/ads-schema.sql)। মেয়াদের যাচাই এখানে হয়, পলিসিতে নয় —
 * কারণ পলিসিতে now() বসালে একই অনুরোধের উত্তর সময়ের সাথে বদলাত আর
 * ক্যাশ করা যেত না।
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

/**
 * খবরের সঙ্গে একই মেয়াদ — ছোট দেওয়া যায় না।
 *
 * Next.js একটি রুটের revalidate ঠিক করে ওই রুটের সব fetch-এর মধ্যে
 * সবচেয়ে ছোটটি দেখে। এখানে ৬০ দিলে গোটা সাইটের প্রতিটি পাতা ৫ মিনিটের
 * বদলে ১ মিনিট পরপর নতুন হতো — বিজ্ঞাপনের জন্য খবরের অনুরোধও পাঁচগুণ
 * বেড়ে যেত।
 *
 * তাতে বিজ্ঞাপন দেরিতে দেখা যায় না: প্যানেল থেকে বদলালেই
 * revalidatePath() ক্যাশ ঝেড়ে ফেলে, তাই বদল সঙ্গে সঙ্গেই সাইটে আসে।
 * এই সময়টা কেবল শেষ ভরসা — যদি কেউ সরাসরি ডেটাবেসে হাত দেন।
 */
export const REVALIDATE_SECONDS = 300;

/**
 * বিজ্ঞাপনের জায়গা। supabase/ads-schema.sql-এর মন্তব্য ও অ্যাডমিন
 * ফর্মের তালিকা এখান থেকেই আসে, তাই নতুন জায়গা যোগ করতে হলে
 * কেবল এখানে যোগ করলেই প্যানেলে দেখা যাবে — কিন্তু সাইটে দেখাতে
 * সংশ্লিষ্ট পাতায় <AdSlot> বসাতেও হবে।
 */
export const AD_PLACEMENTS = [
  { id: 'header_top', label: 'হেডারের নিচে', note: 'পুরো চওড়া ব্যানার, সব পাতায়' },
  { id: 'home_top', label: 'হোমপেজ — প্রধান খবরের পরে', note: 'সবচেয়ে দামি জায়গা' },
  { id: 'home_mid', label: 'হোমপেজ — বিভাগের মাঝখানে', note: 'দ্বিতীয় বিভাগের পরে' },
  { id: 'home_bottom', label: 'হোমপেজ — একদম নিচে', note: '' },
  { id: 'sidebar', label: 'ডান পাশের রেলে', note: 'হোমপেজে, "সর্বশেষ" তালিকার নিচে' },
  { id: 'article_top', label: 'খবরের পাতা — লেখার আগে', note: '' },
  { id: 'article_mid', label: 'খবরের পাতা — লেখার মাঝখানে', note: 'অনুচ্ছেদের ফাঁকে' },
  { id: 'article_bottom', label: 'খবরের পাতা — লেখার পরে', note: '' },
  { id: 'footer', label: 'ফুটারের উপরে', note: 'সব পাতায়' },
];

export const PLACEMENT_IDS = AD_PLACEMENTS.map((p) => p.id);
export const placementLabel = (id) =>
  AD_PLACEMENTS.find((p) => p.id === id)?.label ?? id;

function fromRow(r) {
  return {
    id: r.id,
    name: r.name,
    placement: r.placement,
    imageUrl: r.image_url,
    linkUrl: r.link_url,
    alt: r.alt,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
  };
}

/** মেয়াদ চলছে কি না */
function isRunning(row, now) {
  if (row.starts_at && new Date(row.starts_at) > now) return false;
  if (row.ends_at && new Date(row.ends_at) < now) return false;
  return true;
}

/**
 * একটি জায়গার চালু বিজ্ঞাপনগুলো।
 *
 * সব জায়গার বিজ্ঞাপন একবারে না এনে জায়গা ধরে আলাদা অনুরোধ করা হয় —
 * Next.js প্রতিটি URL আলাদা ক্যাশ-কী ধরে, তাই একটি জায়গার বিজ্ঞাপন
 * বদলালে বাকিগুলোর ক্যাশ নষ্ট হয় না। এক রেন্ডারে একই জায়গা দুবার
 * চাইলে fetch নিজেই ডিডুপ করে।
 */
export async function getAds(placement) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/ads` +
      `?select=id,name,placement,image_url,link_url,alt,starts_at,ends_at` +
      `&placement=eq.${encodeURIComponent(placement)}` +
      `&active=eq.true&order=sort.asc,id.desc&limit=20`;

    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);

    const now = new Date();
    return (await res.json()).filter((r) => isRunning(r, now)).map(fromRow);
  } catch (err) {
    // বিজ্ঞাপন আনতে না পারলে জায়গাটা ফাঁকা থাক — খবর পড়া আটকানোর
    // মতো ব্যাপার এটা নয়
    console.warn(`বিজ্ঞাপন আনা যায়নি (${placement}):`, err.message);
    return [];
  }
}
