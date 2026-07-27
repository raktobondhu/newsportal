import './admin.css';
import { SITE_NAME } from '../../lib/site.js';
import { currentUser } from '../../lib/auth.js';
import { adminQuery, getSettings } from '../../lib/admin-db.js';
import { relativeTime, toBn } from '../../lib/articles.js';
import { logoutAction } from './actions.js';
import SidebarNav from './sidebar-nav.js';

export const metadata = {
  title: `অ্যাডমিন — ${SITE_NAME}`,
  robots: { index: false, follow: false }, // সার্চ ইঞ্জিনে যেন না ওঠে
};

// অ্যাডমিন পাতায় কোনো ক্যাশ নয় — সবসময় সর্বশেষ অবস্থা
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }) {
  const user = await currentUser();

  // লগইন পাতাও এই লেআউটের ভেতরে পড়ে, তাই সেখানে সাইডবার আঁকা যাবে না
  if (!user) {
    return <div className="adm">{children}</div>;
  }

  // অটোমেশনের অবস্থা সাইডবারেই দেখাই — জরুরি অবস্থায় খুঁজতে হয় না
  let settings = {};
  try {
    settings = await getSettings();
  } catch {
    // সেটিংস টেবিল না থাকলেও প্যানেল খুলবে
  }
  const autoOn = settings.automation_enabled !== false;
  const fbOn = settings.facebook_enabled !== false;

  /**
   * সংবাদকক্ষের নাড়ি।
   *
   * সাইডবারে মেনুর নিচে অনেকটা জায়গা খালি পড়ে থাকত। সেখানে যা বসানো
   * দরকার তা হলো একটাই প্রশ্নের উত্তর: "এখনো খবর যাচ্ছে তো?" —
   * পাইপলাইন থেমে গেলে সেটা যেকোনো পাতা থেকেই চোখে পড়া চাই, ড্যাশবোর্ডে
   * ফিরে গিয়ে খুঁজতে হবে কেন?
   *
   * কেবল গত ২৪ ঘণ্টার সারি আনা হয় — দিনে প্রায় ১৯০টি খবর, তাই এতে
   * পুরো দিনটাই ধরা পড়ে অথচ প্রতিটি পাতায় বড় অনুরোধ যায় না।
   */
  let pulse = null;
  try {
    const since = new Date(Date.now() - 24 * 3600000).toISOString();
    const rows =
      (await adminQuery(
        'articles?select=slug,headline,hidden,facebook_post_id,published_at' +
          `&published_at=gte.${since}&order=published_at.desc&limit=500`
      )) ?? [];

    pulse = {
      total: rows.length,
      posted: rows.filter((r) => r.facebook_post_id).length,
      hidden: rows.filter((r) => r.hidden).length,
      lastAt: rows[0]?.published_at ?? null,
      // লুকানো খবর সাইটে নেই, তাই "সদ্য প্রকাশিত" তালিকায় সেগুলো নয়
      recent: rows.filter((r) => !r.hidden).slice(0, 10),
    };
  } catch {
    // ডেটাবেস না পেলে অংশটা আঁকা হয় না। শূন্য দেখানো যাবে না — সেটা
    // "কিছু প্রকাশ হয়নি" বলে ভুল বোঝাত।
  }

  /**
   * সর্বশেষ প্রকাশের বয়স। পাইপলাইন ঘণ্টায় একবার চলে, তাই দেড় ঘণ্টা
   * পর্যন্ত স্বাভাবিক। অটোমেশন বন্ধ থাকলে দেরিটা দোষের নয় — তখন
   * সতর্কবাতি জ্বালালে রোজ মিথ্যা সংকেত দেখতে হতো।
   */
  const lastMin = pulse?.lastAt ? Math.floor((Date.now() - new Date(pulse.lastAt).getTime()) / 60000) : null;
  const lastKind = !autoOn ? 'idle' : lastMin === null ? 'off' : lastMin <= 90 ? 'on' : lastMin <= 180 ? 'warn' : 'off';

  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-brand">
          <img src="/logo.svg" alt={SITE_NAME} />
        </div>

        <SidebarNav role={user.role} />

        {pulse && (
          <section className="adm-pulse" aria-label="সংবাদকক্ষের অবস্থা">
            <div className="nums">
              <div>
                <b>{toBn(pulse.total)}</b>
                <span>২৪ ঘণ্টায়</span>
              </div>
              <div>
                <b>{toBn(pulse.posted)}</b>
                <span>ফেসবুকে</span>
              </div>
              <div>
                <b>{toBn(pulse.hidden)}</b>
                <span>লুকানো</span>
              </div>
            </div>

            <div className="last">
              {/* রঙের সঙ্গে সবসময় লেখাও থাকে — কেবল রঙে বোঝালে
                  বর্ণান্ধ পাঠকের কাছে সংকেতটা পৌঁছায় না */}
              <span className={`dot ${lastKind}`} />
              <div>
                <span>সর্বশেষ প্রকাশ</span>
                <b>{pulse.lastAt ? relativeTime(pulse.lastAt) : '২৪ ঘণ্টায় কিছু নয়'}</b>
              </div>
            </div>

            {pulse.recent.length > 0 && (
              <>
                <div className="ttl">সদ্য প্রকাশিত</div>
                {/* তালিকাটাই বাকি জায়গাটুকু নেয়; পর্দা ছোট হলে নিজেই গড়ায় */}
                <ul className="recent">
                  {pulse.recent.map((r) => (
                    <li key={r.slug}>
                      <a href={`/admin/articles/${encodeURIComponent(r.slug)}`}>{r.headline}</a>
                      <span>{relativeTime(r.published_at)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <div className="adm-status">
          <div className="row">
            <span className={`dot ${autoOn ? 'on' : 'off'}`} />
            <span className="lbl">অটোমেশন</span>
            <span className="val">{autoOn ? 'চালু' : 'বন্ধ'}</span>
          </div>
          <div className="row">
            <span className={`dot ${fbOn ? 'on' : 'off'}`} />
            <span className="lbl">ফেসবুক</span>
            <span className="val">{fbOn ? 'চালু' : 'বন্ধ'}</span>
          </div>
        </div>

        <div className="adm-me">
          <div className="av">{(user.name || '?').trim().charAt(0)}</div>
          <div className="nm">
            <b>{user.name}</b>
            <span>{user.role === 'admin' ? 'অ্যাডমিন' : 'ম্যানেজার'}</span>
          </div>
          <form action={logoutAction}>
            <button className="btn tiny" type="submit" title="বেরিয়ে যান">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </aside>

      <div className="adm-main">{children}</div>
    </div>
  );
}
