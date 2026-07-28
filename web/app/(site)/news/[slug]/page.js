import { notFound } from 'next/navigation';
import { SITE_NAME } from '../../../../lib/site.js';
import { getAllArticles, getArticle, formatDate, thumbFor } from '../../../../lib/articles.js';
import AdSlot from '../../ad-slot.js';

// Next.js কেবল রুট সেগমেন্ট ফাইলেই এগুলো খোঁজে।
export const revalidate = 300;
// বিল্ডের পরে পাইপলাইন যে খবরগুলো লেখে সেগুলো generateStaticParams-এ
// থাকে না — dynamicParams ছাড়া সেই পেজগুলো ৪০৪ দিত, অথচ ফেসবুকে ঠিক
// ওই লিংকগুলোই পোস্ট করা হয়।
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getAllArticles()).map((a) => ({ slug: a.slug }));
}

// Next.js 15-এ params একটি Promise — await না করলে params.slug হয় undefined,
// ফলে প্রতিটি পেজ নীরবে ৪০৪ হয়ে যায় (বিল্ড সফলই দেখায়)।
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const a = await getArticle(slug);
  if (!a) return {};
  return {
    title: a.headline,
    description: a.summary,
    openGraph: {
      title: a.headline,
      description: a.summary,
      // card_url না থাকলে null বসত, আর Next সেটাকে metadataBase-এর
      // সাপেক্ষে সমাধান করে ভাঙা og:image বানাত
      images: a.cardWebPath ? [a.cardWebPath] : [],
      type: 'article',
      publishedTime: a.publishedAt,
    },
    twitter: { card: 'summary_large_image', title: a.headline, description: a.summary },
  };
}

export default async function ArticlePage({ params }) {
  const { slug } = await params;
  const a = await getArticle(slug);
  if (!a) notFound();

  const paragraphs = (a.body || '').split(/\n{2,}/).filter(Boolean);

  // সংবাদের কাঠামোগত ডেটা — গুগল নিউজ ও সার্চ ফলাফলের জন্য
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.headline,
    description: a.summary,
    image: a.cardWebPath ? [a.cardWebPath] : [],
    datePublished: a.publishedAt,
    dateModified: a.publishedAt,
    articleSection: a.category,
    keywords: (a.tags || []).join(', '),
    publisher: { '@type': 'Organization', name: SITE_NAME },
  };

  return (
    <article className="article">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <span className="chip">{a.category}</span>
      <h1>{a.headline}</h1>

      <div className="meta">
        <span>{formatDate(a.publishedAt)}</span>
      </div>

      {thumbFor(a) && (
        <div className="hero">
          <img src={thumbFor(a)} alt={a.headline} />
        </div>
      )}

      {a.summary && <div className="summary">{a.summary}</div>}

      <AdSlot placement="article_top" />

      {/*
        মাঝের বিজ্ঞাপনটি অনুচ্ছেদের ফাঁকে, ঠিক মাঝখানে — তবে লেখা যথেষ্ট
        লম্বা হলেই। ছোট খবরে (৪ অনুচ্ছেদের কম) বসালে শিরোনাম আর
        বিজ্ঞাপনের মাঝে পড়ার মতো কিছুই থাকত না।
      */}
      <div className="content">
        {paragraphs.map((p, i) => (
          <div key={i}>
            <p>{p}</p>
            {paragraphs.length >= 4 && i === Math.floor(paragraphs.length / 2) - 1 && (
              <AdSlot placement="article_mid" />
            )}
          </div>
        ))}
      </div>

      <AdSlot placement="article_bottom" />

      {a.tags?.length > 0 && (
        <div className="tags">
          {a.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
    </article>
  );
}
