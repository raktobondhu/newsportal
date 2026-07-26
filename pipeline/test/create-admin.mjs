/**
 * প্রথম অ্যাডমিন অ্যাকাউন্ট তৈরি — মুরগি-ডিমের সমস্যার সমাধান।
 * প্যানেলে ব্যবহারকারী যোগ করতে হলে আগে একজনকে লগইন করতে হয়, তাই
 * প্রথমজনকে বাইরে থেকে বানাতে হয়।
 *
 *   node test/create-admin.mjs "ইমেইল" "পাসওয়ার্ড" "নাম"
 *
 * একই ইমেইলে আবার চালালে পাসওয়ার্ড ও রোল হালনাগাদ হয় — পাসওয়ার্ড
 * ভুলে গেলে এভাবেই ফিরে পাওয়া যাবে।
 */
import crypto from 'node:crypto';
import { config } from '../src/config.js';

const [email, password, name = 'অ্যাডমিন'] = process.argv.slice(2);

if (!email || !password) {
  console.error('ব্যবহার: node test/create-admin.mjs "ইমেইল" "পাসওয়ার্ড" "নাম"');
  process.exit(1);
}
if (password.length < 8) {
  console.error('পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে।');
  process.exit(1);
}
if (!config.supabase.url || !config.supabase.serviceKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY নেই — .env.local দেখুন।');
  process.exit(1);
}

/** web/lib/auth.js এর hashPassword এর হুবহু একই ফরম্যাট */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

const headers = {
  apikey: config.supabase.serviceKey,
  Authorization: `Bearer ${config.supabase.serviceKey}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=minimal',
};

const res = await fetch(`${config.supabase.url}/rest/v1/admin_users`, {
  method: 'POST',
  headers,
  body: JSON.stringify([
    {
      email: email.trim().toLowerCase(),
      name,
      role: 'admin',
      active: true,
      password_hash: hashPassword(password),
    },
  ]),
});

if (!res.ok) {
  const text = await res.text();
  console.error('ব্যর্থ:', res.status, text.slice(0, 200));
  if (text.includes('admin_users')) {
    console.error('\nadmin-schema.sql চালানো হয়েছে তো? Supabase → SQL Editor।');
  }
  process.exit(1);
}

console.log(`✓ অ্যাডমিন তৈরি হয়েছে: ${email}`);
console.log('  এখন /admin/login এ গিয়ে ঢুকতে পারবেন।');
