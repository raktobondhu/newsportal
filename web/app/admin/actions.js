'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminQuery, setSetting, logAction } from '../../lib/admin-db.js';
import { PLACEMENT_IDS } from '../../lib/ads.js';
import {
  authenticate,
  createSession,
  destroySession,
  recordLogin,
  requirePermission,
  requireUser,
  hashPassword,
} from '../../lib/auth.js';

/**
 * সব লেখার কাজ Server Action হিসেবে — এগুলোর কোড কখনো ব্রাউজারে যায় না,
 * আর প্রতিটির শুরুতে অনুমতি যাচাই হয়। UI-তে বোতাম লুকানো যথেষ্ট নয়:
 * কেউ সরাসরি অনুরোধ পাঠাতে পারে, তাই সার্ভারেই আটকাতে হবে।
 */

// ---------------------------------------------------------------
// লগইন
// ---------------------------------------------------------------

export async function loginAction(_prev, formData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'ইমেইল ও পাসওয়ার্ড দুটোই দিন' };

  const { user, error } = await authenticate(email, password);
  if (error) return { error };

  await createSession(user);
  await recordLogin(user.id);
  await logAction(user.email, 'login', null);
  redirect('/admin');
}

export async function logoutAction() {
  await destroySession();
  redirect('/admin/login');
}

// ---------------------------------------------------------------
// খবর
// ---------------------------------------------------------------

export async function toggleHiddenAction(slug, hide) {
  const user = await requirePermission('hideArticles');

  await adminQuery(`articles?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: {
      hidden: hide,
      hidden_at: hide ? new Date().toISOString() : null,
      hidden_by: hide ? user.email : null,
    },
  });

  await logAction(user.email, hide ? 'hide' : 'unhide', slug);
  revalidatePath('/admin/articles');
}

export async function updateArticleAction(slug, formData) {
  const user = await requirePermission('editArticles');

  const patch = {
    headline: String(formData.get('headline') ?? '').trim(),
    social_headline: String(formData.get('social_headline') ?? '').trim() || null,
    summary: String(formData.get('summary') ?? '').trim(),
    body: String(formData.get('body') ?? '').trim(),
    category: String(formData.get('category') ?? '').trim(),
    edited_at: new Date().toISOString(),
    edited_by: user.email,
  };

  if (!patch.headline || !patch.body) {
    return { error: 'শিরোনাম ও মূল লেখা খালি রাখা যাবে না' };
  }

  await adminQuery(`articles?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: patch,
  });

  await logAction(user.email, 'edit', slug, { fields: Object.keys(patch) });
  revalidatePath(`/admin/articles/${slug}`);
  revalidatePath('/admin/articles');
  return { ok: true };
}

