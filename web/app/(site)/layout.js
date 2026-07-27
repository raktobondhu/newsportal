import { getCategories, toBn } from '../../lib/articles.js';

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

      {/*
        ঠিকানা, ফোন, সামাজিক মাধ্যমের লিংক বা প্রতিষ্ঠানের নিবন্ধন —
        কিছুই এখানে নেই, ইচ্ছাকৃতভাবে। যেগুলো সত্যিই আছে কেবল সেগুলোই
        দেখানো হয়; বানানো তথ্য ফুটারে বসালে পুরো সাইটের বিশ্বাস নষ্ট হয়।
      */}
      <footer className="site-footer">
        <div className="wrap foot-top">
          <div className="foot-brand">
            <img src="/logo.svg" alt="কথা ম্যাট্রিক্স" />
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
          <span>© {toBn(new Date().getFullYear())} কথা ম্যাট্রিক্স</span>
          <a href="/sitemap.xml">সাইটম্যাপ</a>
        </div>
      </footer>
    </>
  );
}
