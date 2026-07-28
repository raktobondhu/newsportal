/**
 * Supabase Storage বাকেট তৈরি করে — schema.sql চালানোর পর একবার।
 * SQL Editor দিয়ে বাকেট বানানো যায় না, তাই আলাদা স্ক্রিপ্ট।
 *
 *   node test/setup-buckets.mjs
 *
 * একাধিকবার চালালে সমস্যা নেই — বাকেট আগে থেকে থাকলে বলে দেবে।
 */
import { config } from '../src/config.js';

if (!config.supabase.url || !config.supabase.serviceKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY নেই — .env.local দেখুন।');
  process.exit(1);
}

const headers = {
  apikey: config.supabase.serviceKey,
  Authorization: `Bearer ${config.supabase.serviceKey}`,
  'Content-Type': 'application/json',
};

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const BUCKETS = {
  cards: { types: IMAGE_TYPES, limit: 5242880 },
  images: { types: IMAGE_TYPES, limit: 5242880 },
  // বিজ্ঞাপনে GIF-ও লাগে — ব্যানার প্রায়ই অ্যানিমেটেড হয়। SVG ইচ্ছাকৃতভাবে
  // বাদ: SVG-র ভেতরে <script> বসানো যায়, আর বাকেটটি পাবলিক।
  ads: { types: [...IMAGE_TYPES, 'image/gif'], limit: 3145728 },
};

for (const [id, spec] of Object.entries(BUCKETS)) {
  const res = await fetch(`${config.supabase.url}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id,
      name: id,
      public: true, // সাইট ও ফেসবুক দুটোই সরাসরি URL থেকে ছবি নেয়
      file_size_limit: spec.limit,
      allowed_mime_types: spec.types,
    }),
  });
  const body = await res.json().catch(() => ({}));
  const already = res.status === 409 || /already exists/i.test(body?.message ?? '');
  console.log(`bucket "${id}":`, already ? 'আগে থেকেই আছে' : res.ok ? 'তৈরি হয়েছে' : `ব্যর্থ — ${body?.message ?? res.status}`);
}

const list = await fetch(`${config.supabase.url}/storage/v1/bucket`, { headers });
const buckets = await list.json();
console.log('\nবর্তমান বাকেট:', buckets.map((b) => `${b.name} (public=${b.public})`).join(', '));

const missing = Object.keys(BUCKETS).filter((n) => !buckets.some((b) => b.name === n && b.public));
if (missing.length) {
  console.error(`\n⚠️ এখনো ঠিক নেই: ${missing.join(', ')} — পাবলিক বাকেট হিসেবে থাকতে হবে।`);
  process.exit(1);
}
console.log('\nসব ঠিক আছে।');