export async function deleteArticleAction(slug) {
  // মোছা কেবল admin — manager লুকাতে পারে, যা প্রায় সবসময়ই যথেষ্ট
  const user = await requirePermission('deleteArticles');

  await adminQuery(`articles?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });

  await logAction(user.email, 'delete', slug);
  revalidatePath('/admin/articles');
}

/**
 * ম্যানুয়ালি ফেসবুকে পাঠানো — পাইপলাইন যেটা বাদ দিয়েছিল, বা সম্পাদনার
 * পরে আবার পাঠাতে চাইলে।
 */
export async function postToFacebookAction(slug) {
  const user = await requirePermission('postToFacebook');

  const rows = await adminQuery(
    `articles?select=slug,headline,social_headline,summary,tags,card_url,facebook_post_id&slug=eq.${encodeURIComponent(
      slug
    )}&limit=1`
  );
  const a = rows?.[0];
  if (!a) return { error: 'খবরটি পাওয়া যায়নি' };
  if (a.facebook_post_id) return { error: 'এটি আগেই ফেসবুকে পোস্ট হয়েছে' };
  if (!a.card_url) return { error: 'এই খবরের কার্ড নেই, পোস্ট করা যাবে না' };

  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;
  const version = process.env.FB_API_VERSION || 'v24.0';
  if (!pageId || !token) return { error: 'ফেসবুকের সেটিং নেই (FB_PAGE_ID / FB_PAGE_TOKEN)' };

  const parts = [a.social_headline || a.headline];
  if (a.summary) parts.push('', a.summary);
  const tags = (a.tags ?? []).slice(0, 5).map((t) => '#' + String(t).trim().replace(/\s+/g, '_'));
  if (tags.length) parts.push('', tags.join(' '));

  try {
    // কার্ডটা আমাদের Storage-এ পাবলিক URL হিসেবেই আছে, তাই ফাইল আপলোড
    // না করে ফেসবুককে সরাসরি URL দিয়ে দিই — দ্রুত ও সহজ
    const form = new URLSearchParams({
      url: a.card_url,
      message: parts.join('\n'),
      access_token: token,
    });
    const res = await fetch(`https://graph.facebook.com/${version}/${pageId}/photos`, {
      method: 'POST',
      body: form,
    });
    const json = await res.json();
    if (!res.ok) return { error: json?.error?.message ?? `ফেসবুক ত্রুটি ${res.status}` };

    const postId = json.post_id ?? json.id;

    // লিংকটা কমেন্টে — ক্যাপশনে বাইরের লিংক থাকলে ফেসবুক রিচ কমায়
    const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
    if (siteUrl && postId) {
      await fetch(`https://graph.facebook.com/${version}/${postId}/comments`, {
        method: 'POST',
        body: new URLSearchParams({
          message: `বিস্তারিত: ${siteUrl}/news/${a.slug}`,
          access_token: token,
        }),
      }).catch(() => {});
    }

    await adminQuery(`articles?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { facebook_post_id: postId, facebook_posted_at: new Date().toISOString() },
    });

    await logAction(user.email, 'post', slug, { postId });
    revalidatePath('/admin/articles');
    return { ok: true, postId };
  } catch (err) {
    return { error: err.message };
  }
}

// ---------------------------------------------------------------
// সেটিংস
// ---------------------------------------------------------------

export async function updateSettingAction(key, value) {
  const user = await requirePermission('manageSettings');
  await setSetting(key, value, user.email);
  await logAction(user.email, 'settings', key, { value });
  revalidatePath('/admin/settings');
  revalidatePath('/admin');
}

// ---------------------------------------------------------------
// বিজ্ঞাপন
// ---------------------------------------------------------------

/**
 * বিজ্ঞাপন বসালে বা বদলালে যে পাতাগুলো নতুন করে আঁকতে হয়।
 *
 * পাতাগুলো ISR — ৬০ সেকেন্ড পর এমনিতেই নতুন হতো। কিন্তু বিজ্ঞাপন
 * বসিয়ে সঙ্গে সঙ্গে সাইটে গিয়ে দেখতে না পেলে মনে হয় কাজ করেনি, আর
 * ক্লায়েন্টকে দেখানোর সময় সেটা বিব্রতকর।
 *
 * '/news/[slug]' — টাইপ ধরে সব খবরের পাতা একসাথে; প্রতিটি স্ল্যাগ ধরে
 * আলাদা ডাকা অসম্ভব, শত শত পাতা আছে।
 */
function revalidateAdSurfaces() {
  revalidatePath('/');
  revalidatePath('/news/[slug]', 'page');
  revalidatePath('/category/[category]', 'page');
  revalidatePath('/admin/ads');
}

const ALLOWED_AD_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_AD_BYTES = 3 * 1024 * 1024;

export async function createAdAction(_prev, formData) {
  const user = await requirePermission('manageAds');

  const name = String(formData.get('name') ?? '').trim();
  const placement = String(formData.get('placement') ?? '').trim();
  const linkUrl = String(formData.get('link_url') ?? '').trim();
  const alt = String(formData.get('alt') ?? '').trim();
  const sort = Number(formData.get('sort') ?? 0);
  const startsAt = String(formData.get('starts_at') ?? '').trim();
  const endsAt = String(formData.get('ends_at') ?? '').trim();
  const file = formData.get('image');

  if (!name) return { error: 'বিজ্ঞাপনের একটা নাম দিন' };
  if (!PLACEMENT_IDS.includes(placement)) return { error: 'জায়গাটি ঠিক নয়' };
  if (!file || typeof file === 'string' || file.size === 0) {
    return { error: 'ছবি বাছাই করুন' };
  }
  if (file.size > MAX_AD_BYTES) {
    return { error: `ছবিটি বড় (${Math.round(file.size / 1024)} KB) — সর্বোচ্চ ৩ MB` };
  }

  const ext = ALLOWED_AD_TYPES[file.type];
  if (!ext) return { error: 'কেবল GIF, PNG, WebP বা JPG চলবে' };

  // লিংক থাকলে সেটি http/https কি না দেখে নিই। javascript: বসিয়ে দিলে
  // /go রুট সেটি আটকাত, কিন্তু ভুলটা এখানেই ধরা পড়া ভালো — নাহলে
  // বিজ্ঞাপন বসানোর পর নীরবে হোমপেজে ফেরত পাঠাত, কেউ বুঝত না কেন।
  if (linkUrl) {
    try {
      const u = new URL(linkUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
    } catch {
      return { error: 'লিংকটি http:// বা https:// দিয়ে শুরু হতে হবে' };
    }
  }

  if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt)) {
    return { error: 'শুরুর তারিখ শেষের তারিখের পরে হতে পারে না' };
  }

  // ফাইলের নাম আমরা নিজেরাই বানাই, আপলোডকারীর দেওয়া নাম ব্যবহার করি না —
  // বাংলা বা ফাঁকাযুক্ত নামে Storage আপত্তি করে, আর একই নামের দুটো
  // ফাইল একে অন্যকে মুছে দিত।
  const objectName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  try {
    const url = await uploadAdImage(objectName, file);
    await adminQuery('ads', {
      method: 'POST',
      prefer: 'return=minimal',
      body: [
        {
          name,
          placement,
          image_url: url,
          link_url: linkUrl || null,
          alt: alt || null,
          sort: Number.isFinite(sort) ? sort : 0,
          starts_at: startsAt || null,
          ends_at: endsAt || null,
          created_by: user.email,
        },
      ],
    });
  } catch (err) {
    return { error: err.message };
  }

  await logAction(user.email, 'ad', name, { action: 'create', placement });
  revalidateAdSurfaces();
  return { ok: true };
}

/** Supabase Storage-এ আপলোড করে পাবলিক URL ফেরত দেয় */
async function uploadAdImage(objectName, file) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY সেট নেই');

  const res = await fetch(`${base}/storage/v1/object/ads/${objectName}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': file.type,
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body: Buffer.from(await file.arrayBuffer()),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (/bucket not found/i.test(text)) {
      throw new Error('Storage-এ "ads" বাকেট নেই — pipeline-এ node test/setup-buckets.mjs চালান');
    }
    throw new Error(`ছবি আপলোড হয়নি (${res.status}) ${text.slice(0, 120)}`);
  }

  return `${base}/storage/v1/object/public/ads/${objectName}`;
}

