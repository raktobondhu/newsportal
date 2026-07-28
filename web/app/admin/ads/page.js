import { redirect } from 'next/navigation';
import { currentUser } from '../../../lib/auth.js';
import { adminQuery } from '../../../lib/admin-db.js';
import { toBn, formatDate } from '../../../lib/articles.js';
import { AD_PLACEMENTS, placementLabel } from '../../../lib/ads.js';
import { toggleAdAction, deleteAdAction } from '../actions.js';
import NewAdForm from './new-ad-form.js';

export const dynamic = 'force-dynamic';

/**
 * বিজ্ঞাপনের অবস্থা — কেবল active দেখালে ভুল বোঝাত। চালু করা আছে
 * অথচ মেয়াদ শেষ, এমন বিজ্ঞাপন সাইটে দেখা যায় না; প্যানেলে "চালু"
 * লেখা থাকলে কেউ বুঝত না কেন দেখাচ্ছে না।
 */
function statusOf(ad, now) {
  if (!ad.active) return { kind: 'stop', label: 'বন্ধ' };
  if (ad.starts_at && new Date(ad.starts_at) > now) {
    return { kind: 'wait', label: 'শুরু হয়নি' };
  }
  if (ad.ends_at && new Date(ad.ends_at) < now) {
    return { kind: 'stop', label: 'মেয়াদ শেষ' };
  }
  return { kind: 'ok', label: 'চলছে' };
}

export default async function AdsPage() {
  const user = await currentUser();
  if (!user) redirect('/admin/login');

  let ads = [];
  let loadError = null;
  try {
    ads = (await adminQuery('ads?select=*&order=placement.asc,sort.asc,id.desc')) ?? [];
  } catch (err) {
    // টেবিলটা এখনো বানানো না হলে এখানেই ধরা পড়ে — পুরো পাতা ভেঙে
    // যাওয়ার বদলে কী করতে হবে সেটা বলে দিই
    loadError = err.message;
  }

  const now = new Date();
  const byPlacement = new Map();
  for (const ad of ads) {
    if (!byPlacement.has(ad.placement)) byPlacement.set(ad.placement, []);
    byPlacement.get(ad.placement).push(ad);
  }

  const running = ads.filter((a) => statusOf(a, now).kind === 'ok').length;
  const totalClicks = ads.reduce((n, a) => n + Number(a.clicks ?? 0), 0);

  return (
    <>
      <header className="adm-head">
        <div>
          <h1>বিজ্ঞাপন</h1>
          <div className="sub">
            {toBn(ads.length)}টি বিজ্ঞাপন · {toBn(running)}টি চলছে · {toBn(totalClicks)} ক্লিক
          </div>
        </div>
      </header>

      <div className="adm-body">
        {loadError && (
          <div className="msg err">
            বিজ্ঞাপনের তালিকা আনা যায়নি — {loadError}
            <br />
            <small>
              প্রথমবার হলে Supabase → SQL Editor-এ <code>supabase/ads-schema.sql</code> চালান,
              আর pipeline ফোল্ডারে <code>node test/setup-buckets.mjs</code>।
            </small>
          </div>
        )}

        <div className="ad-cols">
          <section className="ad-list">
            <h2>বসানো বিজ্ঞাপন</h2>

            {ads.length === 0 && !loadError && (
              <p className="hint">এখনো কোনো বিজ্ঞাপন বসানো হয়নি। ডান পাশের ফর্ম দিয়ে শুরু করুন।</p>
            )}

            {AD_PLACEMENTS.filter((p) => byPlacement.has(p.id)).map((p) => (
              <div className="ad-group" key={p.id}>
                <h3>{p.label}</h3>
                {byPlacement.get(p.id).map((ad) => {
                  const st = statusOf(ad, now);
                  return (
                    <div className="ad-row" key={ad.id}>
                      <div className="ad-thumb">
                        <img src={ad.image_url} alt={ad.alt || ad.name} />
                      </div>

                      <div className="ad-info">
                        <b>
                          {ad.name} <span className={`badge ${st.kind}`}>{st.label}</span>
                        </b>
                        <span>
                          {ad.link_url ? (
                            <a href={ad.link_url} target="_blank" rel="noreferrer">
                              {ad.link_url.replace(/^https?:\/\//, '').slice(0, 44)}
                            </a>
                          ) : (
                            'লিংক নেই'
                          )}
                          {' · '}
                          {toBn(ad.clicks ?? 0)} ক্লিক
                        </span>
                        {(ad.starts_at || ad.ends_at) && (
                          <span>
                            {ad.starts_at ? formatDate(ad.starts_at) : 'শুরু থেকে'} —{' '}
                            {ad.ends_at ? formatDate(ad.ends_at) : 'মেয়াদ নেই'}
                          </span>
                        )}
                      </div>

                      <div className="ad-acts">
                        <form action={toggleAdAction.bind(null, ad.id, !ad.active)}>
                          <button className={`btn ${ad.active ? 'stop' : 'primary'}`} type="submit">
                            {ad.active ? 'বন্ধ' : 'চালু'}
                          </button>
                        </form>
                        <form action={deleteAdAction.bind(null, ad.id)}>
                          <button className="btn danger" type="submit">
                            মুছুন
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>

          <section className="ad-new">
            <h2>নতুন বিজ্ঞাপন</h2>
            <NewAdForm />
          </section>
        </div>

        <h2>জায়গাগুলো</h2>
        <p className="hint" style={{ marginTop: -6 }}>
          যে জায়গায় নিজেদের বিজ্ঞাপন নেই, সেখানে AdSense বসবে — যদি সেটিংসে ওই জায়গার
          slot আইডি দেওয়া থাকে। দুটোর কোনোটাই না থাকলে জায়গাটা একটুও দখল করে না।
        </p>
        <div className="ad-places">
          {AD_PLACEMENTS.map((p) => {
            const n = (byPlacement.get(p.id) ?? []).filter((a) => statusOf(a, now).kind === 'ok').length;
            return (
              <div className="ad-place" key={p.id}>
                <b>{p.label}</b>
                <span>{p.note || ' '}</span>
                <span className={`badge ${n ? 'ok' : 'idle'}`}>
                  {n ? `${toBn(n)}টি চলছে` : 'ফাঁকা'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
