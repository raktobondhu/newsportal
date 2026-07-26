import { config } from './config.js';
import { log, sleep } from './util.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const CATEGORIES = ['জাতীয়', 'আন্তর্জাতিক', 'রাজনীতি', 'অর্থনীতি', 'খেলা', 'বিনোদন', 'প্রযুক্তি', 'শিক্ষা', 'স্বাস্থ্য', 'অপরাধ'];

/**
 * রিরাইটের নির্দেশনা।
 *
 * দুটো জিনিস ইচ্ছাকৃতভাবে কড়া করা হয়েছে:
 *  ১. "নতুন তথ্য যোগ করবে না" — LLM অনুমান থেকে সংখ্যা/নাম বানিয়ে ফেললে
 *     সেটা সংবাদ হিসেবে প্রকাশ পাবে, যা মারাত্মক।
 *  ২. "সোর্সের বাক্য হুবহু রাখবে না" — হুবহু রাখলে কপিরাইট ঝুঁকি বাড়ে।
 */
function buildPrompt({ title, body, sourceName, sourceLang }) {
  const langNote =
    sourceLang === 'bn'
      ? 'মূল লেখাটি বাংলায়। এটিকে নিজের ভাষায় নতুন করে লেখো — অনুবাদ নয়, পুনর্লিখন।'
      : 'মূল লেখাটি ইংরেজিতে। স্বাভাবিক, সাবলীল বাংলায় লেখো — আক্ষরিক অনুবাদ নয়।';

  return `তুমি একজন অভিজ্ঞ বাংলা সংবাদ সম্পাদক। নিচের সংবাদটি পড়ে বাংলায় নতুন করে লেখো।

${langNote}

পরিভাষা (এগুলো গুলিয়ে ফেলা চলবে না):
- wildfire / bushfire = দাবানল (আগুন) — "বন্যা" নয়
- flood = বন্যা (পানি) | drought = খরা | landslide = ভূমিধস
- evacuate = সরিয়ে নেওয়া / নিরাপদ স্থানে স্থানান্তর — "উচ্ছেদ" নয়
- casualties = হতাহত | injured = আহত | death toll = মৃতের সংখ্যা
- envoy = দূত | verdict = রায় | indictment = অভিযোগ গঠন
- ceasefire = যুদ্ধবিরতি | sanctions = নিষেধাজ্ঞা | inflation = মূল্যস্ফীতি

কঠোর নিয়ম:
- মূল সংবাদে যে তথ্য নেই, তা কোনোভাবেই যোগ করবে না। সংখ্যা, নাম, তারিখ, স্থান — সব হুবহু মূল সংবাদ অনুযায়ী।
- ঘটনার ধরন ভুল করবে না: আগুনের খবরকে বন্যা, দুর্ঘটনাকে হামলা বলা চলবে না।
- নিশ্চিত না হলে সেই তথ্য বাদ দাও, অনুমান করবে না।
- মূল লেখার কোনো বাক্য হুবহু রাখবে না, নিজের ভাষায় লেখো।
- নিরপেক্ষ সংবাদের ভাষা ব্যবহার করো। নিজের মতামত, বিশেষণ বা আবেগ যোগ করবে না।
- সংখ্যা বাংলা অঙ্কে লেখো (৪৭, ২০২৬)।
- শিরোনাম ৭০ অক্ষরের মধ্যে রাখো, আকর্ষণীয় কিন্তু অতিরঞ্জিত নয়।

socialHeadline — ফেসবুকের জন্য আলাদা শিরোনাম। এটি headline-এর সামান্য
অদলবদল নয়, একেবারে ভিন্নভাবে লেখা। পাঠক ফিড স্ক্রল করতে করতে থমকে যাবে —
এটাই একমাত্র লক্ষ্য।

কীভাবে লিখবে:
- খবরের সবচেয়ে চমকপ্রদ একক তথ্যটি খুঁজে বের করো (একটি সংখ্যা, একটি
  বৈপরীত্য, একটি অপ্রত্যাশিত নাম) আর সেটাকেই একদম সামনে বসাও।
- সরকারি ভাষা বাদ। "অনুষ্ঠিত হয়েছে", "ঘোষণা দিয়েছেন", "সংক্রান্ত" —
  এসব শব্দ ফিডে কেউ পড়ে না।
- সর্বোচ্চ ৬৫ অক্ষর। এটি কড়া সীমা, লম্বা হলে ফেসবুকে কেটে যায়।

উদাহরণ (বাঁয়ে সাইটের, ডানে ফেসবুকের):
- "সরাইলে এক বছরে ৭ হত্যাকাণ্ড, অধরাই রয়ে গেছে সব অপরাধী"
  → "এক বছরে ৭ খুন, ধরা পড়েনি একজনও"
- "প্রধানমন্ত্রীর সঙ্গে নৌবাহিনী প্রধানের সৌজন্য সাক্ষাৎ"
  → "নতুন নৌপ্রধানের প্রথম সাক্ষাৎ প্রধানমন্ত্রীর সঙ্গে"
- "আইসিইউতে ছড়াচ্ছে ওষুধ-প্রতিরোধী ব্যাকটেরিয়া, মৃত্যুহার ৯০ শতাংশ"
  → "হাসপাতালের আইসিইউতেই মরছে ১০ জনে ৯ জন"

যা কোনোভাবেই করবে না:
- খবরে নেই এমন কিছু লেখা। বানানো সংখ্যা, অতিরঞ্জিত দাবি — সম্পূর্ণ নিষিদ্ধ।
- "বিশ্বাস করতে পারবেন না", "যা ঘটল তা অবিশ্বাস্য" জাতীয় ফাঁপা কথা।
- এমন প্রশ্ন করা যার উত্তর খবরের ভেতরে নেই।
- "লাইক দিন", "শেয়ার করুন", "কমেন্টে জানান" — ফেসবুক এসব পোস্টের রিচ কমিয়ে দেয়।

শুধু নিচের JSON ফরম্যাটে উত্তর দাও, আর কোনো লেখা নয়:
{
  "headline": "বাংলা শিরোনাম",
  "socialHeadline": "ফেসবুকের জন্য শিরোনাম, ৬৫ অক্ষরের মধ্যে",
  "summary": "এক বাক্যে সারমর্ম, ১৫০ অক্ষরের মধ্যে",
  "body": "সম্পূর্ণ সংবাদ, ৩-৫টি অনুচ্ছেদ, অনুচ্ছেদের মাঝে দুটি নিউলাইন",
  "category": "${CATEGORIES.join(' | ')} — এর মধ্যে সবচেয়ে মানানসই একটি",
  "tags": ["৩-৫টি বাংলা কীওয়ার্ড"],
  "isOpinion": true/false (মতামত বা বিশ্লেষণধর্মী লেখা কিনা)
}

সোর্স: ${sourceName}
মূল শিরোনাম: ${title}

মূল লেখা:
${body.slice(0, 5000)}`;
}

