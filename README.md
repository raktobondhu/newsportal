# লিখুন (likhun.com)

বাংলা সংবাদ পোর্টাল — RSS থেকে খবর সংগ্রহ করে বাংলায় পুনর্লিখন, সোশ্যাল কার্ড
তৈরি, ওয়েবসাইটে প্রকাশ ও ফেসবুক পেজে পোস্ট — সবটাই স্বয়ংক্রিয়।

```
RSS (১৬ সোর্স) → ডিডুপ ও র‍্যাঙ্কিং → আর্টিকেল এক্সট্র্যাক্ট
   → Gemini/Groq বাংলা রিরাইট → ১০৮০x১০৮০ কার্ড রেন্ডার
   → Supabase (DB + Storage) → Next.js সাইট
                             → ফেসবুক পোস্ট + কমেন্টে লিংক
```

## গঠন

| ফোল্ডার | কী আছে |
|---|---|
| `pipeline/` | সংগ্রহ থেকে প্রকাশ পর্যন্ত পুরো পাইপলাইন (Node.js) |
| `web/` | ওয়েবসাইট (Next.js, Supabase থেকে পড়ে) |
| `templates/` | সোশ্যাল কার্ডের ডিজাইন (HTML) |
| `assets/` | লোগো ও বাংলা ফন্ট |
| `supabase/` | ডেটাবেস স্কিমা |
| `tools/` | ফেসবুক টোকেন সেটআপ (PowerShell) |

## প্রথমবার সেটআপ

**১. ডেটাবেস** — Supabase → SQL Editor → `supabase/schema.sql` চালান।

**২. স্টোরেজ বাকেট**
```bash
cd pipeline && npm install && node test/setup-buckets.mjs
```

**৩. ফেসবুক টোকেন** — Graph API Explorer থেকে এই পারমিশনসহ টোকেন নিন:
`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
`pages_manage_metadata`, `pages_manage_engagement`

তারপর permanent Page token বানান:
```powershell
.\tools\fb-token-setup.ps1 -AppId "..." -AppSecret "..." -ShortToken "EAA..."
```

**৪. `.env.local`** (রিপোর্টে নেই, নিজে বানাতে হবে)
```
SITE_NAME=লিখুন
SITE_SLOGAN=আপনার কন্ঠ, আমাদের কলম
SITE_URL=https://your-domain.com
BRAND_ACCENT=#d11d4d

GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash
GROQ_API_KEY=...
GROQ_MODEL=qwen/qwen3.6-27b

FB_PAGE_ID=...
FB_PAGE_TOKEN=...
FB_API_VERSION=v24.0

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=...
SUPABASE_ANON_KEY=...
```

## চালানো

```bash
cd pipeline
node src/run.js --dry-run --max=5   # কিছু প্রকাশ হবে না, শুধু তৈরি
node src/run.js --max=5 --posts=2   # লাইভ
```

`--no-facebook` দিলে সাইটে যাবে কিন্তু ফেসবুকে নয়।

### যাচাইয়ের স্ক্রিপ্ট

```bash
node test/check-sources.mjs     # সব RSS ফিড ও এক্সট্র্যাকশন ঠিক আছে?
node test/check-rewrite.mjs     # রিরাইটের মান
node test/check-social.mjs      # সাইট বনাম ফেসবুক শিরোনাম
node test/check-dedupe.mjs      # ডিডুপ থ্রেশহোল্ড
node test/check-card.mjs        # কার্ড রেন্ডারিং
```

সোর্স সাইটের লেআউট বদলালে `check-sources.mjs` সবার আগে ধরবে।

## ওয়েবসাইট

```bash
cd web && npm install && npm run dev
```

Vercel-এ ডেপ্লয়: **Root Directory = `web`**, আর তিনটি environment variable —
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SITE_URL`।

> `NEXT_PUBLIC_` দিয়ে শুরু হওয়া ভ্যারিয়েবল ব্রাউজারে পৌঁছায়। তাই ওখানে
> **anon key** দিতে হবে, service key কখনোই নয়।

## স্বয়ংক্রিয় চালনা

`.github/workflows/pipeline.yml` — প্রতি ঘণ্টায় একবার।
দিনে ~১৯২টি আর্টিকেল, ~৪৮টি ফেসবুক পোস্ট। সংখ্যা অ্যাডমিন প্যানেলের সেটিংস থেকে বদলানো যায়।

GitHub → Settings-এ যা লাগবে:

- **Secrets:** `GEMINI_API_KEY`, `GROQ_API_KEY`, `FB_PAGE_ID`, `FB_PAGE_TOKEN`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- **Variables:** `SITE_URL`

`SITE_URL` না থাকলে লাইভ রান ইচ্ছাকৃতভাবে ব্যর্থ হয় — লিংকহীন পোস্ট যাওয়ার
চেয়ে থেমে যাওয়াই ভালো।

## কিছু সিদ্ধান্তের কারণ

কোডে যেখানে অস্বাভাবিক কিছু আছে, সেখানে কারণ মন্তব্যে লেখা। সবচেয়ে
গুরুত্বপূর্ণগুলো:

- **কার্ড রেন্ডার হয় হেডলেস ব্রাউজারে**, Pillow/sharp/canvas দিয়ে নয় —
  HarfBuzz text shaping ছাড়া বাংলা যুক্তাক্ষর ভেঙে যায় (ক্ষ → ক্‌ষ)।
- **ফন্ট HTML-এ base64 হিসেবে এম্বেড করা** — CI সার্ভারে বাংলা ফন্ট থাকে না।
- **স্ল্যাগ NFC-তে normalize করা** — নাহলে Next.js-এর রুট প্যারামিটারের সঙ্গে
  মেলে না এবং প্রতিটি আর্টিকেল নীরবে ৪০৪ হয়।
- **Storage-এ ফাইলের নাম স্ল্যাগের হ্যাশ** — Supabase অ-ASCII কী নেয় না।
- **সোর্সের ছবি CDN থেকে বড় সংস্করণে চাওয়া হয়** (BBC ১৯২০, প্রথম আলো ১৬০০) —
  og:image-এর ১২০০x৬৩০ বর্গাকার কার্ডে টেনে বড় করলে ঘোলা দেখায়।
- **ছোট দিক ৮০০px-এর কম হলে ছবি বাদ**, টেক্সট কার্ড হয়।

## সীমাবদ্ধতা

- Gemini-র ফ্রি কোটা দিনে সীমিত; শেষ হলে Groq ধরে, তবে বাংলার মান কিছুটা কম।
- `bd-pratidin`, `kalerkantho`, `bdnews24`, `jugantor` — এদের ফিড Cloudflare-এ
  ৪০৩ দেয়, তাই সোর্স তালিকায় নেই।
- খবরের মূল সূত্র ডেটাবেসে রাখা হয় কিন্তু সাইটে দেখানো হয় না।
