import { getAds, placementLabel } from '../../lib/ads.js';
import { getPublicSettings, isAdsenseId } from '../../lib/public-settings.js';
import AdSenseUnit from './adsense-unit.js';

/**
 * বিজ্ঞাপনের একটি জায়গা।
 *
 * অগ্রাধিকারের ক্রমটা ইচ্ছাকৃত:
 *
 *   ১. নিজেদের বিক্রি করা বিজ্ঞাপন — সরাসরি টাকা, আর ক্লায়েন্টকে
 *      নির্দিষ্ট জায়গার প্রতিশ্রুতি দেওয়া থাকে।
 *   ২. না থাকলে AdSense — জায়গাটা অন্তত কিছু আয় করুক।
 *   ৩. দুটোর কোনোটাই না থাকলে কিছুই আঁকা হয় না, একটুও জায়গা নেয় না।
 *
 * তিন নম্বরটা জরুরি: ফাঁকা বাক্স ("বিজ্ঞাপন এখানে") রেখে দিলে নতুন
 * সাইটটা অসমাপ্ত দেখায়, আর পাঠক ওই জায়গাটা এড়িয়ে যেতে শিখে ফেলে।
 */
export default async function AdSlot({ placement, className = '' }) {
  const [settings, ads] = await Promise.all([getPublicSettings(), getAds(placement)]);

  const own = settings.ads_enabled === false ? [] : ads;

  if (own.length > 0) {
    return (
      <div className={`ad-slot ad-${placement} ${className}`.trim()}>
        <span className="ad-label">বিজ্ঞাপন</span>
        {own.map((ad) => (
          <OwnAd key={ad.id} ad={ad} />
        ))}
      </div>
    );
  }

  const slots = settings.adsense_slots ?? {};
  const slotId = typeof slots === 'object' ? slots[placement] : null;
  if (isAdsenseId(settings.adsense_publisher_id) && slotId) {
    return (
      <div className={`ad-slot ad-${placement} ${className}`.trim()}>
        <span className="ad-label">বিজ্ঞাপন</span>
        <AdSenseUnit client={String(settings.adsense_publisher_id).trim()} slot={String(slotId)} />
      </div>
    );
  }

  return null;
}

/**
 * ছবিটি next/image দিয়ে নয় — ইচ্ছাকৃত। বিজ্ঞাপনের ছবি GIF হতে পারে
 * (অ্যানিমেশন), আর Next-এর অপ্টিমাইজার GIF-এর নড়াচড়া ফেলে দেয়।
 * তাছাড়া বিজ্ঞাপনদাতা যে ফাইলটা দিয়েছেন হুবহু সেটাই দেখানো উচিত।
 */
function OwnAd({ ad }) {
  const img = (
    <img
      src={ad.imageUrl}
      alt={ad.alt || ad.name || placementLabel(ad.placement)}
      loading="lazy"
    />
  );

  if (!ad.linkUrl) return <div className="ad-img">{img}</div>;

  return (
    <a
      className="ad-img"
      href={`/go/${ad.id}`}
      // sponsored — Google-কে জানায় এটি টাকার বিনিময়ে দেওয়া লিংক।
      // না দিলে বিজ্ঞাপনের লিংকগুলো সম্পাদকীয় সুপারিশ হিসেবে গোনা হয়,
      // যা সার্চ র‍্যাঙ্কিংয়ে জরিমানার কারণ হতে পারে।
      rel="sponsored noopener nofollow"
      target="_blank"
    >
      {img}
    </a>
  );
}
