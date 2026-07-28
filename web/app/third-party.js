import Script from 'next/script';
import { isGaId, isAdsenseId } from '../lib/public-settings.js';

/**
 * তৃতীয় পক্ষের স্ক্রিপ্ট — Google Analytics ও AdSense।
 *
 * দুটোরই আইডি অ্যাডমিন প্যানেল থেকে আসে, কোডে লেখা নেই। আইডি খালি
 * থাকলে কিছুই বসে না — নতুন সাইটে বা লোকাল ডেভেলপমেন্টে অকারণে
 * Google-এ অনুরোধ যায় না, আর কনসোলে ভুয়া ত্রুটিও দেখায় না।
 *
 * `next/script`-এর afterInteractive ব্যবহার করা হয়েছে: স্ক্রিপ্টগুলো
 * পাতা আঁকা হওয়ার পরে নামে, তাই খবর দেখতে দেরি হয় না। beforeInteractive
 * দিলে Analytics-এর জন্য পাঠককে অপেক্ষা করতে হতো।
 */

export function GoogleAnalytics({ id }) {
  if (!isGaId(id)) return null;
  const gaId = String(id).trim();

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`}
        strategy="afterInteractive"
      />
      {/*
        gtag-এর বুটস্ট্র্যাপ কোডটা ইনলাইনই হতে হয়। gaId উপরে regex দিয়ে
        যাচাই করা (G- দিয়ে শুরু, কেবল অক্ষর-সংখ্যা), তাই এখান দিয়ে
        বাইরের কিছু ঢোকার পথ নেই।
      */}
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${gaId}');`}
      </Script>
    </>
  );
}

/**
 * AdSense-এর মূল স্ক্রিপ্ট।
 *
 * এই একটি স্ক্রিপ্টই তিনটে কাজ করে, তাই আলাদা সুইচ রাখা হয়নি:
 *   ১. Google সাইটটিকে চিনতে পারে — অনুমোদনের আবেদনের জন্য এটুকুই দরকার,
 *      কোনো বিজ্ঞাপনের ইউনিট বসানোর আগেই।
 *   ২. Auto ads চলে, যদি AdSense ড্যাশবোর্ড থেকে চালু করা থাকে।
 *   ৩. আমাদের বসানো ইউনিটগুলো (<AdSlot>) কাজ করে।
 *
 * Auto ads চালু/বন্ধ করার আসল সুইচ AdSense ড্যাশবোর্ডে, সাইটের কোডে নয় —
 * তাই এখানে ওটার নকল সুইচ রাখা হয়নি। পাতা থেকে থামানোর যে উপায়টা
 * (`pauseAdRequests`) চোখে পড়ে, সেটি Auto ads সহ সব বিজ্ঞাপনই থামায়,
 * আমাদের নিজেদের ইউনিটগুলোও — অর্থাৎ যা চাওয়া হচ্ছে তা নয়।
 */
export function AdSenseScript({ publisherId }) {
  if (!isAdsenseId(publisherId)) return null;
  const pub = String(publisherId).trim();

  return (
    <Script
      id="adsense"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(pub)}`}
      strategy="afterInteractive"
      crossOrigin="anonymous"
    />
  );
}
