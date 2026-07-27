/**
 * সাইটের পরিচয় — এক জায়গায়।
 *
 * আগে নামটা ১১টি ফাইলে ছড়ানো ছিল। রিব্র্যান্ড করতে গিয়ে একটা ফাইল বাদ
 * পড়লে সাইটের এক কোণে পুরোনো নাম রয়ে যেত — শিরোনামে এক নাম, ফুটারে
 * আরেক। এখন নাম বদলাতে হলে কেবল একটি environment variable বদলালেই হয়,
 * কোড ছুঁতে হয় না।
 *
 * পাইপলাইনের দিকে একই কাজ করে pipeline/src/config.js (SITE_NAME)।
 */

export const SITE_NAME = process.env.SITE_NAME || 'লিখুন';

/** ব্রাউজার ট্যাব ও সার্চ ফলাফলে যা দেখা যায় */
export const SITE_TAGLINE = process.env.SITE_TAGLINE || 'সর্বশেষ বাংলা সংবাদ';

export const SITE_DESCRIPTION =
  process.env.SITE_DESCRIPTION || `দেশ ও বিশ্বের নির্বাচিত সংবাদ, বাংলায় — ${SITE_NAME}।`;

/** শেষে স্ল্যাশ থাকলে দুটো স্ল্যাশওয়ালা লিংক তৈরি হয়, তাই ছেঁটে দিই */
export const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
