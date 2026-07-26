import { redirect } from 'next/navigation';
import { currentUser } from '../../../lib/auth.js';
import { adminQuery } from '../../../lib/admin-db.js';
import { toggleHiddenAction, deleteArticleAction, postToFacebookAction } from '../actions.js';

export const dynamic = 'force-dynamic';

const bn = (v) => String(v).replace(/[0-9]/g, (c) => '০১২৩৪৫৬৭৮৯'[Number(c)]);

function ago(iso) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'এইমাত্র';
  if (m < 60) return `${bn(m)} মিনিট আগে`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${bn(h)} ঘণ্টা আগে`;
  return `${bn(Math.floor(h / 24))} দিন আগে`;
}

const FILTERS = [
  ['all', 'সব'],
  ['visible', 'প্রকাশিত'],
  ['hidden', 'লুকানো'],
  ['posted', 'ফেসবুকে গেছে'],
  ['unposted', 'যায়নি'],
];

export default async function ArticlesPage({ searchParams }) {
  const user = await currentUser();
  if (!user) redirect('/admin/login');

  const sp = await searchParams;
  const q = (sp?.q ?? '').trim();
  const filter = sp?.filter ?? 'all';

  let query =
    'articles?select=slug,headline,category,card_url,image_url,hidden,facebook_post_id,published_at,provider,card_style' +
    '&order=published_at.desc&limit=100';
  if (q) query += `&or=(headline.ilike.*${encodeURIComponent(q)}*,summary.ilike.*${encodeURIComponent(q)}*)`;
  if (filter === 'hidden') query += '&hidden=eq.true';
  if (filter === 'visible') query += '&hidden=eq.false';
  if (filter === 'posted') query += '&facebook_post_id=not.is.null';
  if (filter === 'unposted') query += '&facebook_post_id=is.null';

  const rows = (await adminQuery(query)) ?? [];

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>খবর</h1>
          <div className="sub">{bn(rows.length)} টি দেখানো হচ্ছে</div>
        </div>
      </header>

      <div className="adm-body">
        {/* খোঁজা ও ফিল্টার এক সারিতে, তালিকার ঠিক উপরে */}
        <div className="toolbar">
          <form style={{ display: 'flex', gap: 9, flex: 1, minWidth: 240 }}>
            <input type="search" name="q" defaultValue={q} placeholder="শিরোনাম বা সারমর্মে খুঁজুন…" />
            <input type="hidden" name="filter" value={filter} />
            <button className="btn" type="submit">খুঁজুন</button>
          </form>
          <div className="chips">
            {FILTERS.map(([key, label]) => (
              <a
                key={key}
                className={filter === key ? 'on' : undefined}
                href={`/admin/articles?filter=${key}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              >
                {label}
              </a>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="panel">
            <div className="empty">কিছু পাওয়া যায়নি</div>
          </div>
        ) : (
          <div className="panel">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 88 }}></th>
                  <th>শিরোনাম</th>
                  <th style={{ width: 106 }}>বিভাগ</th>
                  <th style={{ width: 128 }}>অবস্থা</th>
                  <th style={{ width: 300 }}></th>
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
                    <td>
                      <a className="title" href={`/admin/articles/${encodeURIComponent(a.slug)}`}>
                        {a.headline}
                      </a>
                      <div className="meta">
                        {ago(a.published_at)} · {a.provider ?? '—'} · {a.card_style ?? '—'}
                      </div>
                    </td>
                    <td>{a.category}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
                        <span className={`badge ${a.hidden ? 'stop' : 'ok'}`}>
                          {a.hidden ? '■ লুকানো' : '● প্রকাশিত'}
                        </span>
                        <span className={`badge ${a.facebook_post_id ? 'ok' : 'warn'}`}>
                          {a.facebook_post_id ? '✓ ফেসবুকে' : '— যায়নি'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="row-btns">
                        <a className="btn tiny" href={`/admin/articles/${encodeURIComponent(a.slug)}`}>
                          সম্পাদনা
                        </a>
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
                            <button className="btn tiny stop" type="submit">মুছুন</button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="hint" style={{ marginTop: 14 }}>
          সর্বোচ্চ ১০০টি দেখানো হয়। <b>লুকান</b> করলে খবরটি সাইট থেকে সরে যায় কিন্তু ডেটাবেসে
          থেকে যায় — ভুল হলে আবার দেখানো যাবে। <b>মুছুন</b> স্থায়ী, তাই কেবল অ্যাডমিন পারেন।
        </p>
      </div>
    </>
  );
}