const SOCIAL_HEADLINE_MAX = 65;

/**
 * দৃশ্যমান অক্ষর গোনা।
 *
 * `.length` বাংলায় ব্যবহার করা যায় না: যুক্তাক্ষর ও কার-চিহ্ন মিলে একটি
 * অক্ষর একাধিক UTF-16 একক নেয়। মেপে দেখা গেছে অনুপাতটা ~০.৬৪ —
 * অর্থাৎ `.length` দিয়ে ৬৫ কাটলে আসলে ~৪২ অক্ষরে কেটে যেত, অথচ
 * প্রম্পটে মডেলকে ৬৫ *অক্ষর* লিখতে বলা হয়েছে। ফলে মডেল ঠিক কাজ করলেই
 * শিরোনাম বাতিল হয়ে নিরপেক্ষটায় ফিরে যেত — যে ফিচারটা যোগ করা হলো,
 * সেটাই নীরবে অকেজো থাকত।
 */
const segmenter = new Intl.Segmenter('bn', { granularity: 'grapheme' });
const graphemes = (s) => [...segmenter.segment(s)].map((x) => x.segment);

function trimToGraphemes(s, max) {
  const g = graphemes(s);
  return g.length <= max ? s : g.slice(0, max).join('');
}

/**
 * সোশ্যাল শিরোনামের দৈর্ঘ্য নিয়ন্ত্রণ।
 *
 * মাঝপথে কাটি না — অর্ধেক বাক্য ফিডে দেখতে ভাঙা লাগে। বরং শেষ পূর্ণ
 * বিরামচিহ্ন পর্যন্ত রাখি; তাতেও না কুলালে সাইটের শিরোনামে ফিরি।
 * fallback-ও ছেঁটে দিই — সেটি প্রম্পটে ৭০ অক্ষর বলা থাকলেও মডেল
 * নিয়মিত ছাড়িয়ে যায়, আর অসীম লম্বা শিরোনাম ফিডে কেটে যায়।
 */
