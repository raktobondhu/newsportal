import { redirect } from 'next/navigation';
import { currentUser } from '../../../lib/auth.js';
import { adminQuery } from '../../../lib/admin-db.js';
import { toggleHiddenAction, deleteArticleAction, postToFacebookAction } from '../actions.js';

export const dynamic = 'force-dynamic';

const bn = (v) => String(v).replace(/[0-9]/g, (c) => '০১২৩৪৫৬৭৮৯'[Number(c)]);

function ago(iso) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${bn(m)} মিনিট আগে`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${bn(h)} ঘণ্টা আগে`;
  return `${bn(Math.floor(h / 24))} দিন আগে`;
}

export default async function ArticlesPage({ searchParams }) {
  const user = await currentUser();
  if (!user) redirect('/admin/login');

  const sp = await searchParams;
  const q = (sp?.q ?? '').trim();
  const filter = sp?.filter ?? 'all';

  // PostgREST-এ ফিল্টার সাজাই। খোঁজার সময় ilike ব্যবহার করছি যাতে
  // ছোট-বড় হরফে পার্থক্য না হয় (বাংলায় প্রভাব নেই, ইংরেজি নামে আছে)।
  let query = 'articles?select=slug,headline,category,card_url,image_url,hidden,facebook_post_id,published_at,provider&order=published_at.desc&limit=100';
  if (q) query += `&or=(headline.ilike.*${encodeURIComponent(q)}*,summary.ilike.*${encodeURIComponent(q)}*)`;
  if (filter === 'hidden') query += '&hidden=eq.true';
  if (filter === 'visible') query += '&hidden=eq.false';
  if (filter === 'posted') query += '&facebook_post_id=not.is.null';
  if (filter === 'unposted') query += '&facebook_post_id=is.null';

  const rows = (await adminQuery(query)) ?? [];

  const tab = (key, label) => (
    <a
      className="btn tiny"
      href={`/admin/articles?filter=${key}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
      style={filter === key ? { borderColor: 'var(--accent)', color: '#fff' } : undefined}
    >
      {label}
    </a>
  );

  return (
    <>
      <h1>খবর ব্যবস্থাপনা</h1>

      <form style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          className="field"
          name="q"
          defaultValue={q}
          placeholder="শিরোনাম বা সারমর্মে খুঁজুন…"
          style={{ flex: 1, margin: 0, padding: '10px 12px', borderRadius: 8, background: '#0d1117', border: '1px solid var(--line)', color: 'var(--fg)' }}
        />
        <input type="hidden" name="filter" value={filter} />
        <button className="btn" type="submit">খুঁজুন</button>
      </form>

      <div className="btn-row" style={{ justifyContent: 'flex-start', marginBottom: 18 }}>
        {tab('all', 'সব')}
        {tab('visible', 'প্রকাশিত')}
        {tab('hidden', 'লুকানো')}
        {tab('posted', 'ফেসবুকে গেছে')}
        {tab('unposted', 'যায়নি')}
      </div>

      {rows.length === 0 ? (
        <div className="empty-note">কিছু পাওয়া যায়নি</div>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th style={{ width: 78 }}>ছবি</th>
              <th>শিরোনাম</th>
              <th style={{ width: 110 }}>বিভাগ</th>
              <th style={{ width: 120 }}>অবস্থা</th>
              <th style={{ width: 250 }}>কাজ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.slug} className={a.hidden ? 'dim' : undefined}>
                <td>
                  {a.image_url || a.card_url ? (
                    <img className="thumb" src={a.image_url || a.card_url} alt="" />
                  ) : (
                    <div className="thumb" />
                  )}
                </td>
                <td className="t">
                  <a href={`/admin/articles/${encodeURIComponent(a.slug)}`}>{a.headline}</a>
                  <div style={{ color: 'var(--muted)', fontSize: '.83rem', marginTop: 4 }}>
                    {ago(a.published_at)} · {a.provider ?? '—'}
                  </div>
                </td>
                <td>{a.category}</td>
                <td>
                  {a.hidden ? (
                    <span className="badge off">লুকানো</span>
                  ) : (
                    <span className="badge ok">প্রকাশিত</span>
                  )}
                  <br />
                  {a.facebook_post_id ? (
                    <span className="badge" style={{ marginTop: 5 }}>FB ✓</span>
                  ) : (
                    <span className="badge warn" style={{ marginTop: 5 }}>FB ✗</span>
                  )}
                </td>
                <td>
                  <div className="btn-row">
                    <a className="btn tiny" href={`/admin/articles/${encodeURIComponent(a.slug)}`}>সম্পাদনা</a>

                    <form action={toggleHiddenAction.bind(null, a.slug, !a.hidden)}>
                      <button className="btn tiny" type="submit">{a.hidden ? 'দেখান' : 'লুকান'}</button>
                    </form>

                    {!a.facebook_post_id && (
                      <form action={postToFacebookAction.bind(null, a.slug)}>
                        <button className="btn tiny" type="submit">FB-তে দিন</button>
                      </form>
                    )}

                    {user.role === 'admin' && (
                      <form action={deleteArticleAction.bind(null, a.slug)}>
                        <button className="btn tiny danger" type="submit">মুছুন</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="hint" style={{ marginTop: 14 }}>
        সর্বোচ্চ ১০০টি দেখানো হচ্ছে। “লুকান” করলে খবরটি সাইট থেকে সরে যায় কিন্তু ডেটাবেসে
        থেকে যায় — ভুল হলে আবার দেখানো যাবে। মোছা স্থায়ী, তাই কেবল অ্যাডমিন পারেন।
      </p>
    </>
  );
}
