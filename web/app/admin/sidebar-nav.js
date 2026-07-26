'use client';

import { usePathname } from 'next/navigation';

/**
 * সাইডবারের মেনু। ক্লায়েন্ট কম্পোনেন্ট কেবল একটি কারণে — কোন পাতায়
 * আছি সেটা জানতে usePathname লাগে। বাকি সবকিছু সার্ভারেই থাকে।
 *
 * সক্রিয় অবস্থা রঙের পাশাপাশি বাঁ পাশের দাগ দিয়েও বোঝানো হয় — কেবল
 * রঙে বোঝালে বর্ণান্ধ পাঠকের জন্য সেটা অদৃশ্য।
 */

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const ICONS = {
  dashboard: <Icon d={<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>} />,
  news: <Icon d={<><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h8M8 17h5" /></>} />,
  users: <Icon d={<><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M17 11a3 3 0 1 0 0-6" /><path d="M18 20a5.6 5.6 0 0 0-2-4" /></>} />,
  settings: <Icon d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>} />,
  log: <Icon d={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>} />,
  site: <Icon d={<><path d="M14 4h6v6" /><path d="M20 4l-8 8" /><path d="M18 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>} />,
};

export default function SidebarNav({ role }) {
  const path = usePathname();

  const items = [
    { href: '/admin', icon: 'dashboard', label: 'ড্যাশবোর্ড', exact: true },
    { href: '/admin/articles', icon: 'news', label: 'খবর' },
    ...(role === 'admin'
      ? [
          { href: '/admin/users', icon: 'users', label: 'ব্যবহারকারী' },
          { href: '/admin/settings', icon: 'settings', label: 'সেটিংস' },
        ]
      : [{ href: '/admin/settings', icon: 'settings', label: 'সেটিংস' }]),
    { href: '/admin/log', icon: 'log', label: 'কাজের হিসাব' },
  ];

  const active = (it) => (it.exact ? path === it.href : path.startsWith(it.href));

  return (
    <nav className="adm-nav">
      {items.map((it) => (
        <a key={it.href} href={it.href} className={active(it) ? 'on' : undefined}>
          {ICONS[it.icon]}
          {it.label}
        </a>
      ))}
      <div className="sep" />
      <a href="/" target="_blank" rel="noreferrer">
        {ICONS.site}
        সাইট দেখুন
      </a>
    </nav>
  );
}