function capSocialHeadline(social, fallback) {
  const safeFallback = trimToGraphemes(fallback, SOCIAL_HEADLINE_MAX);
  if (!social) return safeFallback;

  if (graphemes(social).length <= SOCIAL_HEADLINE_MAX) return social;

  const cut = trimToGraphemes(social, SOCIAL_HEADLINE_MAX);
  const lastBreak = Math.max(cut.lastIndexOf(','), cut.lastIndexOf(';'), cut.lastIndexOf('—'), cut.lastIndexOf('।'));

  // ক্লজ-সীমা যথেষ্ট দূরে হলে সেখানেই থামি। `>=` কারণ ঠিক সীমানায়
  // থাকা বৈধ ক্লজও আগে বাতিল হয়ে যেত।
  if (lastBreak >= 20) {
    const clause = cut.slice(0, lastBreak).trim();
    if (clause) return clause;
  }
  return safeFallback;
}

/** মডেলের উত্তর থেকে JSON বের করা — কখনো ```json ব্লকে মুড়ে দেয় */
function parseModelJson(text) {
  if (!text) return null;
  let t = text.trim();

  // qwen-জাতীয় thinking মডেল উত্তরের আগে <think>...</think> জুড়ে দেয়,
  // আর সেই অংশে { } থাকতে পারে — আগে ছেঁটে না ফেললে ভুল JSON ধরা পড়ে
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  // ফেন্স না থাকলেও আগে-পরে কথা থাকতে পারে, প্রথম { থেকে শেষ } পর্যন্ত নিই
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last <= first) return null;

  try {
    return JSON.parse(t.slice(first, last + 1));
  } catch {
    return null;
  }
}

