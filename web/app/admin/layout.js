import './admin.css';
import { currentUser } from '../../lib/auth.js';
import { getSettings } from '../../lib/admin-db.js';
import { logoutAction } from './actions.js';
import SidebarNav from './sidebar-nav.js';

export const metadata = {
  title: 'অ্যাডমিন — কথা ম্যাট্রিক্স',
  robots: { index: false, follow: false }, // সার্চ ইঞ্জিনে যেন না ওঠে
};

// অ্যাডমিন পাতায় কোনো ক্যাশ নয় — সবসময় সর্বশেষ অবস্থা
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }) {
  const user = await currentUser();

  // লগইন পাতাও এই লেআউটের ভেতরে পড়ে, তাই সেখানে সাইডবার আঁকা যাবে না
  if (!user) {
    return <div className="adm">{children}</div>;
  }

  // অটোমেশনের অবস্থা সাইডবারেই দেখাই — জরুরি অবস্থায় খুঁজতে হয় না
  let settings = {};
  try {
    settings = await getSettings();
  } catch {
    // সেটিংস টেবিল না থাকলেও প্যানেল খুলবে
  }
  const autoOn = settings.automation_enabled !== false;
  const fbOn = settings.facebook_enabled !== false;

  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-brand">
          <img src="/logo.svg" alt="কথা ম্যাট্রিক্স" />
        </div>

        <SidebarNav role={user.role} />

        <div className="adm-status">
          <div className="row">
            <span className={`dot ${autoOn ? 'on' : 'off'}`} />
            <span className="lbl">অটোমেশন</span>
            <span className="val">{autoOn ? 'চালু' : 'বন্ধ'}</span>
          </div>
          <div className="row">
            <span className={`dot ${fbOn ? 'on' : 'off'}`} />
            <span className="lbl">ফেসবুক</span>
            <span className="val">{fbOn ? 'চালু' : 'বন্ধ'}</span>
          </div>
        </div>

        <div className="adm-me">
          <div className="av">{(user.name || '?').trim().charAt(0)}</div>
          <div className="nm">
            <b>{user.name}</b>
            <span>{user.role === 'admin' ? 'অ্যাডমিন' : 'ম্যানেজার'}</span>
          </div>
          <form action={logoutAction}>
            <button className="btn tiny" type="submit" title="বেরিয়ে যান">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </aside>

      <div className="adm-main">{children}</div>
    </div>
  );
}
