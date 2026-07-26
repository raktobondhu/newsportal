import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/auth.js';
import { adminQuery, getSettings } from '../../lib/admin-db.js';
import { updateSettingAction } from './actions.js';

export const dynamic = 'force-dynamic';

const bn = (v) => String(v).replace(/[0-9]/g, (c) => '০১২৩৪৫৬৭৮৯'[Number(c)]);
const DAYS = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];

function Tile({ n, label, note, noteKind }) {
  return (
    <div className="tile">
      <div className="n">{n}</div>
      <div className="l">{label}</div>
      {note && <div className={`d ${noteKind ?? ''}`}>{note}</div>}
    </div>
  );
}

/**
 * ৭ দিনের কার্যক্রম — একটিমাত্র সিরিজ, তাই লেজেন্ড লাগে না; শিরোনামই
 * বলে দিচ্ছে কীসের হিসাব। বার বেসলাইনে গাঁথা, উপরের প্রান্ত গোল।
 * প্রতিটির উপরে সংখ্যাটাই সরাসরি লেখা — আলাদা অক্ষ রেখা লাগে না।
 */
function SevenDays({ counts }) {
  const max = Math.max(1, ...counts.map((c) => c.n));
  return (
    <div className="spark">
      <div style={{ color: 'var(--ink-2)', fontSize: '.95rem', fontWeight: 600 }}>৭ দিনে প্রকাশিত খবর</div>
      <div className="bars">
        {counts.map((c) => (
          <div className="col" key={c.key} title={`${c.label}: ${bn(c.n)} টি`}>
            <div className="val">{bn(c.n)}</div>
            {/* শূন্য দিনে ব্র্যান্ডের রঙে রেখা আঁকলে মনে হয় কিছু আছে —
                তাই শূন্যের জন্য আলাদা, নিরপেক্ষ রেখা */}
            <div
              className={c.n === 0 ? 'bar zero' : 'bar'}
              style={{ height: c.n === 0 ? '2px' : `${Math.max(6, (c.n / max) * 100)}%` }}
            />
            <div className="cap">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect('/admin/login');

  const list =
    (await adminQuery(
      'articles?select=slug,category,card_style,provider,hidden,facebook_post_id,published_at&order=published_at.desc&limit=600'
    )) ?? [];

  const now = Date.now();
  const since = (h) => new Date(now - h * 3600000).toISOString();

  const last24 = list.filter((a) => a.published_at >= since(24));
  const prev24 = list.filter((a) => a.published_at >= since(48) && a.published_at < since(24));
  const last7 = list.filter((a) => a.published_at >= since(168));

  const posted24 = last24.filter((a) => a.facebook_post_id).length;
  const hidden = list.filter((a) => a.hidden).length;
  const withPhoto = last7.filter((a) => a.card_style !== 'text').length;
  const photoPct = last7.length ? Math.round((withPhoto / last7.length) * 100) : 0;

  const diff = last24.length - prev24.length;

  // দিনভিত্তিক হিসাব — আজ থেকে পিছিয়ে ৭ দিন
  const counts = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    counts.push({
      key,
      label: i === 0 ? 'আজ' : DAYS[d.getDay()],
      n: list.filter((a) => a.published_at?.slice(0, 10) === key).length,
    });
  }

  const byCategory = {};
  for (const a of last7) byCategory[a.category] = (byCategory[a.category] ?? 0) + 1;
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const byProvider = {};
  for (const a of last7) byProvider[a.provider ?? 'অজানা'] = (byProvider[a.provider ?? 'অজানা'] ?? 0) + 1;

  const settings = await getSettings();
  const autoOn = settings.automation_enabled !== false;
  const fbOn = settings.facebook_enabled !== false;

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>ড্যাশবোর্ড</h1>
          <div className="sub">স্বাগতম, {user.name}</div>
        </div>
      </header>

      <div className="adm-body">
        {/* নিয়ন্ত্রণ সবার উপরে — জরুরি অবস্থায় খুঁজতে হবে না */}
        <div className="ctl">
          <div className="info">
            <b>
              অটোমেশন
              <span className={`badge ${autoOn ? 'ok' : 'stop'}`}>{autoOn ? '● চালু' : '■ বন্ধ'}</span>
            </b>
            <span>
              {autoOn
                ? 'প্রতি ঘণ্টায় নতুন খবর সংগ্রহ, বাংলায় পুনর্লিখন ও প্রকাশ হচ্ছে।'
                : 'বন্ধ আছে — নির্ধারিত সময়ে পাইপলাইন চললেও কিছুই করবে না।'}
            </span>
          </div>
          {user.role === 'admin' ? (
            <form action={updateSettingAction.bind(null, 'automation_enabled', !autoOn)}>
              <button className={`btn ${autoOn ? 'stop' : 'primary'}`} type="submit">
                {autoOn ? '⏸ থামান' : '▶ চালু করুন'}
              </button>
            </form>
          ) : (
            <span className="badge">কেবল অ্যাডমিন</span>
          )}
        </div>

        <div className="ctl">
          <div className="info">
            <b>
              ফেসবুকে প্রকাশ
              <span className={`badge ${fbOn ? 'ok' : 'stop'}`}>{fbOn ? '● চালু' : '■ বন্ধ'}</span>
            </b>
            <span>বন্ধ থাকলে খবর সাইটে যাবে, ফেসবুকে নয়।</span>
          </div>
          {user.role === 'admin' && (
            <form action={updateSettingAction.bind(null, 'facebook_enabled', !fbOn)}>
              <button className={`btn ${fbOn ? 'stop' : 'primary'}`} type="submit">
                {fbOn ? '⏸ থামান' : '▶ চালু করুন'}
              </button>
            </form>
          )}
        </div>

        <h2>এক নজরে</h2>
        <div className="tiles">
          <Tile
            n={bn(last24.length)}
            label="২৪ ঘণ্টায় খবর"
            note={diff === 0 ? 'আগের দিনের সমান' : `আগের দিনের চেয়ে ${bn(Math.abs(diff))} ${diff > 0 ? 'বেশি' : 'কম'}`}
            noteKind={diff > 0 ? 'up' : 'down'}
          />
          <Tile n={bn(posted24)} label="২৪ ঘণ্টায় ফেসবুক পোস্ট" />
          <Tile n={bn(last7.length)} label="৭ দিনে খবর" />
          <Tile n={bn(photoPct) + '%'} label="৭ দিনে ছবিসহ কার্ড" />
          <Tile n={bn(hidden)} label="লুকানো খবর" />
        </div>

        <h2>কার্যক্রম</h2>
        <SevenDays counts={counts} />

        <h2>৭ দিনে বিভাগ অনুযায়ী</h2>
        <div className="tiles">
          {topCategories.length === 0 ? (
            <div className="empty">এখনো তথ্য নেই</div>
          ) : (
            topCategories.map(([c, n]) => <Tile key={c} n={bn(n)} label={c} />)
          )}
        </div>

        <h2>কোন মডেল কতটা লিখেছে (৭ দিন)</h2>
        <div className="tiles">
          {Object.entries(byProvider).map(([k, n]) => (
            <Tile key={k} n={bn(n)} label={k} />
          ))}
        </div>
      </div>
    </>
  );
}
