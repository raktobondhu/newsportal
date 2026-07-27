import './globals.css';
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, SITE_URL } from '../lib/site.js';

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
export const metadata = {
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
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
