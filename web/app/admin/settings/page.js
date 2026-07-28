import { redirect } from 'next/navigation';
import { currentUser } from '../../../lib/auth.js';
import { getSettings } from '../../../lib/admin-db.js';
import { updateSettingAction } from '../actions.js';
import ChangePasswordForm from './change-password-form.js';
import NumberSetting from './number-setting.js';
import TextSetting from './text-setting.js';
import AdsenseSlots from './adsense-slots.js';

export const dynamic = 'force-dynamic';

/**
 * সোর্সের তালিকা।
 *
 * পাইপলাইনের pipeline/src/sources.js থেকে সরাসরি ইমপোর্ট করা যায় না —
 * ওই ফাইলটি fast-xml-parser টানে, যা কেবল pipeline-এর node_modules-এ
 * আছে; ইমপোর্ট করলে সাইটের বিল্ডই ভেঙে যেত।
 *
 * তাই নামগুলো এখানে আলাদা করে লেখা। দুই জায়গা আলাদা হয়ে যাওয়ার
 * ঝুঁকিটা আসল — আগে এখানে ৫টি সোর্স ছিল অথচ পাইপলাইনে ১৬টি, ফলে
 * ১১টি সোর্স প্যানেল থেকে বন্ধই করা যেত না, আর কেউ টেরও পায়নি।
 * সেটা যেন আর না হয়, তাই pipeline/test/check-settings-sources.mjs
 * দুটো তালিকা মিলিয়ে দেখে — আলাদা হলেই ব্যর্থ হয়।
 */
