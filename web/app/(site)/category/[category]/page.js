import { notFound } from 'next/navigation';
import { getCategories, getByCategory, relativeTime, thumbFor, toBn } from '../../../../lib/articles.js';

export const revalidate = 300;
// নতুন ক্যাটাগরি প্রথমবার এলেও পেজটা যেন খোলে
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getCategories()).map((c) => ({ category: c.name }));
}

// Next.js 15-এ params একটি Promise — await বাধ্যতামূলক
export async function generateMetadata({ params }) {
  const { category } = await params;
  const name = decodeURIComponent(category);
  return { title: `${name} সংবাদ`, description: `${name} বিভাগের সর্বশেষ সংবাদ।` };
}

export default async function CategoryPage({ params }) {
  const { category } = await params;
  const name = decodeURIComponent(category);
  const articles = await getByCategory(name);
  if (!articles.length) notFound();

  return (
    <>
      {/* হোমপেজের বিভাগ-শিরোনামের সঙ্গে এক চেহারা রাখা হলো, যাতে
          "সব দেখুন" চেপে আসা পাঠক একই জায়গায় আছে বলে বোঝে */}
      <div className="sec-head cat-head">
        <h2>{name}</h2>
        <span className="all">{toBn(articles.length)} টি খবর</span>
      </div>
      <div className="grid">
        {articles.map((a) => (
          <article className="card" key={a.slug}>
            <a href={`/news/${a.slug}`}>
              <div className="thumb">
                {thumbFor(a) ? (
                  <img src={thumbFor(a)} alt={a.headline} loading="lazy" />
                ) : (
                  <div className="thumb-empty">
                    <span>{a.category}</span>
                  </div>
                )}
              </div>
              <div className="body">
                <h3>{a.headline}</h3>
                <p>{a.summary}</p>
                <div className="meta">
                  <span>{relativeTime(a.publishedAt)}</span>
                </div>
              </div>
            </a>
          </article>
        ))}
      </div>
    </>
  );
}