export async function toggleAdAction(id, active) {
  const user = await requirePermission('manageAds');

  await adminQuery(`ads?id=eq.${Number(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { active },
  });

  await logAction(user.email, 'ad', String(id), { action: active ? 'activate' : 'deactivate' });
  revalidateAdSurfaces();
}

export async function deleteAdAction(id) {
  const user = await requirePermission('manageAds');

  // Storage থেকে ছবিটাও মুছি — নাহলে বাতিল বিজ্ঞাপনের ছবি বছরের পর
  // বছর জমতে থাকত, আর সেগুলোর পাবলিক URL খোলাই থেকে যেত।
  try {
    const rows = await adminQuery(`ads?select=image_url&id=eq.${Number(id)}&limit=1`);
    const url = rows?.[0]?.image_url ?? '';
    const objectName = url.split('/storage/v1/object/public/ads/')[1];
    if (objectName) {
      const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
      // Content-Type ইচ্ছাকৃতভাবে দেওয়া হয়নি। 'application/json' বসালে
      // Storage 400 দেয় — "Body cannot be empty when content-type is set
      // to 'application/json'" — আর ছবিটা রয়ে যায়। সারিটা তখনো মুছত,
      // তাই প্যানেলে সব ঠিক দেখাত অথচ ছবির পাবলিক URL খোলাই থাকত।
      await fetch(`${base}/storage/v1/object/ads/${objectName}`, {
        method: 'DELETE',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
      });
    }
  } catch {
    // ছবি মুছতে না পারলেও সারিটা মোছা হোক — নাহলে বিজ্ঞাপন দেখাতেই থাকত
  }

  await adminQuery(`ads?id=eq.${Number(id)}`, { method: 'DELETE', prefer: 'return=minimal' });

  await logAction(user.email, 'ad', String(id), { action: 'delete' });
  revalidateAdSurfaces();
}

// ---------------------------------------------------------------
// ব্যবহারকারী
// ---------------------------------------------------------------

export async function createUserAction(_prev, formData) {
  const user = await requirePermission('manageUsers');

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const role = String(formData.get('role') ?? 'manager');

  if (!email || !name || !password) return { error: 'সব ঘর পূরণ করুন' };
  if (password.length < 8) return { error: 'পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে' };
  if (!['admin', 'manager'].includes(role)) return { error: 'রোল ঠিক নয়' };

  const existing = await adminQuery(`admin_users?select=id&email=eq.${encodeURIComponent(email)}&limit=1`);
  if (existing?.length) return { error: 'এই ইমেইলে অ্যাকাউন্ট আগেই আছে' };

  await adminQuery('admin_users', {
    method: 'POST',
    prefer: 'return=minimal',
    body: [{ email, name, role, password_hash: hashPassword(password) }],
  });

  await logAction(user.email, 'user', email, { action: 'create', role });
  revalidatePath('/admin/users');
  return { ok: true };
}

export async function setUserActiveAction(id, active) {
  const user = await requirePermission('manageUsers');

  // নিজেকে নিষ্ক্রিয় করে ফেললে আর কেউ ঢুকতে পারবে না — তাই আটকাই
  if (Number(id) === Number(user.id) && !active) {
    return { error: 'নিজের অ্যাকাউন্ট নিষ্ক্রিয় করা যাবে না' };
  }

  await adminQuery(`admin_users?id=eq.${id}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { active },
  });

  await logAction(user.email, 'user', String(id), { action: active ? 'activate' : 'deactivate' });
  revalidatePath('/admin/users');
  return { ok: true };
}

export async function resetPasswordAction(_prev, formData) {
  const user = await requirePermission('manageUsers');
  const id = formData.get('id');
  const password = String(formData.get('password') ?? '');

  if (password.length < 8) return { error: 'পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে' };

  await adminQuery(`admin_users?id=eq.${id}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { password_hash: hashPassword(password) },
  });

  await logAction(user.email, 'user', String(id), { action: 'reset-password' });
  revalidatePath('/admin/users');
  return { ok: true };
}

/** নিজের পাসওয়ার্ড বদলানো — যেকোনো রোলের জন্য */
export async function changeOwnPasswordAction(_prev, formData) {
  const user = await requireUser();
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');

  if (next.length < 8) return { error: 'নতুন পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে' };

  const { error } = await authenticate(user.email, current);
  if (error) return { error: 'বর্তমান পাসওয়ার্ড ভুল' };

  await adminQuery(`admin_users?id=eq.${user.id}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { password_hash: hashPassword(next) },
  });

  await logAction(user.email, 'user', user.email, { action: 'change-own-password' });
  return { ok: true };
}
