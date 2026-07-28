-- বিজ্ঞাপন ও তৃতীয় পক্ষের কোড (Analytics, Search Console, AdSense)
-- Supabase → SQL Editor → পুরোটা পেস্ট করে Run করুন।
-- একাধিকবার চালানো নিরাপদ।
--
-- schema.sql ও admin-schema.sql চালানোর পরে এটি চালাতে হবে — এখানে
-- app_settings টেবিলে সারি ঢোকানো হয়, যেটি admin-schema.sql বানায়।


-- ============================================================
-- ১. বিজ্ঞাপন
-- ============================================================
-- নিজেদের বিক্রি করা বিজ্ঞাপন — ছবি (gif/png/webp/jpg) আর একটি লিংক।
-- AdSense আলাদা ব্যাপার, সেটি নিচের সেটিংসে।

create table if not exists ads (
  id          bigserial primary key,
  name        text not null,              -- কেবল প্যানেলে চেনার জন্য
  placement   text not null,              -- কোথায় বসবে, নিচের তালিকা দেখুন
  image_url   text not null,
  link_url    text,                       -- খালি হলে ছবিটি ক্লিকযোগ্য নয়
  alt         text,

  active      boolean not null default true,

  -- একই জায়গায় একাধিক বিজ্ঞাপন থাকলে ছোট sort আগে
  sort        integer not null default 0,

  -- মেয়াদ। খালি মানে সীমা নেই। বিজ্ঞাপন বিক্রি হয় সময় ধরে, তাই
  -- তারিখ পেরোলে নিজে থেকেই বন্ধ হওয়া দরকার — হাতে বন্ধ করতে ভুলে
  -- গেলে বিনামূল্যে দেখানো হতে থাকত।
  starts_at   timestamptz,
  ends_at     timestamptz,

  -- ক্লিকের হিসাব। ইমপ্রেশন গোনা হয় না ইচ্ছাকৃতভাবে: পাতাগুলো
  -- স্ট্যাটিক (ISR), তাই প্রতিটি দর্শনে সার্ভারে লেখা হয় না। ক্লিক
  -- গোনা যায়, কারণ ক্লিক সবসময় /go/[id] রুট হয়ে যায়।
  clicks      bigint not null default 0,

  created_at  timestamptz not null default now(),
  created_by  text
);

-- সাইট প্রতি পাতায় "এই জায়গার চালু বিজ্ঞাপনগুলো" খোঁজে, তাই এই ক্রম
create index if not exists ads_placement_idx on ads (placement, active, sort);


-- ============================================================
-- ২. নতুন সেটিংস
-- ============================================================
-- মান খালি স্ট্রিং মানে "বন্ধ" — কোড কোথাও স্ক্রিপ্ট বসাবে না।
-- ফলে কিছু কনফিগার না করলে সাইট আগের মতোই চলে।

-- adsense_slot_* : AdSense ড্যাশবোর্ডে ইউনিট বানালে যে ad slot আইডি
-- পাওয়া যায়। যে জায়গার আইডি বসানো থাকবে এবং যেখানে নিজেদের বিজ্ঞাপন
-- নেই, কেবল সেখানেই AdSense-এর ইউনিট বসবে।
insert into app_settings (key, value) values
  ('google_analytics_id',      '""'::jsonb),   -- G-XXXXXXXXXX
  ('google_site_verification', '""'::jsonb),   -- meta tag এর content অংশ
  ('adsense_publisher_id',     '""'::jsonb),   -- ca-pub-XXXXXXXXXXXXXXXX
  ('adsense_slots',            '{}'::jsonb),   -- { "sidebar": "1234567890", ... }
  ('ads_enabled',              'true'::jsonb)  -- নিজেদের বিজ্ঞাপনের মূল সুইচ
on conflict (key) do nothing;


-- ============================================================
-- ৩. RLS
-- ============================================================

alter table ads enable row level security;

-- সাইট anon key দিয়ে পড়ে (articles-এর মতোই)। কেবল চালু বিজ্ঞাপনই
-- বাইরে যায় — বন্ধ বা খসড়া বিজ্ঞাপন anon key দিয়ে দেখা যাবে না।
-- মেয়াদের যাচাই কোডে হয়, পলিসিতে নয়: পলিসিতে now() বসালে PostgREST
-- এর ফলাফল সময়ের সাথে বদলায়, ফলে ক্যাশ করা কঠিন হতো।
drop policy if exists "ads_public_read" on ads;
create policy "ads_public_read" on ads
  for select using (active = true);

-- app_settings-এ কোনো public পলিসি ছিল না — পুরো টেবিলটাই গোপন।
-- কিন্তু সাইটের <head>-এ Analytics ও AdSense বসাতে হলে পাবলিক দিক
-- থেকে ওই কয়টি কী পড়তে হয়। তাই নাম ধরে সাদা-তালিকা, পুরো টেবিল নয় —
-- ভবিষ্যতে কেউ এখানে গোপন কিছু রাখলেও সেটি বাইরে যাবে না।
drop policy if exists "app_settings_public_read" on app_settings;
create policy "app_settings_public_read" on app_settings
  for select using (
    key in (
      'google_analytics_id',
      'google_site_verification',
      'adsense_publisher_id',
      'adsense_slots',
      'ads_enabled'
    )
  );


-- ============================================================
-- ৪. ক্লিক গোনা
-- ============================================================
-- সরাসরি UPDATE ads SET clicks = clicks + 1 চালালে দুজন একসাথে ক্লিক
-- করলে একটি গোনা বাদ পড়তে পারে (read-modify-write)। ডেটাবেসের ভেতরে
-- বাড়ালে সেই ঝুঁকি নেই।

create or replace function bump_ad_click(ad_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update ads set clicks = clicks + 1 where id = ad_id;
$$;


-- ============================================================
-- বিজ্ঞাপনের জায়গাগুলো (placement)
-- ============================================================
--   header_top     হেডারের ঠিক নিচে, পুরো চওড়া (leaderboard)
--   home_top       হোমপেজে প্রধান খবরের পরে
--   home_mid       হোমপেজে বিভাগগুলোর মাঝখানে
--   home_bottom    হোমপেজের শেষে
--   sidebar        হোমপেজের ডান পাশের রেলে
--   article_top    খবরের পাতায় লেখার আগে
--   article_mid    খবরের পাতায় লেখার মাঝখানে
--   article_bottom খবরের পাতায় লেখার পরে
--   footer         ফুটারের ঠিক উপরে
--
-- এই তালিকাটি web/lib/ads.js এর AD_PLACEMENTS এর সঙ্গে মিলিয়ে রাখতে হয়।
