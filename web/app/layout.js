import './globals.css';

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
  metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
  title: {
    default: 'কথা ম্যাট্রিক্স — সর্বশেষ বাংলা সংবাদ',
    template: '%s | কথা ম্যাট্রিক্স',
  },
  description: 'দেশ ও বিশ্বের নির্বাচিত সংবাদ, বাংলায় — কথা ম্যাট্রিক্স।',
  openGraph: {
    siteName: 'কথা ম্যাট্রিক্স',
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