async function callGemini(model, prompt, { timeout = 60000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          // gemini-3.x একটি thinking মডেল — thoughtsTokenCount-ও এই বাজেট
          // থেকেই কাটে, আর সেটা রানভেদে বদলায় (৭০০ থেকে ১২০০+ দেখা গেছে)।
          // ২০৪৮ রাখলে লম্বা খবরে JSON মাঝপথে কেটে যায়, তখন পার্স ব্যর্থ হয়।
          // thinkingBudget:0 দিয়ে thinking বন্ধ করা যায় না — খালি উত্তর আসে।
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const err = new Error(json?.error?.message || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }

    const cand = json?.candidates?.[0];
    // নিরাপত্তা ফিল্টারে আটকালে candidate থাকে কিন্তু কনটেন্ট থাকে না
    if (!cand?.content?.parts?.length) {
      const err = new Error(`কনটেন্ট ফেরত আসেনি (finishReason: ${cand?.finishReason ?? 'unknown'})`);
      err.blocked = true;
      throw err;
    }
    return {
      text: cand.content.parts.map((p) => p.text ?? '').join(''),
      finishReason: cand.finishReason,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Groq-এর thinking মডেলগুলো নিয়ন্ত্রণ না করলে পুরো টোকেন বাজেট চিন্তায়
 * খরচ করে ফেলে এবং JSON আর আসে না (finishReason: length)।
 * reasoning বন্ধ করলে qwen ৩৭৯৭ → ৫৪৭ টোকেন, ৭.৭ → ১.৩ সেকেন্ড।
 *
 * গ্রহণযোগ্য মান মডেলভেদে আলাদা — API যা বলে:
 *   qwen    : none | default
 *   gpt-oss : low | medium | high
 * ভুল মান পাঠালে 400 আসে, তাই এটা অনুমান নয়, মডেল দেখে ঠিক করা হয়।
 *
 * max_tokens ছোট রাখাও জরুরি: Groq-এর ফ্রি টিয়ারে প্রতি-মিনিট টোকেন
 * বাজেট আছে, বড় চাইলে "Request too large" দেয় — অনুরোধ পাঠানোর আগেই।
 */
function groqTuning(model) {
  const base = { max_tokens: 3072 };
  if (/qwen/i.test(model)) return { ...base, reasoning_effort: 'none' };
  if (/gpt-oss/i.test(model)) return { ...base, reasoning_effort: 'low' };
  return base;
}

/** Groq — OpenAI-সঙ্গতিপূর্ণ API */
async function callGroq(model, prompt, { timeout = 60000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.groq.apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        ...groqTuning(model),
        // response_format: json_object ইচ্ছাকৃতভাবে দিচ্ছি না।
        // qwen thinking মডেল JSON-এর আগে <think>...</think> লেখে, আর তাতে
        // Groq-এর ভ্যালিডেশন ব্যর্থ হয় ("Failed to validate JSON") — অথচ
        // qwen-ই Groq-এ সবচেয়ে ভালো বাংলা লেখে। parseModelJson নিজেই
        // <think> ও ``` ফেন্স ছেঁটে ফেলে, তাই আলগা মোডেই নিরাপদ।
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(json?.error?.message || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const choice = json?.choices?.[0];
    return { text: choice?.message?.content ?? '', finishReason: choice?.finish_reason };
  } finally {
    clearTimeout(timer);
  }
}

/** প্রোভাইডারের ক্রম: Gemini আগে (বাংলা সবচেয়ে ভালো), কোটা শেষে Groq */
function providerChain() {
  const chain = [];
  if (config.gemini.apiKey) {
    for (const m of config.gemini.models) chain.push({ provider: 'gemini', model: m, call: callGemini });
  }
  if (config.groq.apiKey) {
    for (const m of config.groq.models) chain.push({ provider: 'groq', model: m, call: callGroq });
  }
  return chain;
}

/**
 * একাধিক প্রোভাইডার ও মডেলে ক্রমান্বয়ে চেষ্টা — কোটা (429) বা মডেল
 * অবসর (404) হলে পরেরটায় যায়।
 *
 * retries শুধু 429-এর জন্য নয়: thinking-টোকেনের অনিয়মিত খরচের কারণে
 * একই ইনপুটে একবার সম্পূর্ণ JSON আসে, পরেরবার কাটা পড়ে। তাই পার্স
 * ব্যর্থ হলেও একই মডেলে আরেকবার চেষ্টা করা হয়।
 */
export async function rewriteArticle(item, { retries = 2 } = {}) {
  const chain = providerChain();
  if (!chain.length) throw new Error('কোনো LLM key নেই (GEMINI_API_KEY / GROQ_API_KEY)');

  const prompt = buildPrompt({
    title: item.title,
    body: item.body || item.summary || '',
    sourceName: item.sourceName,
    sourceLang: item.sourceLang,
  });

  let lastErr = null;

  for (const { provider, model, call } of chain) {
    const tag = `${provider}/${model}`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { text: raw, finishReason } = await call(model, prompt);
        const parsed = parseModelJson(raw);
        if (!parsed?.headline || !parsed?.body) {
          const err = new Error(
            `উত্তর পার্স হয়নি (finishReason: ${finishReason ?? '?'}, দৈর্ঘ্য: ${raw?.length ?? 0})`
          );
          err.parseFailed = true;
          throw err;
        }
        const headline = String(parsed.headline).trim();

        /**
         * আকর্ষণীয় শিরোনাম কেবল প্রধান প্রোভাইডার (Gemini) থেকেই নিই।
         *
         * কারণ বাস্তবে দেখা: qwen একটি মৃত্যুর খবরে লিখেছিল
         * "স্বামী ডুবে মরতে গেলেন স্ত্রী, খালে তলিয়ে গেল নববধূ" — বাক্যগঠন
         * এলোমেলো, স্বামীর মৃত্যুর কথাই বাদ। আগে একই মডেল দাবানলকে
         * "বন্যা"ও লিখেছে।
         *
         * শব্দভাণ্ডার মিলিয়ে এটা ধরা যায় না — শব্দগুলো তো ঠিকই আছে,
         * বিন্যাসটাই ভুল। তাই স্বয়ংক্রিয় পরীক্ষা নয়, নিয়মই বদলালাম:
         * ব্যাকআপ মডেলে চললে ফেসবুকেও নিরপেক্ষ শিরোনামটাই যাক।
         * কম আকর্ষণীয় হোক, ভুল হওয়ার চেয়ে ঢের ভালো।
         */
        const trustSocial = provider === 'gemini';

        return {
          headline,
          // মডেল মাঝে মাঝে বাড়তি ফিল্ডটা বাদ দেয়। তখন নিরপেক্ষ শিরোনামই
          // ফেসবুকে যাক — শিরোনামহীন পোস্টের চেয়ে সেটা অনেক ভালো।
          // দৈর্ঘ্যও এখানেই সামলাই: প্রম্পটে ৬৫ অক্ষর বলা থাকলেও মডেল
          // নিয়মিত ছাড়িয়ে যায়, আর লম্বা শিরোনাম ফিডে কেটে যায়।
          socialHeadline: capSocialHeadline(trustSocial ? String(parsed.socialHeadline ?? '').trim() : '', headline),
          summary: String(parsed.summary ?? '').trim(),
          body: String(parsed.body).trim(),
          category: CATEGORIES.includes(parsed.category) ? parsed.category : 'জাতীয়',
          tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 6) : [],
          isOpinion: Boolean(parsed.isOpinion),
          provider,
          model,
        };
      } catch (err) {
        lastErr = err;

        // দৈনিক কোটা শেষ হলে অপেক্ষা করে লাভ নেই — সরাসরি পরের প্রোভাইডারে
        const dailyQuota = err.status === 429 && /daily|per day|quota/i.test(err.message);

        if (err.status === 429 && !dailyQuota && attempt < retries) {
          log('rewrite', `${tag}: রেট লিমিট, ২০ সেকেন্ড অপেক্ষা...`);
          await sleep(20000);
          continue;
        }
        // কাটা-পড়া উত্তর বা সাময়িক সার্ভার সমস্যা — একই মডেলে আবার চেষ্টা
        if ((err.parseFailed || err.status >= 500) && attempt < retries) {
          log('rewrite', `${tag}: ${err.message.slice(0, 60)} — আবার চেষ্টা`);
          await sleep(1500);
          continue;
        }
        // 404 = মডেল আর নেই, 429 = কোটা শেষ — পরের মডেল/প্রোভাইডারে যাই
        log('rewrite', `${tag}: ${err.message.slice(0, 80)}`);
        break;
      }
    }
  }

  throw new Error(`সব মডেল ব্যর্থ — ${lastErr?.message ?? 'অজানা'}`);
}

export { CATEGORIES };
