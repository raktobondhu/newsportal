-- অ্যাডমিন প্যানেলের স্কিমা
-- Supabase → SQL Editor → পুরোটা পেস্ট করে Run করুন।
-- একাধিকবার চালানো নিরাপদ।

-- ============================================================
-- ১. ব্যবহারকারী ও রোল
-- ============================================================
-- Supabase Auth ব্যবহার করছি না ইচ্ছাকৃতভাবে: ওতে ইমেইল কনফার্মেশন,
-- রিডাইরেক্ট URL, আলাদা প্যাকেজ — অনেক কিছু কনফিগার করতে হয়। এখানে
-- দরকার কেবল কয়েকজন কর্মীর লগইন, তাই নিজেদের টেবিলই যথেষ্ট ও সরল।
-- পাসওয়ার্ড scrypt দিয়ে হ্যাশ করা হয়, কখনো প্লেইনটেক্সটে রাখা হয় না।

create table if not exists admin_users (
  id            bigserial primary key,
  email         text not null unique,
  name          text not null,
  password_hash text not null,

  -- admin   : সবকিছু — ব্যবহারকারী যোগ/বাদ, সেটিংস, অটোমেশন বন্ধ
  -- manager : কেবল কনটেন্ট — খবর লুকানো, সম্পাদনা, ফেসবুকে পাঠানো
  role        text not null default 'manager' check (role in ('admin', 'manager')),

  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  last_login  timestamptz
);

create index if not exists admin_users_email_idx on admin_users (lower(email));


-- ============================================================
-- ২. সেটিংস — কী-ভ্যালু
-- ============================================================
-- অটোমেশন বন্ধ করার সুইচ এখানেই থাকে। পাইপলাইন প্রতিবার শুরুতে দেখে নেয়,
-- তাই GitHub-এ না গিয়েও প্যানেল থেকে থামানো যায়।

create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

insert into app_settings (key, value) values
  ('automation_enabled', 'true'::jsonb),
  ('facebook_enabled',   'true'::jsonb),
  ('max_articles_per_run', '5'::jsonb),
  ('max_posts_per_run',    '2'::jsonb),
  ('disabled_sources',     '[]'::jsonb)
on conflict (key) do nothing;


-- ============================================================
-- ৩. আর্টিকেলে নতুন কলাম
-- ============================================================
-- মুছে ফেলার বদলে লুকানো — ভুল করে সরালে ফিরিয়ে আনা যায়, আর কোন খবর
-- কেন সরানো হলো তার হিসাবও থাকে।
alter table articles add column if not exists hidden      boolean not null default false;
alter table articles add column if not exists hidden_at   timestamptz;
alter table articles add column if not exists hidden_by   text;
alter table articles add column if not exists edited_at   timestamptz;
alter table articles add column if not exists edited_by   text;

create index if not exists articles_hidden_idx on articles (hidden, published_at desc);


-- ============================================================
-- ৪. কাজের হিসাব (audit log)
-- ============================================================
-- একাধিক মানুষ কাজ করলে "কে সরিয়েছিল?" প্রশ্নের উত্তর থাকা দরকার।

create table if not exists admin_audit (
  id          bigserial primary key,
  actor       text not null,        -- ইমেইল
  action      text not null,        -- hide / unhide / edit / delete / post / settings / user
  target      text,                 -- slug বা ব্যবহারকারীর ইমেইল
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_audit_created_idx on admin_audit (created_at desc);


-- ============================================================
-- ৫. RLS
-- ============================================================
-- এই টেবিলগুলোয় কোনো public পলিসি নেই — anon key দিয়ে ছোঁয়াও যাবে না।
-- অ্যাডমিন প্যানেল সার্ভারের ভেতর থেকে service key দিয়ে কাজ করে, যা
-- RLS বাইপাস করে। ব্রাউজারে service key কোনোদিন যায় না।

alter table admin_users  enable row level security;
alter table app_settings enable row level security;
alter table admin_audit  enable row level security;

-- সাইটে লুকানো খবর যেন না দেখায়
drop policy if exists "articles_public_read" on articles;
create policy "articles_public_read" on articles
  for select using (hidden = false);
