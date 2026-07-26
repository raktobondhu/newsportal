import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * .env.local পড়ি নিজেরাই।
 * dotenv প্যাকেজ ব্যবহার করছি না — ফাইলে বাংলা ভ্যালু আছে (SITE_NAME),
 * তাই এনকোডিং নিজে নিয়ন্ত্রণে রাখা দরকার। BOM থাকলেও ছেঁটে ফেলি,
 * নাহলে প্রথম key-টা '﻿FB_PAGE_ID' হয়ে যায়।
 */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  let raw = fs.readFileSync(file, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const fileEnv = loadEnvFile(path.join(ROOT, '.env.local'));
// আসল environment variable-কে অগ্রাধিকার — CI-তে secret ওভাররাইড করতে হয়
const env = (k, fallback = '') => process.env[k] ?? fileEnv[k] ?? fallback;

export const config = {
  siteName: env('SITE_NAME', 'কথা ম্যাট্রিক্স'),
  siteUrl: env('SITE_URL', '').replace(/\/$/, ''),
  brandAccent: env('BRAND_ACCENT', '#d11d4d'),

  gemini: {
    apiKey: env('GEMINI_API_KEY'),
    // প্রথমটা ব্যর্থ হলে পরেরটা — কোটা শেষ বা মডেল অবসর নিলে যেন পাইপলাইন না থামে
    models: [env('GEMINI_MODEL', 'gemini-3.6-flash'), env('GEMINI_FALLBACK_MODEL', 'gemini-flash-latest')].filter(Boolean),
  },

  /**
   * Groq আলাদা প্রোভাইডার, আলাদা কোটা — Gemini-র দৈনিক সীমা শেষ হলে
   * এটাই পাইপলাইন চালু রাখে। দুই Gemini মডেল একই কোটার নিচে থাকায়
   * সেগুলো একে অন্যের প্রকৃত ব্যাকআপ ছিল না।
   *
   * মডেল বাছাই যাচাই করে: qwen3.6-27b বাংলায় স্পষ্টভাবে সেরা।
   * llama-3.3-70b আড়ষ্ট বাংলা লেখে, gpt-oss-120b ভুল শব্দ বানায়।
   */
  groq: {
    apiKey: env('GROQ_API_KEY'),
    models: [env('GROQ_MODEL', 'qwen/qwen3.6-27b'), env('GROQ_FALLBACK_MODEL', 'openai/gpt-oss-20b')].filter(Boolean),
  },

  facebook: {
    pageId: env('FB_PAGE_ID'),
    pageToken: env('FB_PAGE_TOKEN'),
    apiVersion: env('FB_API_VERSION', 'v24.0'),
  },

  supabase: {
    url: env('SUPABASE_URL'),
    serviceKey: env('SUPABASE_SERVICE_KEY'),
  },

  paths: {
    root: ROOT,
    output: path.join(ROOT, 'output'),
    // কার্ড সরাসরি সাইটের public/ এ লিখি — আলাদা কপি করার ধাপ রাখলে
    // ফাইল দুই জায়গায় থেকে বেমিল হওয়ার সুযোগ তৈরি হয়
    cards: path.join(ROOT, 'web', 'public', 'cards'),
    images: path.join(ROOT, 'web', 'public', 'images'),
    articles: path.join(ROOT, 'output', 'articles'),
    state: path.join(ROOT, 'output', 'state.json'),
    templates: path.join(ROOT, 'templates'),
    assets: path.join(ROOT, 'assets'),
  },

  limits: {
    maxArticlesPerRun: Number(env('MAX_ARTICLES_PER_RUN', '40')),
    maxFacebookPosts: Number(env('MAX_FACEBOOK_POSTS', '25')),
    // ফেসবুকের স্প্যাম ডিটেকশন এড়াতে পোস্টগুলো সারাদিনে ছড়িয়ে দিই
    facebookGapMinutes: Number(env('FACEBOOK_GAP_MINUTES', '35')),
    requestTimeoutMs: 30000,
  },

  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
};

export function requireConfig(keys) {
  const missing = [];
  for (const k of keys) {
    const parts = k.split('.');
    let v = config;
    for (const p of parts) v = v?.[p];
    if (!v) missing.push(k);
  }
  if (missing.length) {
    throw new Error(`.env.local এ এই মানগুলো নেই: ${missing.join(', ')}`);
  }
}
