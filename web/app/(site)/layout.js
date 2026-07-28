import { getCategories, toBn } from '../../lib/articles.js';
import { SITE_NAME, SITE_SLOGAN } from '../../lib/site.js';

// নাহলে হেডারের ক্যাটাগরি তালিকা বিল্ডের সময়েই জমে যায়, নতুন
// ক্যাটাগরি এলে আর দেখা যায় না।
export const revalidate = 300;

/**
 * কেবল পাঠকের সাইটের খোলস। /admin এই লেআউটের বাইরে, তাই সেখানে
 * এই হেডার-ফুটার যায় না।
 */
export default async function SiteLayout({ children }) {
  // সব বিভাগই মেনুতে থাকে। আগে ৮টিতে সীমিত ছিল, তাতে স্বাস্থ্য ও
  // অপরাধ বাদ পড়ে যেত — অথচ ওই বিভাগে খবর প্রকাশ হচ্ছে, পাঠক শুধু
  // সেখানে পৌঁছানোর পথ পাচ্ছিলেন না।
  const categories = await getCategories();

  return (
    <>
      <header className="site-header">
        <div className="wrap header-row">
          <a className="logo" href="/" aria-label={SITE_NAME}>
            {/* next/image নয় — SVG-তে অপ্টিমাইজেশনের কিছু নেই */}
            <img src="/logo.svg" alt={SITE_NAME} />
            {/* সরু পর্দায় CSS একে সরিয়ে দেয় — মেনুর জায়গা আগে */}
            <span className="logo-slogan">{SITE_SLOGAN}</span>
          </a>
          <nav className="nav">
            <a href="/">সর্বশেষ</a>
            {categories.map((c) => (
              <a key={c.name} href={`/category/${encodeURIComponent(c.name)}`}>
                {c.name}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="wrap">{children}</main>

      {/*
        ঠিকানা, ফোন, সামাজিক মাধ্যমের লিংক বা প্রতিষ্ঠানের নিবন্ধন —
        কিছুই এখানে নেই, ইচ্ছাকৃতভাবে। যেগুলো সত্যিই আছে কেবল সেগুলোই
        দেখানো হয়; বানানো তথ্য ফুটারে বসালে পুরো সাইটের বিশ্বাস নষ্ট হয়।
      */}
      <footer className="site-footer">
        <div className="wrap foot-top">
          <div className="foot-brand">
            <img src="/logo.svg" alt={SITE_NAME} />
            <p className="foot-slogan">{SITE_SLOGAN}</p>
            <p>
              দেশ ও বিশ্বের নির্বাচিত সংবাদ, বাংলায়। সারাদিন ধরে নতুন খবর
              যোগ হয়, তাই একটু পরপরই পাতাটি বদলায়।
            </p>
          </div>

          {categories.length > 0 && (
            <nav className="foot-col" aria-label="বিভাগ">
              <b>বিভাগ</b>
              <div className="foot-links">
                {categories.map((c) => (
                  <a key={c.name} href={`/category/${encodeURIComponent(c.name)}`}>
                    {c.name}
                  </a>
                ))}
              </div>
            </nav>
          )}
        </div>

        <div className="wrap foot-bottom">
          {/* সাইটের বাকি সব সংখ্যা বাংলায়, সালটাও তাই */}
          <span>© {toBn(new Date().getFullYear())} {SITE_NAME}</span>
          <span className="foot-meta">
            <a href="/privacy">গোপনীয়তা নীতি</a>
            <a href="/sitemap.xml">সাইটম্যাপ</a>
          </span>
        </div>
      </footer>
    </>
  );
}
