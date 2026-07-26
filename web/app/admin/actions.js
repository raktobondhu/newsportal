'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminQuery, setSetting, logAction } from '../../lib/admin-db.js';
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
