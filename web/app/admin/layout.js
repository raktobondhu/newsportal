import { redirect } from 'next/navigation';
import './admin.css';
import { currentUser } from '../../lib/auth.js';
import { logoutAction } from './actions.js';

export const metadata = {
  title: 'অ্যাডমিন — কথা ম্যাট্রিক্স',
  robots: { index: false, follow: false }, // সার্চ ইঞ্জিনে যেন না ওঠে
};

// অ্যাডমিন পাতায় কোনো ক্যাশ নয় — সবসময় সর্বশেষ অবস্থা
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }) {
  const user = await currentUser();

  // লগইন পাতাটাও এই লেআউটের ভেতরে পড়ে, তাই সেখানে গার্ড চালানো যাবে না —
  // ওই পাতাটি নিজেই নিজের খোলস আঁকে (নিচে children সরাসরি ফেরত)।
  if (!user) {
    return <div className="adm">{children}</div>;
  }

  return (
    <div className="adm">
      <header className="adm-bar">
        <img src="/logo.svg" alt="" />
        <nav>
          <a href="/admin">ড্যাশবোর্ড</a>
          <a href="/admin/articles">খবর</a>
          {user.role === 'admin' && <a href="/admin/users">ব্যবহারকারী</a>}
          {user.role === 'admin' && <a href="/admin/settings">সেটিংস</a>}
          <a href="/admin/log">কাজের হিসাব</a>
          <a href="/" target="_blank" rel="noreferrer">সাইট ↗</a>
        </nav>
        <div className="who">
          <span>
            {user.name} <span className="badge role">{user.role === 'admin' ? 'অ্যাডমিন' : 'ম্যানেজার'}</span>
          </span>
          <form action={logoutAction}>
            <button className="btn tiny" type="submit">বেরিয়ে যান</button>
          </form>
        </div>
      </header>
      <main className="adm-wrap">{children}</main>
    </div>
  );
}

/** প্রতিটি সুরক্ষিত পাতার শুরুতে ডাকা হয় */
export async function guard() {
  const user = await currentUser();
  if (!user) redirect('/admin/login');
  return user;
}
