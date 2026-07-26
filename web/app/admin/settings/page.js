import { redirect } from 'next/navigation';
import { currentUser } from '../../../lib/auth.js';
import { getSettings } from '../../../lib/admin-db.js';
import { updateSettingAction } from '../actions.js';
import ChangePasswordForm from './change-password-form.js';
import NumberSetting from './number-setting.js';

export const dynamic = 'force-dynamic';

// সোর্সের তালিকা পাইপলাইনের sources.js এর সঙ্গে মিলিয়ে রাখা
const SOURCES = [
  { id: 'prothomalo', name: 'প্রথম আলো' },
  { id: 'bbcbangla', name: 'বিবিসি বাংলা' },
  { id: 'dailystar', name: 'The Daily Star' },
  { id: 'bbcworld', name: 'BBC World' },
  { id: 'aljazeera', name: 'Al Jazeera' },
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
      <h1>সেটিংস</h1>

      <h2>প্রতি রানে কতটা</h2>
      <NumberSetting
        settingKey="max_articles_per_run"
        value={Number(s.max_articles_per_run ?? 5)}
        title="আর্টিকেল"
        note="প্রতি ২ ঘণ্টায় সর্বোচ্চ কতটি খবর তৈরি হবে। বেশি দিলে LLM কোটা দ্রুত ফুরাবে।"
        min={1}
        max={20}
      />
      <NumberSetting
        settingKey="max_posts_per_run"
        value={Number(s.max_posts_per_run ?? 2)}
        title="ফেসবুক পোস্ট"
        note="প্রতি রানে সর্বোচ্চ কতটি পোস্ট। দিনে ১২ রান, তাই ২ দিলে ~২৪টি।"
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
          <div className="setting" key={src.id}>
            <div className="info">
              <b>
                {src.name} <span className={`badge ${off ? 'off' : 'ok'}`}>{off ? 'বন্ধ' : 'চালু'}</span>
              </b>
              <span>{src.id}</span>
            </div>
            <form action={updateSettingAction.bind(null, 'disabled_sources', next)}>
              <button className={`btn ${off ? 'primary' : 'danger'}`} type="submit">
                {off ? 'চালু করুন' : 'বন্ধ করুন'}
              </button>
            </form>
          </div>
        );
      })}

      <h2>নিজের পাসওয়ার্ড</h2>
      <div style={{ maxWidth: 420 }}>
        <ChangePasswordForm />
      </div>
    </>
  );
}
