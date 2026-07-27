-- ডেটাবেস স্কিমা
-- Supabase ড্যাশবোর্ড → SQL Editor → এই পুরো ফাইলটা পেস্ট করে Run করুন।
-- একাধিকবার চালালেও সমস্যা নেই (if not exists ব্যবহার করা হয়েছে)।
--
-- ⚠️ এই ফাইলই সম্পূর্ণ সেটআপ নয়। দুটি Storage বাকেটও লাগবে:
--
--      cards   (public)  — সোশ্যাল কার্ড PNG
--      images  (public)  — খবরের মূল ছবি
--
-- বাকেট না থাকলে uploadFile() 404 "Bucket not found" পায়, ফলে
-- image_url / card_url NULL থেকে যায় এবং সাইটে ছবির জায়গা ফাঁকা দেখায়।
-- বানানোর সহজ উপায়:  node pipeline/test/setup-buckets.mjs
-- অথবা ড্যাশবোর্ড → Storage → New bucket → নাম দিন, "Public bucket" চালু করুন।
--
-- বাকেটের নাম ASCII-ই রাখতে হবে, আর ফাইলের নামও — Supabase Storage
-- অ-ASCII কী প্রত্যাখ্যান করে ("InvalidKey")। তাই পাইপলাইন বাংলা স্ল্যাগের
-- বদলে তার হ্যাশ ব্যবহার করে অবজেক্টের নাম হিসেবে।

create table if not exists articles (
  slug                text primary key,
  headline            text not null,
  summary             text,
  body                text not null,
  category            text not null,
  tags                text[] not null default '{}',
  is_opinion          boolean not null default false,

  -- অ্যাট্রিবিউশন — প্রতিটি খবরের মূল সূত্র রাখা বাধ্যতামূলক
  source_name         text not null,
  source_url          text not null,
  also_in             text[] not null default '{}',

  score               numeric,
  provider            text,          -- gemini / groq
  model               text,

  original_image      text,          -- সোর্সের মূল ছবির URL
  image_url           text,          -- আমাদের স্টোরেজে রাখা ছবি (সাইটে দেখানো হয়)
  card_url            text,          -- সোশ্যাল কার্ড (ফেসবুক ও og:image)
  card_style          text,          -- photo / text

  published_at        timestamptz not null default now(),
  source_published_at timestamptz,

  facebook_post_id    text,
  facebook_posted_at  timestamptz,

  created_at          timestamptz not null default now()
);

-- ফেসবুকের জন্য আলাদা শিরোনাম। সাইটে headline-ই দেখানো হয় (নিরপেক্ষ ও
-- নির্ভুল), কিন্তু ফিডে ক্লিক পেতে অন্যরকম শিরোনাম লাগে।
-- আলাদা alter, কারণ টেবিলটা আগেই তৈরি করা ইনস্টলেশনেও কলামটা লাগবে।
alter table articles add column if not exists social_headline text;

-- হোমপেজ ও ক্যাটাগরি পেজ দুটোই সময় অনুযায়ী সাজানো তালিকা চায়
create index if not exists articles_published_idx on articles (published_at desc);
create index if not exists articles_category_idx  on articles (category, published_at desc);

-- আগে দেখা লিংক — একই খবর দুবার প্রকাশ ঠেকাতে।
-- আলাদা টেবিল, কারণ যে লিংকগুলো বাদ পড়েছে (ভিডিও, লেখা পাওয়া যায়নি)
-- সেগুলোও মনে রাখা দরকার, অথচ তাদের কোনো আর্টিকেল নেই।
create table if not exists seen_links (
  url      text primary key,
  seen_at  timestamptz not null default now()
);

create index if not exists seen_links_seen_at_idx on seen_links (seen_at desc);

-- রিরাইট-পরবর্তী বাংলা শিরোনাম — ভাষা-পারাপার ডিডুপের জন্য।
-- বাংলা ও ইংরেজি শিরোনামে কোনো শব্দ মেলে না, তাই মিলিয়ে দেখা যায়
-- কেবল রিরাইটের পরে।
create table if not exists recent_headlines (
  id          bigserial primary key,
  headline    text not null,
  created_at  timestamptz not null default now()
);

create index if not exists recent_headlines_created_idx on recent_headlines (created_at desc);


-- ============================================================
-- Row Level Security
-- ============================================================
-- পাইপলাইন service_role key ব্যবহার করে, যা RLS বাইপাস করে — তাই
-- লেখার জন্য আলাদা পলিসি লাগে না। ওয়েবসাইট anon key দিয়ে শুধু পড়ে।

alter table articles        enable row level security;
alter table seen_links      enable row level security;
alter table recent_headlines enable row level security;

-- সাইটের জন্য প্রকাশিত আর্টিকেল সবাই পড়তে পারবে
drop policy if exists "articles_public_read" on articles;
create policy "articles_public_read" on articles
  for select using (true);

-- seen_links ও recent_headlines অভ্যন্তরীণ — কোনো public পলিসি নেই,
-- ফলে anon key দিয়ে এগুলো পড়া যাবে না। এটাই উদ্দেশ্য।
