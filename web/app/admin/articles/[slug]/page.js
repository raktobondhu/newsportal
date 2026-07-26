import { redirect, notFound } from 'next/navigation';
import { currentUser } from '../../../../lib/auth.js';
import { adminQuery } from '../../../../lib/admin-db.js';
import EditForm from './edit-form.js';

export const dynamic = 'force-dynamic';

export default async function EditArticlePage({ params }) {
  const user = await currentUser();
  if (!user) redirect('/admin/login');

  const { slug } = await params;
  const decoded = decodeURIComponent(slug);

  const rows = await adminQuery(
    `articles?select=*&slug=eq.${encodeURIComponent(decoded)}&limit=1`
  );
  const a = rows?.[0];
  if (!a) notFound();

  return (
    <>
      <h1>খবর সম্পাদনা</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 26, alignItems: 'start' }}>
        <div>
          <EditForm article={a} />
        </div>

        <aside>
          {a.card_url && (
            <>
              <div className="hint" style={{ marginBottom: 6 }}>ফেসবুক কার্ড</div>
              <img src={a.card_url} alt="" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)' }} />
            </>
          )}

          <div className="adm-card" style={{ marginTop: 16 }}>
            <div className="l">অবস্থা</div>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className={`badge ${a.hidden ? 'off' : 'ok'}`}>{a.hidden ? 'লুকানো' : 'প্রকাশিত'}</span>
              <span className={`badge ${a.facebook_post_id ? 'ok' : 'warn'}`}>
                {a.facebook_post_id ? 'ফেসবুকে গেছে' : 'ফেসবুকে যায়নি'}
              </span>
              <span className="badge">কার্ড: {a.card_style ?? '—'}</span>
              <span className="badge">মডেল: {a.provider ?? '—'}</span>
            </div>
          </div>

          {/* সোর্স সাইটে দেখানো হয় না, কিন্তু এখানে রাখা — কোনো খবর নিয়ে
              প্রশ্ন উঠলে মূল প্রতিবেদন মিলিয়ে দেখা দরকার হতে পারে */}
          <div className="adm-card" style={{ marginTop: 12 }}>
            <div className="l">মূল সূত্র (কেবল অভ্যন্তরীণ)</div>
            <div style={{ marginTop: 8, fontSize: '.9rem' }}>
              <div>{a.source_name}</div>
              <a href={a.source_url} target="_blank" rel="noreferrer nofollow" style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>
                মূল প্রতিবেদন ↗
              </a>
            </div>
          </div>

          {a.edited_by && (
            <p className="hint" style={{ marginTop: 12 }}>
              শেষ সম্পাদনা: {a.edited_by}
            </p>
          )}

          <a className="btn" href={`/news/${encodeURIComponent(a.slug)}`} target="_blank" rel="noreferrer" style={{ marginTop: 12, display: 'block' }}>
            সাইটে দেখুন ↗
          </a>
        </aside>
      </div>
    </>
  );
}
