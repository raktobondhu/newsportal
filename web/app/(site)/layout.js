import { getCategories } from '../../lib/articles.js';

// নাহলে হেডারের ক্যাটাগরি তালিকা বিল্ডের সময়েই জমে যায়, নতুন
// ক্যাটাগরি এলে আর দেখা যায় না।
export const revalidate = 300;

/**
 * কেবল পাঠকের সাইটের খোলস। /admin এই লেআউটের বাইরে, তাই সেখানে
 * এই হেডার-ফুটার যায় না।
 */
export default async function SiteLayout({ children }) {
  const categories = (await getCategories()).slice(0, 8);

  return (
    <>
      <header className="site-header">
        <div className="wrap header-row">
          <a className="logo" href="/" aria-label="কথা ম্যাট্রিক্স">
            {/* next/image নয় — SVG-তে অপ্টিমাইজেশনের কিছু নেই */}
            <img src="/logo.svg" alt="কথা ম্যাট্রিক্স" />
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

      <footer className="site-footer">
        <div className="wrap">
          <span>© {new Date().getFullYear()} কথা ম্যাট্রিক্স</span>
        </div>
      </footer>
    </>
  );
}
