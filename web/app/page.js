import { getAllArticles, relativeTime, thumbFor } from '../lib/articles.js';

// Next.js কেবল রুট সেগমেন্ট ফাইলেই revalidate খোঁজে — lib থেকে রপ্তানি
// করলে নীরবে উপেক্ষা করে, আর পেজ চিরস্থায়ীভাবে স্ট্যাটিক থেকে যায়।
export const revalidate = 300;

function Card({ a }) {
  return (
    <article className="card">
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

  const [lead, ...rest] = articles;

  return (
    <>
      <section className="lead">
        <a className="thumb" href={`/news/${lead.slug}`}>
          {thumbFor(lead) ? (
            <img src={thumbFor(lead)} alt={lead.headline} />
          ) : (
            <div className="thumb-empty">
              <span>{lead.category}</span>
            </div>
          )}
        </a>
        <div>
          <span className="chip">{lead.category}</span>
          <h2>
            <a href={`/news/${lead.slug}`}>{lead.headline}</a>
          </h2>
          <p>{lead.summary}</p>
          <div className="meta">
            <span>{relativeTime(lead.publishedAt)}</span>
          </div>
        </div>
      </section>

      <h2 className="section-title">সর্বশেষ সংবাদ</h2>
      <div className="grid">
        {rest.map((a) => (
          <Card key={a.slug} a={a} />
        ))}
      </div>
    </>
  );
}
