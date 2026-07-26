import { redirect } from 'next/navigation';
import { currentUser } from '../../../lib/auth.js';
import { adminQuery } from '../../../lib/admin-db.js';
import { setUserActiveAction } from '../actions.js';
import NewUserForm from './new-user-form.js';
import ResetPasswordForm from './reset-form.js';

export const dynamic = 'force-dynamic';

const bnDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const M = ['জানু', 'ফেব', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
  const bn = (v) => String(v).replace(/[0-9]/g, (c) => '০১২৩৪৫৬৭৮৯'[Number(c)]);
  return `${bn(d.getDate())} ${M[d.getMonth()]} ${bn(d.getFullYear())}`;
};

export default async function UsersPage() {
  const user = await currentUser();
  if (!user) redirect('/admin/login');
  // UI লুকানো যথেষ্ট নয়, তাই পাতাতেও রোল যাচাই
  if (user.role !== 'admin') {
    return <div className="msg err">এই পাতা কেবল অ্যাডমিনের জন্য।</div>;
  }

  const users = (await adminQuery('admin_users?select=id,email,name,role,active,created_at,last_login&order=created_at.asc')) ?? [];

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>ব্যবহারকারী</h1>
          <div className="sub">অ্যাকাউন্ট ও রোল ব্যবস্থাপনা</div>
        </div>
      </header>

      <div className="adm-body">

      <table className="tbl">
        <thead>
          <tr>
            <th>নাম</th>
            <th>ইমেইল</th>
            <th style={{ width: 110 }}>রোল</th>
            <th style={{ width: 120 }}>শেষ লগইন</th>
            <th style={{ width: 100 }}>অবস্থা</th>
            <th style={{ width: 230 }}>কাজ</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.active ? undefined : 'dim'}>
              <td className="t">{u.name}</td>
              <td className="t">{u.email}</td>
              <td>
                <span className="badge role">{u.role === 'admin' ? 'অ্যাডমিন' : 'ম্যানেজার'}</span>
              </td>
              <td>{bnDate(u.last_login)}</td>
              <td>
                <span className={`badge ${u.active ? 'ok' : 'stop'}`}>{u.active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}</span>
              </td>
              <td>
                <div className="row-btns">
                  <ResetPasswordForm userId={u.id} name={u.name} />
                  {u.id !== user.id && (
                    <form action={setUserActiveAction.bind(null, u.id, !u.active)}>
                      <button className={`btn tiny ${u.active ? 'stop' : ''}`} type="submit">
                        {u.active ? 'নিষ্ক্রিয়' : 'সক্রিয়'}
                      </button>
                    </form>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>নতুন ব্যবহারকারী</h2>
      <div style={{ maxWidth: 460 }}>
        <NewUserForm />
      </div>

      <div className="tile" style={{ marginTop: 26 }}>
        <div className="l" style={{ marginBottom: 8 }}>রোল কী করতে পারে</div>
        <table className="tbl" style={{ background: 'transparent' }}>
          <thead>
            <tr><th>কাজ</th><th style={{ width: 110 }}>ম্যানেজার</th><th style={{ width: 110 }}>অ্যাডমিন</th></tr>
          </thead>
          <tbody>
            <tr><td className="t">খবর সম্পাদনা</td><td>✓</td><td>✓</td></tr>
            <tr><td className="t">খবর লুকানো / দেখানো</td><td>✓</td><td>✓</td></tr>
            <tr><td className="t">ফেসবুকে পাঠানো</td><td>✓</td><td>✓</td></tr>
            <tr><td className="t">খবর স্থায়ীভাবে মোছা</td><td>—</td><td>✓</td></tr>
            <tr><td className="t">অটোমেশন থামানো / চালু</td><td>—</td><td>✓</td></tr>
            <tr><td className="t">ব্যবহারকারী ব্যবস্থাপনা</td><td>—</td><td>✓</td></tr>
          </tbody>
        </table>
      </div>
      </div>
    </>
  );
}
