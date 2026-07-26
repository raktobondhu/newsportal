import { redirect } from 'next/navigation';
import { currentUser } from '../../../lib/auth.js';
import { adminQuery } from '../../../lib/admin-db.js';

export const dynamic = 'force-dynamic';

const LABEL = {
  login: 'লগইন',
  hide: 'খবর লুকিয়েছেন',
  unhide: 'খবর দেখিয়েছেন',
  edit: 'খবর সম্পাদনা',
  delete: 'খবর মুছেছেন',
  post: 'ফেসবুকে পাঠিয়েছেন',
  settings: 'সেটিংস বদলেছেন',
  user: 'ব্যবহারকারী',
};

const bn = (v) => String(v).replace(/[0-9]/g, (c) => '০১২৩৪৫৬৭৮৯'[Number(c)]);

function when(iso) {
  const d = new Date(iso);
  const M = ['জানু', 'ফেব', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${bn(d.getDate())} ${M[d.getMonth()]}, ${bn(hh)}:${bn(mm)}`;
}

export default async function LogPage() {
  const user = await currentUser();
  if (!user) redirect('/admin/login');

  const rows = (await adminQuery('admin_audit?select=*&order=created_at.desc&limit=200')) ?? [];

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>কাজের হিসাব</h1>
          <div className="sub">কে কখন কী করেছেন</div>
        </div>
      </header>

      <div className="adm-body">
      <p className="hint" style={{ marginTop: -12, marginBottom: 18 }}>
        কে কখন কী করেছেন। একাধিক মানুষ কাজ করলে এটাই ভরসা — সর্বশেষ ২০০টি।
      </p>

      {rows.length === 0 ? (
        <div className="empty">এখনো কোনো কাজ নথিভুক্ত হয়নি</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 140 }}>কখন</th>
              <th style={{ width: 200 }}>কে</th>
              <th style={{ width: 170 }}>কী</th>
              <th>কোনটিতে</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{when(r.created_at)}</td>
                <td className="t">{r.actor}</td>
                <td>{LABEL[r.action] ?? r.action}</td>
                <td className="t" style={{ color: 'var(--muted)', fontSize: '.88rem', wordBreak: 'break-all' }}>
                  {r.target ?? '—'}
                  {r.detail?.action ? ` · ${r.detail.action}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>
    </>
  );
}
