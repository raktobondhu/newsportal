import { getAllArticles, relativeTime, thumbFor, toBn } from '../../lib/articles.js';
import AdSlot from './ad-slot.js';

// Next.js কেবল রুট সেগমেন্ট ফাইলেই revalidate খোঁজে — lib থেকে রপ্তানি
// করলে নীরবে উপেক্ষা করে, আর পেজ চিরস্থায়ীভাবে স্ট্যাটিক থেকে যায়।
export const revalidate = 300;

// পাতার তিন স্তরের মাপ। এক জায়গায় রাখা হলো যাতে ভাগ-বাটোয়ারার
// হিসাবটা নিচে পড়তে গিয়ে খুঁজতে না হয়।
const LEAD_LOOKAHEAD = 6; // এতগুলোর মধ্যেই ছবিসহ প্রধান খবর খোঁজা হয়
const TOP_STORIES = 4; // প্রধান খবরের পাশের তালিকা
const RAIL_ITEMS = 12; // সর্বশেষের রেল
const SECTIONS = 6; // বিভাগভিত্তিক অংশ কয়টি
const PER_SECTION = 5; // প্রতিটিতে ১টি বড় + ৪টি তালিকা
const MIN_FOR_SECTION = 3; // এর কম খবর থাকলে বিভাগটির নিজস্ব অংশ হয় না

/**
 * ছবি, নয়তো প্লেসহোল্ডার। তিন জায়গায় একই নিয়ম, তাই এক জায়গায় —
 * thumbFor() null দিলে .thumb-empty আঁকতে হয় (কার্ড-ইমেজ নয়, তাতে
 * শিরোনাম দুবার দেখা যেত)।
 */
function Shot({ a, priority }) {
  const src = thumbFor(a);
  if (!src) {
    return (
      <div className="thumb-empty">
        <span>{a.category}</span>
      </div>
    );
  }
  // প্রধান খবরের ছবিটি পাতার প্রথম পর্দাতেই থাকে, তাই সেটি lazy নয়
  return <img src={src} alt={a.headline} loading={priority ? undefined : 'lazy'} />;
}

/**
 * ছোট ছবিসহ এক সারি — শীর্ষ খবর ও বিভাগের তালিকা দুই জায়গাতেই।
 * পুরো সারিটাই একটিমাত্র লিংক; ছবি ও শিরোনাম আলাদা লিংক হলে
 * কি-বোর্ডে একই খবরে দুবার থামতে হয়।
 */
function Item({ a }) {
  return (
    <a className="item" href={`/news/${a.slug}`}>
      <div className="shot">
        <Shot a={a} />
      </div>
      <div>
        <h3>{a.headline}</h3>
        <div className="meta">
          <span>{a.category}</span>
          <span>{relativeTime(a.publishedAt)}</span>
        </div>
      </div>
    </a>
  );
}

function Card({ a }) {
  return (
    <article className="card">
      <a href={`/news/${a.slug}`}>
        <div className="thumb">
          <Shot a={a} />
        </div>
        <div className="body">
          <span className="chip">{a.category}</span>
          <h3>{a.headline}</h3>
          <p>{a.summary}</p>
          <div className="meta">
            <span>{relativeTime(a.publishedAt)}</span>
          </div>
        </div>
      </a>
    </article>
  );
}

/**
 * বিভাগভিত্তিক অংশ — প্রথম খবরটি বড় (ছবি, সারমর্ম সহ), বাকিগুলো
 * তালিকা। সব সমান দেখালে পাঠক বুঝতে পারে না কোনটা বেশি জরুরি।
 */
