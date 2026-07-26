import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/auth.js';
import { adminQuery, getSettings } from '../../lib/admin-db.js';
import { updateSettingAction } from './actions.js';

export const dynamic = 'force-dynamic';

function Stat({ n, label }) {
  return (
    <div className="adm-card">
      <div className="n">{n}</div>
      <div className="l">{label}</div>
    </div>
  );
}

const bn = (v) => String(v).replace(/[0-9]/g, (c) => '০১২৩৪৫৬৭৮৯'[Number(c)]);

export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect('/admin/login');

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Prefer: count=exact দিয়ে সারি না এনেই গোনা যায় — ড্যাশবোর্ডে
  // হাজারো সারি টেনে আনার দরকার নেই
  const count = async (q) => {
    const res = await adminQuery(`articles?select=slug&${q}&limit=1`, { prefer: 'count=exact' });
    return Array.isArray(res) ? res.length : 0;
  };

  const [recent, settings] = await Promise.all([
    adminQuery(
      `articles?select=slug,headline,category,card_style,provider,hidden,facebook_post_id,published_at&order=published_at.desc&limit=400`
    ),
    getSettings(),
  ]);

  const list = recent ?? [];
  const last24 = list.filter((a) => a.published_at >= dayAgo);
  const last7 = list.filter((a) => a.published_at >= weekAgo);

  const posted24 = last24.filter((a) => a.facebook_post_id).length;
  const hidden = list.filter((a) => a.hidden).length;

  const byCategory = {};
  for (const a of last7) byCategory[a.category] = (byCategory[a.category] ?? 0) + 1;
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const byProvider = {};
  for (const a of last7) byProvider[a.provider ?? '—'] = (byProvider[a.provider ?? '—'] ?? 0) + 1;

  const byStyle = {};
  for (const a of last7) byStyle[a.card_style ?? '—'] = (byStyle[a.card_style ?? '—'] ?? 0) + 1;

  const automationOn = settings.automation_enabled !== false;
  const facebookOn = settings.facebook_enabled !== false;

  return (
    <>
      <h1>ড্যাশবোর্ড</h1>

      {/* থামানোর সুইচ সবার উপরে — জরুরি অবস্থায় খুঁজতে হবে না */}
      <div className="setting">
        <div className="info">
          <b>
            অটোমেশন{' '}
            <span className={`badge ${automationOn ? 'ok' : 'off'}`}>{automationOn ? 'চালু' : 'বন্ধ'}</span>
          </b>
          <span>
            {automationOn
              ? 'প্রতি ২ ঘণ্টায় নতুন খবর সংগ্রহ ও প্রকাশ হচ্ছে।'
              : 'বন্ধ আছে — পাইপলাইন চললেও কিছু করবে না।'}
          </span>
        </div>
        {user.role === 'admin' ? (
          <form action={updateSettingAction.bind(null, 'automation_enabled', !automationOn)}>
            <button className={`btn ${automationOn ? 'danger' : 'primary'}`} type="submit">
              {automationOn ? '⏸ থামান' : '▶ চালু করুন'}
            </button>
          </form>
        ) : (
          <span className="badge">কেবল অ্যাডমিন বদলাতে পারেন</span>
        )}
      </div>

      <div className="setting">
        <div className="info">
          <b>
            ফেসবুকে প্রকাশ{' '}
            <span className={`badge ${facebookOn ? 'ok' : 'off'}`}>{facebookOn ? 'চালু' : 'বন্ধ'}</span>
          </b>
          <span>বন্ধ থাকলে খবর সাইটে যাবে, ফেসবুকে নয়।</span>
        </div>
        {user.role === 'admin' && (
          <form action={updateSettingAction.bind(null, 'facebook_enabled', !facebookOn)}>
            <button className={`btn ${facebookOn ? 'danger' : 'primary'}`} type="submit">
              {facebookOn ? '⏸ থামান' : '▶ চালু করুন'}
            </button>
          </form>
        )}
      </div>

      <h2>এক নজরে</h2>
      <div className="adm-cards">
        <Stat n={bn(last24.length)} label="২৪ ঘণ্টায় খবর" />
        <Stat n={bn(posted24)} label="২৪ ঘণ্টায় ফেসবুক পোস্ট" />
        <Stat n={bn(last7.length)} label="৭ দিনে খবর" />
        <Stat n={bn(hidden)} label="লুকানো খবর" />
      </div>

      <h2>৭ দিনে বিভাগ অনুযায়ী</h2>
      <div className="adm-cards">
        {topCategories.length === 0 && <div className="empty-note">এখনো তথ্য নেই</div>}
        {topCategories.map(([c, n]) => (
          <Stat key={c} n={bn(n)} label={c} />
        ))}
      </div>

      <h2>কার্ডের ধরন ও মডেল (৭ দিন)</h2>
      <div className="adm-cards">
        {Object.entries(byStyle).map(([k, n]) => (
          <Stat key={k} n={bn(n)} label={k === 'photo' ? 'পূর্ণ ছবি' : k === 'band' ? 'ব্যান্ড' : 'টেক্সট'} />
        ))}
        {Object.entries(byProvider).map(([k, n]) => (
          <Stat key={k} n={bn(n)} label={k} />
        ))}
      </div>
    </>
  );
}
