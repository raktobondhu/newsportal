import { NextResponse } from 'next/server';
import { adminQuery, adminDbReady } from '../../../lib/admin-db.js';

/**
 * বিজ্ঞাপনে ক্লিক — গুনে রেখে গন্তব্যে পাঠানো।
 *
 * সরাসরি বিজ্ঞাপনদাতার লিংক না দিয়ে এই রুট হয়ে পাঠানো হয়, কারণ
 * বিজ্ঞাপন বিক্রি করতে হলে "কতজন ক্লিক করেছে" বলতে পারা লাগে।
 * পাতাগুলো স্ট্যাটিক, তাই দেখার হিসাব রাখা যায় না — কিন্তু ক্লিক
 * সবসময় সার্ভারে আসে, তাই সেটা রাখা যায়।
 */

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { id } = await params;
  const adId = Number(id);

  const home = new URL('/', process.env.SITE_URL || 'http://localhost:3000');
  if (!Number.isInteger(adId) || adId <= 0 || !adminDbReady()) {
    return NextResponse.redirect(home, 302);
  }

  let target = null;
  try {
    const rows = await adminQuery(`ads?select=link_url,active&id=eq.${adId}&limit=1`);
    const ad = rows?.[0];
    if (ad?.active && ad.link_url) target = ad.link_url;
  } catch {
    // ডেটাবেস নাগালে না থাকলে অন্তত হোমপেজে ফেরত যাক
  }

  if (!target) return NextResponse.redirect(home, 302);

  // গন্তব্য যাচাই — ডেটাবেসে javascript: বা data: বসিয়ে দিলে এই রুটটাই
  // ক্রস-সাইট স্ক্রিপ্টিংয়ের দরজা হয়ে যেত। কেবল http/https যাবে।
  let dest;
  try {
    dest = new URL(target);
    if (dest.protocol !== 'http:' && dest.protocol !== 'https:') {
      return NextResponse.redirect(home, 302);
    }
  } catch {
    return NextResponse.redirect(home, 302);
  }

  // গোনার কাজটা রিডাইরেক্ট আটকে রাখে না — await না করলে Vercel-এর
  // ফাংশন উত্তর দেওয়ার সাথে সাথে থেমে যেতে পারে আর লেখাটা হারায়।
  // তাই await, কিন্তু ব্যর্থ হলেও পাঠক গন্তব্যে পৌঁছাবেন।
  try {
    await adminQuery('rpc/bump_ad_click', {
      method: 'POST',
      prefer: 'return=minimal',
      body: { ad_id: adId },
    });
  } catch {
    // হিসাব রাখতে না পারলেও ক্লিকটা কাজ করা জরুরি
  }

  // 302 — স্থায়ী নয়। ব্রাউজার 301 মনে রেখে দিলে বিজ্ঞাপন বদলানোর পরেও
  // পুরোনো গন্তব্যে যেত, আর নতুন ক্লিকগুলো গোনাই হতো না।
  return NextResponse.redirect(dest, 302);
}