function Section({ name, items }) {
  const [first, ...rest] = items;
  return (
    <section className="sec">
      <div className="sec-head">
        <h2>{name}</h2>
        <a className="all" href={`/category/${encodeURIComponent(name)}`}>
          সব দেখুন →
        </a>
      </div>
      <div className="sec-grid">
        <article className="sec-lead">
          <a className="shot" href={`/news/${first.slug}`}>
            <Shot a={first} />
          </a>
          <a href={`/news/${first.slug}`}>
            <h3>{first.headline}</h3>
          </a>
          <p>{first.summary}</p>
          <div className="meta">
            <span>{relativeTime(first.publishedAt)}</span>
          </div>
        </article>
        <div className="sec-list">
          {rest.map((a) => (
            <Item key={a.slug} a={a} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function Home() {
  const articles = await getAllArticles();

  if (!articles.length) {
    return (
      <div className="empty">
        <h2>এখনো কোনো সংবাদ প্রকাশিত হয়নি</h2>
        <p>পাইপলাইন চালালে এখানে সংবাদ দেখা যাবে।</p>
      </div>
    );
  }

  // প্রধান খবরের জায়গাটা ছবি ধরেই বানানো। ছবিহীন খবর ওখানে বসলে
  // পাতার মাথায় বিশাল ফাঁকা প্লেসহোল্ডার — তাই সাম্প্রতিক কয়েকটির
  // মধ্যে প্রথম যেটির ছবি আছে সেটিই প্রধান। কোনোটিতেই ছবি না থাকলে
  // সবচেয়ে নতুনটিই থাকে, ক্রম বদলায় না।
  const found = articles.slice(0, LEAD_LOOKAHEAD).findIndex((a) => thumbFor(a));
  const leadAt = found < 0 ? 0 : found;
  const lead = articles[leadAt];
  const rest = articles.filter((_, i) => i !== leadAt);
  const top = rest.slice(0, TOP_STORIES);

  // উপরের ব্যান্ডে যেগুলো দেখানো হলো সেগুলো নিচে আবার দেখানো হয় না —
  // একই শিরোনাম দুবার দেখলে সাইটটা অগোছালো লাগে।
  const shown = new Set([lead.slug, ...top.map((a) => a.slug)]);

  // রেলটি নিছক সময়ানুক্রমিক তালিকা, তাই উপরের ব্যান্ডের পরেরগুলো থেকে শুরু
  const latest = rest.slice(TOP_STORIES, TOP_STORIES + RAIL_ITEMS);

  const byCategory = new Map();
  for (const a of articles) {
    if (shown.has(a.slug)) continue;
    if (!byCategory.has(a.category)) byCategory.set(a.category, []);
    byCategory.get(a.category).push(a);
  }

  // যে বিভাগে খবর বেশি সেটিই আগে — কোন বিভাগ আজ ব্যস্ত, তা পাইপলাইনই
  // ঠিক করে; এখানে নাম হাতে লিখে রাখলে নতুন বিভাগ কখনো উঠত না।
  const sections = [...byCategory.entries()]
    .filter(([, items]) => items.length >= MIN_FOR_SECTION)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, SECTIONS)
    .map(([name, items]) => ({ name, items: items.slice(0, PER_SECTION) }));

  for (const s of sections) for (const a of s.items) shown.add(a.slug);

  // বাকি সব — কোনো খবর যেন হোমপেজ থেকে হারিয়ে না যায়
  const more = articles.filter((a) => !shown.has(a.slug));

  return (
    <>
      <section className="home-hero">
        <article className="hero-lead">
          <a className="shot" href={`/news/${lead.slug}`}>
            <Shot a={lead} priority />
          </a>
          <div className="chip-row">
            <span className="chip">{lead.category}</span>
            {lead.isOpinion && <span className="chip opinion">মতামত</span>}
          </div>
          <h1>
            <a href={`/news/${lead.slug}`}>{lead.headline}</a>
          </h1>
          <p>{lead.summary}</p>
          <div className="meta">
            <span>{relativeTime(lead.publishedAt)}</span>
          </div>
        </article>

        {top.length > 0 && (
          <div className="hero-side">
            <h2 className="mini-head">শীর্ষ খবর</h2>
            {top.map((a) => (
              <Item key={a.slug} a={a} />
            ))}
          </div>
        )}
      </section>

      <AdSlot placement="home_top" />

      {(sections.length > 0 || latest.length > 0) && (
        <div className="home-cols">
          <div className="home-main">
            {sections.map((s, i) => (
              <div key={s.name}>
                <Section name={s.name} items={s.items} />
                {/* বিভাগগুলোর ঠিক মাঝখানে — উপরে বা নিচে নয়। পাঠক
                    তখন অন্তত একটি বিভাগ পড়ে ফেলেছেন, আর নিচে আরও
                    আছে বলে বিজ্ঞাপনটাকে পাতার শেষ বলে ভুল করেন না। */}
                {i === Math.floor(sections.length / 2) - 1 && <AdSlot placement="home_mid" />}
              </div>
            ))}
          </div>

          {latest.length > 0 && (
            <aside className="rail" aria-label="সর্বশেষ সংবাদ">
              <div className="rail-box">
                <div className="rail-head">
                  <span className="live" />
                  <b>সর্বশেষ</b>
                </div>
                <ul className="rail-list">
                  {latest.map((a) => (
                    <li key={a.slug}>
                      <a href={`/news/${a.slug}`}>{a.headline}</a>
                      <time dateTime={a.publishedAt}>{relativeTime(a.publishedAt)}</time>
                    </li>
                  ))}
                </ul>
              </div>
              {/* রেলটি sticky — বিজ্ঞাপনটি তার ভেতরে রাখলে পাঠক
                  স্ক্রল করার সময়ও চোখের সামনে থাকে */}
              <AdSlot placement="sidebar" />
            </aside>
          )}
        </div>
      )}

      {more.length > 0 && (
        <>
          <h2 className="section-title">আরও খবর ({toBn(more.length)})</h2>
          <div className="grid">
            {more.map((a) => (
              <Card key={a.slug} a={a} />
            ))}
          </div>
        </>
      )}

      <AdSlot placement="home_bottom" />
    </>
  );
}