const SOURCES = [
  // বাংলাদেশ
  { id: 'prothomalo', name: 'প্রথম আলো' },
  { id: 'bbcbangla', name: 'বিবিসি বাংলা' },
  { id: 'jagonews', name: 'জাগোনিউজ২৪' },
  { id: 'ajkerpatrika', name: 'আজকের পত্রিকা' },
  { id: 'dailystar', name: 'The Daily Star' },
  { id: 'tbsnews', name: 'The Business Standard' },
  // আন্তর্জাতিক
  { id: 'bbcworld', name: 'BBC World' },
  { id: 'aljazeera', name: 'Al Jazeera' },
  { id: 'guardian', name: 'The Guardian' },
  { id: 'cnnworld', name: 'CNN World' },
  { id: 'france24', name: 'France 24' },
  { id: 'anadolu', name: 'Anadolu Agency' },
  // আঞ্চলিক ও বিষয়ভিত্তিক
  { id: 'thehindu', name: 'The Hindu' },
  { id: 'toi', name: 'Times of India' },
  { id: 'theverge', name: 'The Verge' },
  { id: 'variety', name: 'Variety' },
];

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect('/admin/login');

  if (user.role !== 'admin') {
    return (
      <>
        <h1>সেটিংস</h1>
        <div className="msg err">সেটিংস কেবল অ্যাডমিন বদলাতে পারেন।</div>
        <h2>নিজের পাসওয়ার্ড</h2>
        <div style={{ maxWidth: 420 }}>
          <ChangePasswordForm />
        </div>
      </>
    );
  }

  const s = await getSettings();
  const disabled = Array.isArray(s.disabled_sources) ? s.disabled_sources : [];

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>সেটিংস</h1>
          <div className="sub">পাইপলাইন ও সোর্স নিয়ন্ত্রণ</div>
        </div>
      </header>

      <div className="adm-body">

      <h2>প্রতি রানে কতটা</h2>
      <NumberSetting
        settingKey="max_articles_per_run"
        value={Number(s.max_articles_per_run ?? 5)}
        title="আর্টিকেল"
        note="প্রতি রানে সর্বোচ্চ কতটি খবর তৈরি হবে। পাইপলাইন চলে প্রতি ঘণ্টায়, তাই ৮ দিলে দিনে ~১৯২টি। ফিডে আসে ~১৫/ঘণ্টা, তাই ১২-এর বেশি দিয়ে লাভ নেই।"
        min={1}
        max={20}
      />
      <NumberSetting
        settingKey="max_posts_per_run"
        value={Number(s.max_posts_per_run ?? 2)}
        title="ফেসবুক পোস্ট"
        note="প্রতি রানে সর্বোচ্চ কতটি পোস্ট। দিনে ২৪ রান, তাই ২ দিলে ~৪৮টি। বেশি দিলে ফেসবুক স্প্যাম ধরে রিচ কমিয়ে দিতে পারে।"
        min={0}
        max={10}
      />

      <h2>সোর্স</h2>
      <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
        কোনো সোর্স বন্ধ করলে সেখান থেকে আর খবর নেওয়া হবে না।
      </p>
      {SOURCES.map((src) => {
        const off = disabled.includes(src.id);
        const next = off ? disabled.filter((x) => x !== src.id) : [...disabled, src.id];
        return (
          <div className="ctl" key={src.id}>
            <div className="info">
              <b>
                {src.name} <span className={`badge ${off ? 'stop' : 'ok'}`}>{off ? 'বন্ধ' : 'চালু'}</span>
              </b>
              <span>{src.id}</span>
            </div>
            <form action={updateSettingAction.bind(null, 'disabled_sources', next)}>
              <button className={`btn ${off ? 'primary' : 'stop'}`} type="submit">
                {off ? 'চালু করুন' : 'বন্ধ করুন'}
              </button>
            </form>
          </div>
        );
      })}

      <h2>গুগল সংযুক্তি</h2>
      <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
        ঘর খালি রাখলে সংশ্লিষ্ট স্ক্রিপ্টটি সাইটে বসে না। অ্যাডমিন প্যানেলে
        Analytics কখনোই বসে না — নিজেদের কাজ যেন ট্রাফিক হিসেবে না গোনা হয়।
      </p>

      <TextSetting
        settingKey="google_analytics_id"
        value={s.google_analytics_id ?? ''}
        title="Google Analytics"
        note="GA4-এর Measurement ID। Analytics → Admin → Data streams-এ পাবেন।"
        placeholder="G-XXXXXXXXXX"
        pattern="^G-[A-Za-z0-9]{4,20}$"
        patternHint="G- দিয়ে শুরু হতে হবে, যেমন G-ABC1234567"
      />

      <TextSetting
        settingKey="google_site_verification"
        value={s.google_site_verification ?? ''}
        title="Search Console যাচাই"
        note='Search Console → HTML tag পদ্ধতি বেছে নিয়ে content="..." এর ভেতরের অংশটুকু বসান, পুরো ট্যাগ নয়।'
        placeholder="dBw5CvburAxi527Etm9AKiE..."
        pattern="^[\w-]{20,120}$"
        patternHint="কেবল টোকেনটুকু — <meta ...> ট্যাগ নয়"
      />

      <TextSetting
        settingKey="adsense_publisher_id"
        value={s.adsense_publisher_id ?? ''}
        title="AdSense Publisher ID"
        note="এটি বসালেই AdSense-এর স্ক্রিপ্ট সাইটে যায় — অনুমোদনের আবেদনের জন্য এটুকুই দরকার।"
        placeholder="ca-pub-0000000000000000"
        pattern="^ca-pub-\d{10,20}$"
        patternHint="ca-pub- দিয়ে শুরু, তারপর সংখ্যা"
      />

      <h2>AdSense-এর জায়গা</h2>
      <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
        যে জায়গায় নিজেদের বিজ্ঞাপন বসানো আছে সেখানে নিজেদেরটাই দেখা যাবে —
        AdSense কেবল ফাঁকা জায়গাগুলো ভরে।
      </p>
      <AdsenseSlots value={s.adsense_slots} />

      <h2>নিজের পাসওয়ার্ড</h2>
      <div style={{ maxWidth: 420 }}>
        <ChangePasswordForm />
      </div>
      </div>
    </>
  );
}
