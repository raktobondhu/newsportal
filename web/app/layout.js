import './globals.css';
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, SITE_URL } from '../lib/site.js';
import { getPublicSettings, isVerificationToken } from '../lib/public-settings.js';

/**
 * সর্বোচ্চ স্তরের লেআউট — কেবল html/body আর সাধারণ স্টাইল।
 *
 * সাইটের হেডার-ফুটার ইচ্ছাকৃতভাবে এখানে নেই। আগে ছিল, ফলে
 * /admin এর পাতাগুলোও সাইটের মেনুর নিচে বসত — অ্যাডমিন লগইন
 * পাতার উপরে "সর্বশেষ, জাতীয়, রাজনীতি…" দেখা যেত।
 *
 * Next.js-এ রুট লেআউট এড়ানো যায় না, তাই সাইটের খোলসটা সরিয়ে
 * (site)/layout.js এ নেওয়া হয়েছে; অ্যাডমিন তার নিজের খোলস আঁকে।
 */
/**
 * metadata স্থির নয়, কারণ Search Console-এর যাচাই টোকেনটি অ্যাডমিন
 * প্যানেল থেকে আসে। Google ওই <meta> ট্যাগটি সাইটের যেকোনো পাতায়
 * খুঁজে নিতে পারে, তাই এটি রুট লেআউটেই — অ্যাডমিন পাতাগুলোতেও যায়,
 * তাতে ক্ষতি নেই।
 *
 * Analytics ও AdSense কিন্তু এখানে নয়, (site)/layout.js এ —
 * অ্যাডমিন প্যানেলে ঢুকলে যেন নিজেদের কাজ Analytics-এ ট্রাফিক
 * হিসেবে গোনা না হয়, আর বিজ্ঞাপনের স্ক্রিপ্টও যেন সেখানে না বসে।
 */
export async function generateMetadata() {
  const { google_site_verification: token } = await getPublicSettings();

  return {
    metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
    title: {
      default: `${SITE_NAME} — ${SITE_TAGLINE}`,
      template: `%s | ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    openGraph: {
      siteName: SITE_NAME,
      locale: 'bn_BD',
      type: 'website',
    },
    ...(isVerificationToken(token) ? { verification: { google: String(token).trim() } } : {}),
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
