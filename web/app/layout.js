import './globals.css';
import { getCategories } from '../lib/articles.js';

// নাহলে হেডারের ক্যাটাগরি তালিকা বিল্ডের সময়েই জমে যায়, নতুন
// ক্যাটাগরি এলে আর দেখা যায় না।
export const revalidate = 300;

export const metadata = {
  metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
  title: {
    default: 'কথা ম্যাট্রিক্স — সর্বশেষ বাংলা সংবাদ',
    template: '%s | কথা ম্যাট্রিক্স',
  },
  description: 'দেশ ও বিশ্বের নির্বাচিত সংবাদ, বাংলায় — কথা ম্যাট্রিক্স।',
  openGraph: {
    siteName: 'কথা ম্যাট্রিক্স',
    locale: 'bn_BD',
    type: 'website',
  },
};

export default async function RootLayout({ children }) {
  const categories = (await getCategories()).slice(0, 8);

  return (
    <html lang="bn">
      <body>
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
            <span>সব সংবাদ আমাদের নিজস্ব সম্পাদনায় বাংলায় প্রকাশিত।</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
